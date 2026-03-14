// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only
//
// This file is part of ScreenHand.
//
// ScreenHand is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, version 3.
//
// ScreenHand is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with ScreenHand. If not, see <https://www.gnu.org/licenses/>.

import { EventEmitter } from "node:events";
import type { AppContext } from "../types.js";
import type { WorldModel } from "../state/world-model.js";
import type { AXSource } from "./ax-source.js";
import type { CDPSource } from "./cdp-source.js";
import type { VisionSource } from "./vision-source.js";
import type {
  PerceptionCoordinatorConfig,
  PerceptionEvent,
  PerceptionStats,
  ROI,
} from "./types.js";
import { DEFAULT_PERCEPTION_CONFIG, createEmptyStats } from "./types.js";
import type { LearningEngine } from "../learning/engine.js";
import { acquireCaptureLock, releaseCaptureLock } from "../observer/state.js";

/**
 * PerceptionCoordinator — manages multi-rate perception sources and feeds
 * results into the world model.
 *
 * Runs three interval loops at different rates:
 * - FAST (100ms): AX push events + CDP mutations (event-driven, cheap)
 * - MEDIUM (500ms): AX tree poll + CDP DOM snapshot (structured, moderate)
 * - SLOW (2000ms): Screenshot diff + ROI OCR (visual, expensive)
 *
 * The coordinator runs in the MCP server process. Heavy work (capture/OCR)
 * is delegated to the native bridge (separate process) or observer daemon.
 */
export class PerceptionCoordinator extends EventEmitter {
  private readonly config: PerceptionCoordinatorConfig;
  private stats: PerceptionStats;

  private fastTimer: ReturnType<typeof setInterval> | null = null;
  private mediumTimer: ReturnType<typeof setInterval> | null = null;
  private slowTimer: ReturnType<typeof setInterval> | null = null;

  private activePid: number | null = null;
  private activeWindowId: number | null = null;
  private activeAppContext: AppContext | null = null;
  private cdpClient: any = null;

  private running = false;
  private learningEngine: LearningEngine | null = null;

  constructor(
    private readonly worldModel: WorldModel,
    private readonly axSource: AXSource | null,
    private readonly cdpSource: CDPSource | null,
    private readonly visionSource: VisionSource | null,
    config?: Partial<PerceptionCoordinatorConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_PERCEPTION_CONFIG, ...config };
    this.stats = createEmptyStats();
  }

  /**
   * Inject the learning engine for recording sensor outcomes.
   */
  setLearningEngine(engine: LearningEngine): void {
    this.learningEngine = engine;
  }

  /**
   * Start continuous perception loops.
   */
  async start(
    appContext: AppContext,
    cdpClient?: any,
  ): Promise<void> {
    if (this.running) return;

    this.activePid = appContext.pid;
    this.activeWindowId = appContext.windowId ?? null;
    this.activeAppContext = appContext;
    this.cdpClient = cdpClient ?? null;
    this.running = true;
    this.stats = createEmptyStats();
    this.stats.started = true;
    this.stats.startedAt = new Date().toISOString();

    // Start AX observation
    if (this.config.enableAX && this.axSource && this.activePid) {
      try {
        await this.axSource.startObserving(this.activePid);
      } catch {
        // AX not available
      }
    }

    // Install CDP mutation observer
    if (this.config.enableCDP && this.cdpSource && this.cdpClient) {
      try {
        await this.cdpSource.installMutationObserver(this.cdpClient);
      } catch {
        // CDP not available
      }
    }

    // Start interval loops — catch errors to prevent unhandled rejections
    this.fastTimer = setInterval(() => {
      void this.fastCycle().catch(() => {});
    }, this.config.fastIntervalMs);

    this.mediumTimer = setInterval(() => {
      void this.mediumCycle().catch(() => {});
    }, this.config.mediumIntervalMs);

    if (this.config.enableVision) {
      this.slowTimer = setInterval(() => {
        void this.slowCycle().catch(() => {});
      }, this.config.slowIntervalMs);
    }

    this.emit("started", appContext);
  }

  /**
   * Stop all perception loops.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.fastTimer) {
      clearInterval(this.fastTimer);
      this.fastTimer = null;
    }
    if (this.mediumTimer) {
      clearInterval(this.mediumTimer);
      this.mediumTimer = null;
    }
    if (this.slowTimer) {
      clearInterval(this.slowTimer);
      this.slowTimer = null;
    }

    if (this.axSource && this.activePid) {
      try {
        await this.axSource.stopObserving(this.activePid);
      } catch {
        // ignore
      }
    }

    this.activePid = null;
    this.activeWindowId = null;
    this.activeAppContext = null;
    this.cdpClient = null;
    this.stats.started = false;

    this.emit("stopped");
  }

  /**
   * Switch perception to a new app/window context.
   */
  async switchContext(
    appContext: AppContext,
    cdpClient?: any,
  ): Promise<void> {
    await this.stop();
    this.visionSource?.reset();
    this.cdpSource?.reset();
    await this.start(appContext, cdpClient);
  }

  /**
   * Get current perception statistics.
   */
  getStats(): PerceptionStats {
    return { ...this.stats };
  }

  /**
   * Get a perception freshness summary for intelligence wrapper hints.
   */
  getFreshnessSummary(): string {
    if (!this.stats.started) return "Perception: not active";

    const now = Date.now();
    const STALE_THRESHOLD_MS = 5_000;
    const sources: string[] = [];
    const warnings: string[] = [];

    // Per-source detail
    if (this.config.enableAX) {
      if (this.stats.lastAXAt) {
        const ageMs = now - new Date(this.stats.lastAXAt).getTime();
        sources.push(`AX: ${ageMs}ms ago`);
        if (ageMs > STALE_THRESHOLD_MS) warnings.push("AX");
      } else {
        sources.push("AX: no data yet");
      }
    } else {
      sources.push("AX: DISABLED");
    }

    if (this.config.enableCDP) {
      if (this.stats.lastCDPAt) {
        const ageMs = now - new Date(this.stats.lastCDPAt).getTime();
        sources.push(`CDP: ${ageMs}ms ago`);
        if (ageMs > STALE_THRESHOLD_MS) warnings.push("CDP");
      } else {
        sources.push("CDP: no data yet");
      }
    } else {
      sources.push("CDP: DISABLED");
    }

    if (this.config.enableVision) {
      if (this.stats.lastVisionAt) {
        const ageMs = now - new Date(this.stats.lastVisionAt).getTime();
        sources.push(`Vision: ${ageMs}ms ago`);
        if (ageMs > STALE_THRESHOLD_MS) warnings.push("Vision");
      } else {
        sources.push("Vision: no data yet");
      }
    } else {
      sources.push("Vision: DISABLED");
    }

    let summary = `Perception: ${sources.join(", ")}`;
    if (warnings.length > 0) {
      summary += ` ⚠ STALE: ${warnings.join(", ")} (>5s)`;
    }
    return summary;
  }

  get isRunning(): boolean {
    return this.running;
  }

  getConfig(): PerceptionCoordinatorConfig {
    return { ...this.config };
  }

  // ── Loop implementations ──

  private async fastCycle(): Promise<void> {
    if (!this.running) return;
    const timestamp = new Date().toISOString();

    // Drain AX events
    if (this.config.enableAX && this.axSource) {
      const axEvent = this.axSource.drainEvents();
      if (axEvent && axEvent.data.type === "ax_events") {
        this.stats.axEventsProcessed += axEvent.data.events.length;
        this.worldModel.ingestUIEvents(axEvent.data.events);
        this.emit("perception", axEvent);
      }
    }

    // Drain CDP mutations
    if (this.config.enableCDP && this.cdpSource) {
      const cdpEvent = this.cdpSource.drainMutations();
      if (cdpEvent && cdpEvent.data.type === "cdp_mutations") {
        this.stats.cdpMutationsProcessed += cdpEvent.data.mutations.length;
        this.emit("perception", cdpEvent);
      }
    }

    this.stats.fastCycles++;
    this.stats.lastFastAt = timestamp;
  }

  private async mediumCycle(): Promise<void> {
    if (!this.running) return;
    const timestamp = new Date().toISOString();

    // Determine sensor polling order — use learning engine ranking if available
    const sensorOrder = this.getMediumCycleSensorOrder();

    for (const sensor of sensorOrder) {
      if (sensor === "ax") {
        await this.pollAX();
      } else if (sensor === "cdp") {
        await this.pollCDP();
      }
    }

    this.stats.mediumCycles++;
    this.stats.lastMediumAt = timestamp;
  }

  /**
   * Determine the order to poll sensors in the medium cycle.
   * If the learning engine has ranked data for the current app, use that order.
   * Otherwise, fall back to the default: AX → CDP.
   */
  private getMediumCycleSensorOrder(): Array<"ax" | "cdp"> {
    const defaultOrder: Array<"ax" | "cdp"> = [];
    if (this.config.enableAX && this.axSource && this.activePid && this.activeWindowId !== null) {
      defaultOrder.push("ax");
    }
    if (this.config.enableCDP && this.cdpSource && this.cdpClient) {
      defaultOrder.push("cdp");
    }

    if (!this.learningEngine || !this.activeAppContext || defaultOrder.length <= 1) {
      return defaultOrder;
    }

    const ranked = this.learningEngine.rankSensors(this.activeAppContext.bundleId);
    if (ranked.length === 0) return defaultOrder;

    // Build ordered list from ranking, only including sensors that are available
    const available = new Set(defaultOrder);
    const ordered: Array<"ax" | "cdp"> = [];
    for (const { sourceType } of ranked) {
      const s = sourceType as "ax" | "cdp";
      if (available.has(s)) {
        ordered.push(s);
        available.delete(s);
      }
    }
    // Append any remaining sensors not covered by ranking
    for (const s of defaultOrder) {
      if (available.has(s)) {
        ordered.push(s);
      }
    }

    return ordered;
  }

  private async pollAX(): Promise<void> {
    if (
      !this.config.enableAX ||
      !this.axSource ||
      !this.activePid ||
      this.activeWindowId === null ||
      !this.activeAppContext
    ) return;

    const axStart = Date.now();
    const treeEvent = await this.axSource.pollAXTree(
      this.activePid,
      this.activeWindowId,
      this.activeAppContext,
    );
    const axLatency = Date.now() - axStart;
    const axSuccess = !!(treeEvent && treeEvent.data.type === "ax_tree");
    if (treeEvent && treeEvent.data.type === "ax_tree") {
      this.stats.axTreePolls++;
      this.stats.lastAXAt = new Date().toISOString();
      this.worldModel.ingestAXTree(
        treeEvent.data.windowId,
        treeEvent.data.tree,
        treeEvent.data.appContext,
      );
      this.emit("perception", treeEvent);
    }
    if (this.learningEngine && this.activeAppContext) {
      this.learningEngine.recordSensorOutcome({
        bundleId: this.activeAppContext.bundleId,
        sourceType: "ax",
        success: axSuccess,
        latencyMs: axLatency,
      });
    }
  }

  private async pollCDP(): Promise<void> {
    if (!this.config.enableCDP || !this.cdpSource || !this.cdpClient) return;

    const cdpStart = Date.now();
    const snapEvent = await this.cdpSource.pollSnapshot(this.cdpClient);
    const cdpLatency = Date.now() - cdpStart;
    const cdpSuccess = !!(snapEvent && snapEvent.data.type === "cdp_snapshot");
    if (snapEvent && snapEvent.data.type === "cdp_snapshot") {
      this.stats.cdpSnapshots++;
      this.stats.lastCDPAt = new Date().toISOString();
      if (this.activeAppContext) {
        this.worldModel.ingestCDPSnapshot(
          this.activeAppContext.bundleId,
          snapEvent.data.url,
          snapEvent.data.title,
        );
      }
      this.emit("perception", snapEvent);
    }
    if (this.learningEngine && this.activeAppContext) {
      this.learningEngine.recordSensorOutcome({
        bundleId: this.activeAppContext.bundleId,
        sourceType: "cdp",
        success: cdpSuccess,
        latencyMs: cdpLatency,
      });
    }
  }

  private async slowCycle(): Promise<void> {
    if (!this.running || !this.visionSource || this.activeWindowId === null)
      return;
    const timestamp = new Date().toISOString();

    // Acquire capture lock to prevent concurrent captures with observer daemon
    if (!acquireCaptureLock()) {
      return; // Observer daemon is capturing — skip this cycle
    }

    try {
      // Screenshot diff
      const diffEvent = await this.visionSource.captureAndDiff(
        this.activeWindowId,
      );
      if (diffEvent) {
        this.stats.visionDiffs++;
        this.stats.lastVisionAt = new Date().toISOString();
        this.emit("perception", diffEvent);

        // If pixels changed, OCR the changed regions
        if (
          diffEvent.data.type === "vision_diff" &&
          diffEvent.data.changed &&
          diffEvent.data.changedRegions.length > 0
        ) {
          const regionsToOCR = diffEvent.data.changedRegions.slice(
            0,
            this.config.maxROIsPerCycle,
          );

          for (const roi of regionsToOCR) {
            const ocrEvent = await this.visionSource.ocrRegion(
              this.activeWindowId!,
              roi,
            );
            if (ocrEvent) {
              this.stats.visionOCRs++;
              // Merge OCR regions into world model
              if (ocrEvent.data.type === "vision_ocr" && ocrEvent.data.regions.length > 0) {
                this.worldModel.ingestOCRRegions(
                  this.activeWindowId!,
                  ocrEvent.data.regions,
                );
              }
              this.emit("perception", ocrEvent);
            }
          }
        }
      }
      // Record vision sensor outcome
      if (this.learningEngine && this.activeAppContext) {
        this.learningEngine.recordSensorOutcome({
          bundleId: this.activeAppContext.bundleId,
          sourceType: "vision",
          success: !!diffEvent,
          latencyMs: Date.now() - new Date(timestamp).getTime(),
        });
      }
    } catch {
      // Vision source failed (bridge crash, timeout, etc.) — continue running
      if (this.learningEngine && this.activeAppContext) {
        this.learningEngine.recordSensorOutcome({
          bundleId: this.activeAppContext.bundleId,
          sourceType: "vision",
          success: false,
          latencyMs: Date.now() - new Date(timestamp).getTime(),
        });
      }
    } finally {
      releaseCaptureLock();
    }

    this.stats.slowCycles++;
    this.stats.lastSlowAt = timestamp;
  }
}
