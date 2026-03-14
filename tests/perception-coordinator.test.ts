// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PerceptionCoordinator } from "../src/perception/coordinator.js";
import { WorldModel } from "../src/state/world-model.js";
import type { AppContext, UIEvent, AXNode } from "../src/types.js";
import type { AXSource } from "../src/perception/ax-source.js";
import type { CDPSource } from "../src/perception/cdp-source.js";
import type { VisionSource } from "../src/perception/vision-source.js";
import type { LearningEngine } from "../src/learning/engine.js";
import type { PerceptionEvent } from "../src/perception/types.js";
import * as persistence from "../src/state/persistence.js";

vi.mock("../src/state/persistence.js", async () => {
  const actual = await vi.importActual("../src/state/persistence.js") as Record<string, unknown>;
  return {
    ...actual,
    loadWorldState: vi.fn().mockReturnValue(null),
    saveWorldState: vi.fn(),
  };
});

function makeAppContext(): AppContext {
  return {
    bundleId: "com.test.App",
    appName: "TestApp",
    pid: 1234,
    windowTitle: "Test Window",
    windowId: 1,
  };
}

function makeMockAXSource(): AXSource {
  const events: UIEvent[] = [];
  return {
    drainEvents: vi.fn(() => {
      if (events.length === 0) return null;
      const drained = [...events];
      events.length = 0;
      return {
        source: "ax_events" as const,
        rate: "fast" as const,
        timestamp: new Date().toISOString(),
        data: { type: "ax_events" as const, events: drained },
      } satisfies PerceptionEvent;
    }),
    pollAXTree: vi.fn(async (_pid: number, windowId: number, appContext: AppContext) => {
      return {
        source: "ax_tree" as const,
        rate: "medium" as const,
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_tree" as const,
          windowId,
          tree: {
            role: "window",
            title: "Test",
            children: [
              { role: "button", title: "OK", position: { x: 10, y: 20 }, size: { width: 80, height: 30 } },
            ],
          } satisfies AXNode,
          appContext,
        },
      } satisfies PerceptionEvent;
    }),
    startObserving: vi.fn(async () => {}),
    stopObserving: vi.fn(async () => {}),
    isObserving: false,
    _pushEvent(event: UIEvent) { events.push(event); },
  } as unknown as AXSource & { _pushEvent(event: UIEvent): void };
}

function makeMockCDPSource(): CDPSource {
  return {
    installMutationObserver: vi.fn(async () => {}),
    drainMutations: vi.fn(() => null),
    pollSnapshot: vi.fn(async () => ({
      source: "cdp_snapshot" as const,
      rate: "medium" as const,
      timestamp: new Date().toISOString(),
      data: {
        type: "cdp_snapshot" as const,
        url: "https://example.com",
        title: "Example",
        nodeCount: 42,
      },
    } satisfies PerceptionEvent)),
    reset: vi.fn(),
    processCDPConsoleMessage: vi.fn(),
  } as unknown as CDPSource;
}

function makeMockVisionSource(): VisionSource {
  return {
    captureAndDiff: vi.fn(async () => ({
      source: "vision_diff" as const,
      rate: "slow" as const,
      timestamp: new Date().toISOString(),
      data: {
        type: "vision_diff" as const,
        changed: false,
        hash: "abc123",
        changedRegions: [],
        captureMs: 50,
      },
    } satisfies PerceptionEvent)),
    ocrRegion: vi.fn(async () => null),
    reset: vi.fn(),
  } as unknown as VisionSource;
}

describe("perception-coordinator", () => {
  let worldModel: WorldModel;
  let coordinator: PerceptionCoordinator;
  let axSource: ReturnType<typeof makeMockAXSource>;
  let cdpSource: ReturnType<typeof makeMockCDPSource>;
  let visionSource: ReturnType<typeof makeMockVisionSource>;

  beforeEach(() => {
    vi.useFakeTimers();
    worldModel = new WorldModel({ persistDebounceMs: 0 });
    worldModel.init("test-session");

    axSource = makeMockAXSource();
    cdpSource = makeMockCDPSource();
    visionSource = makeMockVisionSource();

    coordinator = new PerceptionCoordinator(
      worldModel,
      axSource as unknown as AXSource,
      cdpSource as unknown as CDPSource,
      visionSource as unknown as VisionSource,
      {
        fastIntervalMs: 100,
        mediumIntervalMs: 500,
        slowIntervalMs: 2000,
      },
    );
  });

  afterEach(async () => {
    await coordinator.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts and stops cleanly", async () => {
    expect(coordinator.isRunning).toBe(false);

    await coordinator.start(makeAppContext());
    expect(coordinator.isRunning).toBe(true);

    const stats = coordinator.getStats();
    expect(stats.started).toBe(true);
    expect(stats.startedAt).toBeTruthy();

    await coordinator.stop();
    expect(coordinator.isRunning).toBe(false);
  });

  it("starts AX observation on start", async () => {
    await coordinator.start(makeAppContext());
    expect(axSource.startObserving).toHaveBeenCalledWith(1234);
  });

  it("installs CDP mutation observer on start", async () => {
    const cdpClient = {};
    await coordinator.start(makeAppContext(), cdpClient);
    expect(cdpSource.installMutationObserver).toHaveBeenCalledWith(cdpClient);
  });

  it("runs fast cycle at correct interval", async () => {
    await coordinator.start(makeAppContext());

    // Advance by 100ms (fast interval)
    await vi.advanceTimersByTimeAsync(100);
    expect(axSource.drainEvents).toHaveBeenCalled();

    const stats = coordinator.getStats();
    expect(stats.fastCycles).toBeGreaterThanOrEqual(1);
  });

  it("AX events flow to world model", async () => {
    const mockAX = axSource as unknown as { _pushEvent: (e: UIEvent) => void };
    mockAX._pushEvent({
      type: "value_changed",
      timestamp: new Date().toISOString(),
      pid: 1234,
      elementRole: "textField",
      elementLabel: "Name",
      newValue: "Updated",
    });

    // Manually mock drainEvents to return the event and feed world model
    (axSource.drainEvents as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      source: "ax_events",
      rate: "fast",
      timestamp: new Date().toISOString(),
      data: {
        type: "ax_events",
        events: [{
          type: "value_changed",
          timestamp: new Date().toISOString(),
          pid: 1234,
          elementRole: "textField",
          elementLabel: "Name",
          newValue: "Updated",
        }],
      },
    });

    const events: PerceptionEvent[] = [];
    coordinator.on("perception", (e: PerceptionEvent) => events.push(e));

    await coordinator.start(makeAppContext());
    await vi.advanceTimersByTimeAsync(100);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const axEvent = events.find(e => e.source === "ax_events");
    expect(axEvent).toBeDefined();

    const stats = coordinator.getStats();
    expect(stats.axEventsProcessed).toBeGreaterThan(0);
  });

  it("runs medium cycle with AX tree poll", async () => {
    await coordinator.start(makeAppContext());

    await vi.advanceTimersByTimeAsync(500);

    expect(axSource.pollAXTree).toHaveBeenCalled();
    const stats = coordinator.getStats();
    expect(stats.mediumCycles).toBeGreaterThanOrEqual(1);
    expect(stats.axTreePolls).toBeGreaterThanOrEqual(1);
  });

  it("runs slow cycle with vision diff", async () => {
    await coordinator.start(makeAppContext());

    await vi.advanceTimersByTimeAsync(2000);

    expect(visionSource.captureAndDiff).toHaveBeenCalledWith(1);
    const stats = coordinator.getStats();
    expect(stats.slowCycles).toBeGreaterThanOrEqual(1);
    expect(stats.visionDiffs).toBeGreaterThanOrEqual(1);
  });

  it("handles missing sources gracefully", async () => {
    const minimal = new PerceptionCoordinator(
      worldModel,
      null,
      null,
      null,
    );

    await minimal.start(makeAppContext());
    await vi.advanceTimersByTimeAsync(2100);

    const stats = minimal.getStats();
    expect(stats.fastCycles).toBeGreaterThan(0);
    expect(stats.mediumCycles).toBeGreaterThan(0);

    await minimal.stop();
  });

  it("pauses when stopped", async () => {
    await coordinator.start(makeAppContext());
    await coordinator.stop();

    const callsBefore = (axSource.drainEvents as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    const callsAfter = (axSource.drainEvents as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(callsAfter).toBe(callsBefore);
  });

  it("switchContext resets and restarts", async () => {
    await coordinator.start(makeAppContext());
    expect(coordinator.isRunning).toBe(true);

    const newCtx = makeAppContext();
    newCtx.bundleId = "com.other.App";
    newCtx.pid = 5678;
    newCtx.windowId = 2;

    await coordinator.switchContext(newCtx);
    expect(coordinator.isRunning).toBe(true);
    expect(visionSource.reset).toHaveBeenCalled();
    expect(cdpSource.reset).toHaveBeenCalled();
  });

  it("getFreshnessSummary returns useful info", async () => {
    expect(coordinator.getFreshnessSummary()).toContain("not active");

    await coordinator.start(makeAppContext());
    await vi.advanceTimersByTimeAsync(100);

    const summary = coordinator.getFreshnessSummary();
    expect(summary).toContain("Perception:");
    expect(summary).not.toContain("not active");
  });

  it("OCRs changed regions when vision detects changes", async () => {
    (visionSource.captureAndDiff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: "vision_diff",
      rate: "slow",
      timestamp: new Date().toISOString(),
      data: {
        type: "vision_diff",
        changed: true,
        hash: "def456",
        changedRegions: [
          { x: 100, y: 200, width: 128, height: 128, reason: "changed_pixels" },
        ],
        captureMs: 100,
      },
    });

    (visionSource.ocrRegion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: "vision_ocr",
      rate: "slow",
      timestamp: new Date().toISOString(),
      data: {
        type: "vision_ocr",
        roi: { x: 100, y: 200, width: 128, height: 128, reason: "changed_pixels" },
        text: "Save As...",
        regions: [],
        latencyMs: 80,
      },
    });

    await coordinator.start(makeAppContext());
    await vi.advanceTimersByTimeAsync(2000);

    expect(visionSource.ocrRegion).toHaveBeenCalled();
    const stats = coordinator.getStats();
    expect(stats.visionOCRs).toBeGreaterThanOrEqual(1);
  });

  it("smoke test: full lifecycle — start, run all rates, read state, stop", async () => {
    // Simulates: npm run dev → observer_start → perception_status
    await coordinator.start(makeAppContext());

    // Run long enough for all 3 rates to fire
    await vi.advanceTimersByTimeAsync(2100);

    const stats = coordinator.getStats();
    expect(stats.started).toBe(true);
    expect(stats.fastCycles).toBeGreaterThan(0);
    expect(stats.mediumCycles).toBeGreaterThan(0);
    expect(stats.slowCycles).toBeGreaterThan(0);

    // perception_status equivalent
    const freshness = coordinator.getFreshnessSummary();
    expect(freshness).toContain("Perception:");
    expect(freshness).not.toContain("not active");

    // world_state equivalent
    const state = worldModel.getState();
    // AX tree polls should have populated the world model
    expect(state.windows.size).toBeGreaterThanOrEqual(1);

    await coordinator.stop();
    expect(coordinator.isRunning).toBe(false);
  });

  it("daemon crash isolation: vision source failure does not stop coordinator", async () => {
    // Simulate bridge/daemon crash: all vision calls throw
    (visionSource.captureAndDiff as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Bridge process crashed"),
    );

    await coordinator.start(makeAppContext());

    // Run through multiple slow cycles — vision fails but coordinator continues
    await vi.advanceTimersByTimeAsync(4100);

    expect(coordinator.isRunning).toBe(true);

    // Fast and medium loops still ran despite vision failure
    const stats = coordinator.getStats();
    expect(stats.fastCycles).toBeGreaterThan(10);
    expect(stats.mediumCycles).toBeGreaterThan(2);
    // Vision diffs may be 0 since all calls threw, but coordinator survived
    expect(stats.slowCycles).toBeGreaterThanOrEqual(1);

    // AX tree polls still populated the world model
    expect(worldModel.getState().windows.size).toBeGreaterThanOrEqual(1);

    await coordinator.stop();
  });

  it("memory bounded: extended run stays within limits", async () => {
    // Simulate 300 fast cycles, 60 medium cycles, 15 slow cycles (≈30s of wall time)
    // Each cycle creates events/data — verify no unbounded growth

    // Make AX source return varying events each cycle
    let callCount = 0;
    (axSource.drainEvents as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return {
        source: "ax_events",
        rate: "fast",
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_events",
          events: [{
            type: "value_changed" as const,
            timestamp: new Date().toISOString(),
            pid: 1234,
            elementRole: "textField",
            elementLabel: `Field_${callCount % 10}`,
            newValue: `Value_${callCount}`,
          }],
        },
      };
    });

    await coordinator.start(makeAppContext());

    // Advance 30 simulated seconds
    await vi.advanceTimersByTimeAsync(30_000);

    const stats = coordinator.getStats();
    expect(stats.fastCycles).toBeGreaterThan(100);
    expect(stats.mediumCycles).toBeGreaterThan(30);

    // World model controls should be bounded by maxControlsPerWindow (500 default)
    const state = worldModel.getState();
    for (const win of state.windows.values()) {
      expect(win.controls.size).toBeLessThanOrEqual(500);
    }

    // Dialogs should not grow unbounded (cleared on each ingest)
    expect(state.activeDialogs.length).toBeLessThan(100);

    // Coordinator stats are just counters — O(1) memory
    expect(typeof stats.fastCycles).toBe("number");
    expect(typeof stats.axEventsProcessed).toBe("number");

    await coordinator.stop();
  });

  it("uses learning engine ranking to order medium cycle sensors", async () => {
    // Create a learning engine that ranks CDP above AX for this app
    const mockLearning = {
      rankSensors: vi.fn().mockReturnValue([
        { sourceType: "cdp", score: 0.95, avgLatencyMs: 10 },
        { sourceType: "ax", score: 0.60, avgLatencyMs: 80 },
      ]),
      recordSensorOutcome: vi.fn(),
    } as unknown as LearningEngine;

    coordinator.setLearningEngine(mockLearning);

    // Track call order
    const callOrder: string[] = [];
    (axSource.pollAXTree as ReturnType<typeof vi.fn>).mockImplementation(async (...args: any[]) => {
      callOrder.push("ax");
      return {
        source: "ax_tree",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_tree",
          windowId: args[1],
          tree: { role: "window", title: "Test", children: [] },
          appContext: args[2],
        },
      };
    });
    (cdpSource.pollSnapshot as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("cdp");
      return {
        source: "cdp_snapshot",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: { type: "cdp_snapshot", url: "https://example.com", title: "Example", nodeCount: 42 },
      };
    });

    const cdpClient = {};
    await coordinator.start(makeAppContext(), cdpClient);
    await vi.advanceTimersByTimeAsync(500);

    // CDP should be polled before AX since learning engine ranked it higher
    expect(callOrder[0]).toBe("cdp");
    expect(callOrder[1]).toBe("ax");
    expect(mockLearning.rankSensors).toHaveBeenCalledWith("com.test.App");
  });

  it("falls back to default order when no learning engine", async () => {
    const callOrder: string[] = [];
    (axSource.pollAXTree as ReturnType<typeof vi.fn>).mockImplementation(async (...args: any[]) => {
      callOrder.push("ax");
      return {
        source: "ax_tree",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_tree",
          windowId: args[1],
          tree: { role: "window", title: "Test", children: [] },
          appContext: args[2],
        },
      };
    });
    (cdpSource.pollSnapshot as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("cdp");
      return {
        source: "cdp_snapshot",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: { type: "cdp_snapshot", url: "https://example.com", title: "Example", nodeCount: 42 },
      };
    });

    const cdpClient = {};
    await coordinator.start(makeAppContext(), cdpClient);
    await vi.advanceTimersByTimeAsync(500);

    // Default order: AX first, then CDP
    expect(callOrder[0]).toBe("ax");
    expect(callOrder[1]).toBe("cdp");
  });

  it("falls back to default order when ranking returns empty", async () => {
    const mockLearning = {
      rankSensors: vi.fn().mockReturnValue([]),
      recordSensorOutcome: vi.fn(),
    } as unknown as LearningEngine;

    coordinator.setLearningEngine(mockLearning);

    const callOrder: string[] = [];
    (axSource.pollAXTree as ReturnType<typeof vi.fn>).mockImplementation(async (...args: any[]) => {
      callOrder.push("ax");
      return {
        source: "ax_tree",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_tree",
          windowId: args[1],
          tree: { role: "window", title: "Test", children: [] },
          appContext: args[2],
        },
      };
    });
    (cdpSource.pollSnapshot as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("cdp");
      return {
        source: "cdp_snapshot",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: { type: "cdp_snapshot", url: "https://example.com", title: "Example", nodeCount: 42 },
      };
    });

    const cdpClient = {};
    await coordinator.start(makeAppContext(), cdpClient);
    await vi.advanceTimersByTimeAsync(500);

    expect(callOrder[0]).toBe("ax");
    expect(callOrder[1]).toBe("cdp");
  });
});
