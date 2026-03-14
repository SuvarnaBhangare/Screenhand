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

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AXNode, AppContext, UIEvent } from "../types.js";
import type {
  WorldState,
  WindowState,
  ControlState,
  DialogState,
  AppDomainState,
  Tracked,
  WorldModelConfig,
  StateAssertion,
  PostconditionResult,
  GenericAppState,
  BrowserState,
  VideoEditorState,
  ImageEditorState,
  DesignToolState,
  StateTransition,
} from "./types.js";
import { loadWorldState, saveWorldState, DebouncedPersister } from "./persistence.js";

interface DomainSchemaField {
  type?: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
}

interface DomainSchema {
  fields: Record<string, DomainSchemaField>;
  /** If true, reject keys not in fields. Default: false (allow extra keys). */
  strict?: boolean;
}

function validateSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    default: return true;
  }
}

interface StateSnapshot {
  focusedBundleId: string | null;
  focusedWindowId: number | null;
  windowIds: Set<number>;
  windowTitles: Map<number, string>;
  controlCounts: Map<number, number>;
  dialogCount: number;
  dialogTitles: string[];
}

const DEFAULT_CONFIG: WorldModelConfig = {
  confidenceDecayRate: 0.05,
  staleThresholdMs: 5 * 60 * 1000,
  maxControlsPerWindow: 500,
  persistDebounceMs: 500,
};

const DIALOG_ROLES = new Set(["sheet", "dialog", "alert", "popover", "modal"]);

const BUNDLE_FAMILY_MAP: Array<[RegExp, AppDomainState["family"]]> = [
  [/^com\.blackmagic-design\.DaVinciResolve/, "video_editor"],
  [/^com\.adobe\.Premiere/, "video_editor"],
  [/^com\.apple\.FinalCut/, "video_editor"],
  [/^com\.adobe\.Photoshop/, "image_editor"],
  [/^com\.adobe\.Illustrator/, "image_editor"],
  [/^com\.figma\.Desktop$/, "design_tool"],
  [/^com\.apple\.Safari$/, "browser"],
  [/^com\.google\.Chrome/, "browser"],
  [/^org\.mozilla\.firefox$/, "browser"],
  [/^com\.microsoft\.edgemac$/, "browser"],
];

function computeStableId(
  role: string,
  label: string,
  x: number,
  y: number,
): string {
  const qx = Math.round(x / 50) * 50;
  const qy = Math.round(y / 50) * 50;
  const input = `${role}|${label}|${qx},${qy}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function now(): string {
  return new Date().toISOString();
}

function tracked<T>(value: T, stableId?: string): Tracked<T> {
  const t: Tracked<T> = { value, confidence: 1.0, updatedAt: now() };
  if (stableId !== undefined) t.stableId = stableId;
  return t;
}

function applyDecay<T>(
  t: Tracked<T>,
  decayRate: number,
): Tracked<T> {
  const elapsedMs = Date.now() - new Date(t.updatedAt).getTime();
  const elapsedMinutes = elapsedMs / 60_000;
  const decayed = t.confidence * Math.exp(-decayRate * elapsedMinutes);
  return { ...t, confidence: decayed };
}

function detectFamily(bundleId: string): AppDomainState["family"] {
  for (const [pattern, family] of BUNDLE_FAMILY_MAP) {
    if (pattern.test(bundleId)) return family;
  }
  return "generic";
}

function createDefaultDomainState(family: AppDomainState["family"]): AppDomainState {
  switch (family) {
    case "video_editor":
      return {
        family: "video_editor",
        timeline: null,
        activeTrack: null,
        playbackState: tracked("stopped" as const),
        playheadPosition: null,
        selectedClips: tracked([]),
        activeSequence: null,
        activePage: null,
        activeTool: null,
        renderStatus: null,
        mediaOffline: tracked(false),
      } satisfies VideoEditorState;
    case "image_editor":
      return {
        family: "image_editor",
        canvasSize: null,
        activeTool: null,
        activeLayer: null,
        zoom: tracked(1.0),
        layerCount: tracked(0),
        selectedLayers: tracked([]),
        documentSize: null,
      } satisfies ImageEditorState;
    case "design_tool":
      return {
        family: "design_tool",
        activePage: null,
        selectedElements: tracked([]),
        zoom: tracked(1.0),
        activeTool: null,
        sidebarPanel: null,
        canvasSize: null,
      } satisfies DesignToolState;
    case "browser":
      return {
        family: "browser",
        url: null,
        title: null,
      } satisfies BrowserState;
    case "generic":
      return { family: "generic" } satisfies GenericAppState;
  }
}

function createEmptyState(sessionId: string): WorldState {
  return {
    windows: new Map(),
    focusedWindowId: null,
    focusedApp: null,
    activeDialogs: [],
    appDomains: new Map(),
    lastFullScan: now(),
    sessionId,
    expectedPostcondition: null,
    updatedAt: now(),
    confidence: 1.0,
    pendingGoal: null,
    recentTransitions: [],
  };
}

export class WorldModel {
  private state: WorldState;
  private readonly config: WorldModelConfig;
  private readonly persister: DebouncedPersister;
  private readonly domainSchemaCache = new Map<string, DomainSchema | null>();
  private decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<WorldModelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const stateDir = this.config.stateDir;
    this.persister = new DebouncedPersister(
      this.config.persistDebounceMs,
      stateDir ? (s) => saveWorldState(s, stateDir) : undefined,
    );
    this.state = createEmptyState("");
  }

  init(sessionId: string): void {
    const loaded = loadWorldState(sessionId, this.config.stateDir);
    this.state = loaded ?? createEmptyState(sessionId);
  }

  ingestAXTree(
    windowId: number,
    tree: AXNode,
    appContext: AppContext,
  ): void {
    const snap = this.takeSnapshot();
    const controls = new Map<string, ControlState>();
    let count = 0;
    const max = this.config.maxControlsPerWindow;

    const existing = this.state.windows.get(windowId);
    const existingControls = existing?.controls ?? new Map<string, ControlState>();

    const walk = (node: AXNode): void => {
      if (count >= max) return;
      if (!node.role) {
        // Skip decorative nodes but walk children
        if (node.children) {
          for (const child of node.children) walk(child);
        }
        return;
      }

      const label = node.title ?? node.description ?? "";
      const x = node.position?.x ?? 0;
      const y = node.position?.y ?? 0;
      const sid = computeStableId(node.role, label, x, y);

      const prev = existingControls.get(sid);
      const control: ControlState = {
        stableId: sid,
        role: node.role,
        label: prev?.label && prev.label.value === label
          ? prev.label
          : tracked(label, sid),
        value: tracked(node.value ?? null, sid),
        enabled: tracked(node.enabled ?? true, sid),
        focused: node.focused ?? false,
        position: { x, y },
        size: {
          width: node.size?.width ?? 0,
          height: node.size?.height ?? 0,
        },
      };

      // Detect dialogs — do NOT add dialog root to window controls
      if (DIALOG_ROLES.has(node.role)) {
        const dialogType = (
          node.role === "modal" || node.role === "dialog" ? "modal" : node.role
        ) as DialogState["type"];
        const dialogControls = new Map<string, ControlState>();
        // Flatten dialog children into its controls
        if (node.children) {
          for (const child of node.children) {
            if (!child.role) continue;
            const cl = child.title ?? child.description ?? "";
            const cx = child.position?.x ?? 0;
            const cy = child.position?.y ?? 0;
            const csid = computeStableId(child.role, cl, cx, cy);
            dialogControls.set(csid, {
              stableId: csid,
              role: child.role,
              label: tracked(cl, csid),
              value: tracked(child.value ?? null, csid),
              enabled: tracked(child.enabled ?? true, csid),
              focused: child.focused ?? false,
              position: { x: cx, y: cy },
              size: {
                width: child.size?.width ?? 0,
                height: child.size?.height ?? 0,
              },
            });
          }
        }

        // Extract button labels and message from dialog children
        const buttons: string[] = [];
        let message: string | null = null;
        for (const ctrl of dialogControls.values()) {
          if (ctrl.role === "button" && ctrl.label.value) {
            buttons.push(ctrl.label.value);
          }
          if ((ctrl.role === "staticText" || ctrl.role === "text") && ctrl.label.value && ctrl.label.value.length > 10) {
            message = ctrl.label.value;
          }
        }

        // Detect special dialog types from title/message (only for generic modal/alert)
        let detectedType: DialogState["type"] = dialogType;
        if (dialogType === "modal" || dialogType === "alert") {
          const lowerLabel = label.toLowerCase();
          if (lowerLabel.includes("save") || lowerLabel.includes("unsaved")) {
            detectedType = "save";
          } else if (lowerLabel.includes("permission") || lowerLabel.includes("allow") || lowerLabel.includes("access")) {
            detectedType = "permission";
          }
        }

        this.state.activeDialogs.push({
          type: detectedType,
          title: label,
          windowId,
          controls: dialogControls,
          detectedAt: now(),
          message,
          buttons,
          source: "ax",
        });
        // Don't add dialog root or its children as regular window controls
        return;
      }

      controls.set(sid, control);
      count++;

      if (node.children) {
        for (const child of node.children) walk(child);
      }
    };

    // Clear existing dialogs for this window before re-ingesting
    this.state.activeDialogs = this.state.activeDialogs.filter(
      (d) => d.windowId !== windowId,
    );

    walk(tree);

    // Find focused element and interactive controls
    let focusedElement: ControlState | null = null;
    const visibleControls: ControlState[] = [];
    const INTERACTIVE_ROLES = new Set(["button", "checkbox", "radioButton", "textField", "slider", "popUpButton", "menuItem", "link", "tab", "incrementor", "comboBox"]);
    for (const ctrl of controls.values()) {
      if (ctrl.focused) focusedElement = ctrl;
      if (INTERACTIVE_ROLES.has(ctrl.role)) visibleControls.push(ctrl);
    }

    // Collect dialogs for this window from activeDialogs
    const dialogStack = this.state.activeDialogs.filter((d) => d.windowId === windowId);

    const winState: WindowState = {
      windowId,
      title: tracked(appContext.windowTitle),
      bundleId: appContext.bundleId,
      pid: appContext.pid,
      bounds: existing?.bounds ?? tracked({ x: 0, y: 0, width: 0, height: 0 }),
      controls,
      isOnScreen: true,
      focusedElement,
      visibleControls,
      dialogStack,
      scrollPosition: existing?.scrollPosition ?? null,
      lastAXScanAt: now(),
      lastCDPScanAt: existing?.lastCDPScanAt ?? null,
      lastOCRAt: existing?.lastOCRAt ?? null,
      lastScreenshotHash: existing?.lastScreenshotHash ?? null,
    };

    this.state.windows.set(windowId, winState);
    this.state.lastFullScan = now();
    this.state.updatedAt = now();

    // Ensure app domain state exists
    if (!this.state.appDomains.has(appContext.bundleId)) {
      const family = detectFamily(appContext.bundleId);
      this.state.appDomains.set(appContext.bundleId, createDefaultDomainState(family));
    }

    this.recordTransitions(snap, "ax");
    this.schedulePersist();
  }

  ingestUIEvents(events: UIEvent[]): void {
    const snap = this.takeSnapshot();
    for (const event of events) {
      switch (event.type) {
        case "value_changed": {
          if (event.elementRole && event.elementLabel) {
            const control = this.findControlByRoleLabel(
              event.elementRole,
              event.elementLabel,
            );
            if (control) {
              control.value = tracked(event.newValue ?? null, control.stableId);
            }
          }
          break;
        }
        case "focus_changed": {
          if (event.elementRole && event.elementLabel) {
            const control = this.findControlByRoleLabel(
              event.elementRole,
              event.elementLabel,
            );
            if (control) {
              control.focused = true;
            }
          }
          break;
        }
        case "dialog_appeared": {
          this.state.activeDialogs.push({
            type: "modal",
            title: event.windowTitle ?? "",
            windowId: 0,
            controls: new Map(),
            detectedAt: now(),
            message: null,
            buttons: [],
            source: "observer",
          });
          break;
        }
        case "window_closed": {
          // Collect IDs first to avoid Map mutation during iteration
          const toDelete: number[] = [];
          for (const [id, win] of this.state.windows) {
            if (win.pid === event.pid) {
              toDelete.push(id);
            }
          }
          for (const id of toDelete) {
            this.state.windows.delete(id);
          }
          // Purge orphaned dialogs for deleted windows
          if (toDelete.length > 0) {
            const deletedIds = new Set(toDelete);
            this.state.activeDialogs = this.state.activeDialogs.filter(
              (d) => !deletedIds.has(d.windowId),
            );
          }
          break;
        }
      }
    }
    this.state.updatedAt = now();
    this.recordTransitions(snap, "ui_event");
    this.schedulePersist();
  }

  updateFocusedApp(appContext: AppContext): void {
    this.state.focusedApp = {
      bundleId: appContext.bundleId,
      appName: appContext.appName,
      pid: appContext.pid,
    };
    this.state.focusedWindowId = appContext.windowId ?? null;

    // Ensure app domain
    if (!this.state.appDomains.has(appContext.bundleId)) {
      const family = detectFamily(appContext.bundleId);
      this.state.appDomains.set(appContext.bundleId, createDefaultDomainState(family));
    }

    this.state.updatedAt = now();
    this.schedulePersist();
  }

  /** Set/clear the pending goal (used by planner). */
  setPendingGoal(goal: string | null): void {
    this.state.pendingGoal = goal;
    this.state.updatedAt = now();
  }

  getWindowState(windowId: number): WindowState | null {
    const win = this.state.windows.get(windowId);
    if (!win) return null;
    return {
      ...win,
      title: applyDecay(win.title, this.config.confidenceDecayRate),
      bounds: applyDecay(win.bounds, this.config.confidenceDecayRate),
    };
  }

  getFocusedWindow(): WindowState | null {
    if (this.state.focusedWindowId === null) return null;
    return this.getWindowState(this.state.focusedWindowId);
  }

  getControl(stableId: string): ControlState | null {
    for (const win of this.state.windows.values()) {
      const control = win.controls.get(stableId);
      if (control) {
        return {
          ...control,
          label: applyDecay(control.label, this.config.confidenceDecayRate),
          value: applyDecay(control.value, this.config.confidenceDecayRate),
          enabled: applyDecay(control.enabled, this.config.confidenceDecayRate),
        };
      }
    }
    return null;
  }

  getActiveDialogs(): DialogState[] {
    return this.state.activeDialogs;
  }

  getAppDomain(bundleId: string): AppDomainState | null {
    return this.state.appDomains.get(bundleId) ?? null;
  }

  /**
   * Load domain schema from a reference file matching the given bundleId.
   * Scans references/ directory for JSON files with matching bundleId,
   * extracts `domainSchema` key if present, and caches it.
   */
  loadDomainSchema(bundleId: string): DomainSchema | null {
    if (this.domainSchemaCache.has(bundleId)) {
      return this.domainSchemaCache.get(bundleId) ?? null;
    }

    const refsDir = this.config.referencesDir ?? path.join(process.cwd(), "references");
    let schema: DomainSchema | null = null;

    try {
      const files = fs.readdirSync(refsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = fs.readFileSync(path.join(refsDir, file), "utf-8");
          const ref = JSON.parse(raw) as Record<string, unknown>;
          if (ref.bundleId === bundleId && ref.domainSchema) {
            schema = ref.domainSchema as DomainSchema;
            break;
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* dir doesn't exist */ }

    this.domainSchemaCache.set(bundleId, schema);
    return schema;
  }

  /**
   * Update a domain state with partial data, optionally validating against
   * a loaded domain schema. Creates the domain entry if it doesn't exist.
   */
  updateDomainState(bundleId: string, partial: Record<string, unknown>): void {
    let domain = this.state.appDomains.get(bundleId);
    if (!domain) {
      const family = detectFamily(bundleId);
      domain = createDefaultDomainState(family);
      this.state.appDomains.set(bundleId, domain);
    }

    // Apply schema validation if a schema is loaded
    const schema = this.domainSchemaCache.get(bundleId);
    const domainRecord = domain as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(partial)) {
      if (key === "family") continue; // never override family

      if (schema?.fields) {
        const fieldDef = schema.fields[key];
        if (fieldDef) {
          // Validate type if schema specifies one
          if (fieldDef.type && !validateSchemaType(value, fieldDef.type)) {
            continue; // skip invalid value
          }
        }
        // If schema has fields defined but this key isn't in it, skip
        if (schema.strict && !(key in schema.fields)) continue;
      }

      domainRecord[key] = tracked(value);
    }

    this.state.updatedAt = now();
    this.schedulePersist();
  }

  /**
   * Get the focused element from the active window.
   */
  getFocusedElement(): ControlState | null {
    const win = this.getFocusedWindow();
    return win?.focusedElement ?? null;
  }

  /**
   * Get the dialog stack (alias for getActiveDialogs for API symmetry).
   */
  getDialogStack(): DialogState[] {
    return this.state.activeDialogs;
  }

  /**
   * Get the domain state for the currently focused app.
   */
  getDomainState(): AppDomainState | null {
    const bundleId = this.state.focusedApp?.bundleId;
    if (!bundleId) return null;
    return this.state.appDomains.get(bundleId) ?? null;
  }

  /**
   * Get a specific field from the focused app's domain state.
   */
  getDomainField(key: string): unknown {
    const domain = this.getDomainState();
    if (!domain) return undefined;
    return (domain as unknown as Record<string, unknown>)[key];
  }

  /**
   * Get the app family for the currently focused app.
   */
  getAppFamily(): AppDomainState["family"] | null {
    const domain = this.getDomainState();
    return domain?.family ?? null;
  }

  /**
   * Read confidence at a dotted path (e.g. "focusedWindow.title", "control.<stableId>.value").
   */
  getConfidence(path: string): number {
    const parts = path.split(".");
    if (parts[0] === "focusedWindow") {
      const win = this.getFocusedWindow();
      if (!win) return 0;
      const field = parts[1];
      if (field === "title") return win.title.confidence;
      if (field === "bounds") return win.bounds.confidence;
      return 0;
    }
    if (parts[0] === "control" && parts.length >= 3) {
      const ctrl = this.getControl(parts[1]!);
      if (!ctrl) return 0;
      const field = parts[2];
      if (field === "label") return ctrl.label.confidence;
      if (field === "value") return ctrl.value.confidence;
      if (field === "enabled") return ctrl.enabled.confidence;
      return 0;
    }
    if (parts[0] === "state") {
      return this.state.confidence;
    }
    return 0;
  }

  assertState(assertion: StateAssertion): boolean {
    return this.assertStateDetailed(assertion).matched;
  }

  /**
   * Assert state with detailed result including actual value and confidence.
   */
  assertStateDetailed(assertion: StateAssertion): PostconditionResult {
    switch (assertion.type) {
      case "control_exists": {
        const ctrl = this.getControl(assertion.target);
        return {
          matched: ctrl !== null,
          actual: ctrl ? `${ctrl.role} "${ctrl.label.value}"` : null,
          confidence: ctrl ? ctrl.label.confidence : 0,
        };
      }
      case "control_absent": {
        const ctrl = this.getControl(assertion.target);
        return {
          matched: ctrl === null,
          actual: ctrl ? `${ctrl.role} "${ctrl.label.value}"` : null,
          confidence: ctrl === null ? 1.0 : ctrl.label.confidence,
        };
      }
      case "value_equals": {
        const ctrl = this.getControl(assertion.target);
        if (!ctrl) return { matched: false, actual: null, confidence: 0 };
        const actual = ctrl.value.value;
        return {
          matched: actual === assertion.expected,
          actual: actual !== null ? String(actual) : null,
          confidence: ctrl.value.confidence,
        };
      }
      case "control_enabled": {
        const ctrl = this.getControl(assertion.target);
        if (!ctrl) return { matched: false, actual: null, confidence: 0 };
        const expectedEnabled = assertion.expected !== false;
        return {
          matched: ctrl.enabled.value === expectedEnabled,
          actual: String(ctrl.enabled.value),
          confidence: ctrl.enabled.confidence,
        };
      }
      case "window_focused": {
        const matched = this.state.focusedWindowId === Number(assertion.target);
        return {
          matched,
          actual: this.state.focusedWindowId !== null ? String(this.state.focusedWindowId) : null,
          confidence: 1.0,
        };
      }
      case "app_focused": {
        const matched = this.state.focusedApp?.bundleId === assertion.target;
        return {
          matched,
          actual: this.state.focusedApp?.bundleId ?? null,
          confidence: 1.0,
        };
      }
      case "dialog_absent": {
        const found = this.state.activeDialogs.find((d) => d.title === assertion.target);
        return {
          matched: !found,
          actual: found ? `dialog: "${found.title}"` : null,
          confidence: 1.0,
        };
      }
      case "dialog_present": {
        const found = this.state.activeDialogs.find((d) => d.title === assertion.target);
        return {
          matched: !!found,
          actual: found ? `dialog: "${found.title}"` : null,
          confidence: 1.0,
        };
      }
      case "url_equals": {
        // Check browser domain state for URL match
        for (const domain of this.state.appDomains.values()) {
          if (domain.family === "browser" && (domain as BrowserState).url) {
            const urlTracked = (domain as BrowserState).url!;
            const matched = urlTracked.value === assertion.target ||
              urlTracked.value.startsWith(assertion.target);
            return {
              matched,
              actual: urlTracked.value,
              confidence: urlTracked.confidence,
            };
          }
        }
        return { matched: false, actual: null, confidence: 0 };
      }
    }
  }

  /**
   * Set an expected postcondition BEFORE executing an action.
   * Call verifyPostcondition() AFTER the action completes.
   */
  setExpectedPostcondition(assertion: StateAssertion | null): void {
    this.state.expectedPostcondition = assertion;
  }

  /**
   * Verify the previously set postcondition against current state.
   * Returns detailed result with match status, actual value, and confidence.
   * Clears the stored postcondition after verification.
   */
  verifyPostcondition(): PostconditionResult {
    const assertion = this.state.expectedPostcondition;
    if (!assertion) {
      return { matched: true, actual: null, confidence: 1.0 };
    }
    this.state.expectedPostcondition = null;
    return this.assertStateDetailed(assertion);
  }

  getStaleControls(thresholdMs?: number): ControlState[] {
    const threshold = thresholdMs ?? this.config.staleThresholdMs;
    const cutoff = Date.now() - threshold;
    const stale: ControlState[] = [];
    for (const win of this.state.windows.values()) {
      for (const control of win.controls.values()) {
        if (new Date(control.value.updatedAt).getTime() < cutoff) {
          stale.push(control);
        }
      }
    }
    return stale;
  }

  toSummary(): string {
    const winCount = this.state.windows.size;
    let controlCount = 0;
    for (const win of this.state.windows.values()) {
      controlCount += win.controls.size;
    }
    const dialogCount = this.state.activeDialogs.length;
    const focused = this.state.focusedApp;

    const parts: string[] = [];
    parts.push(`${winCount} window(s), ${controlCount} control(s) tracked`);
    if (focused) {
      parts.push(`Focused: ${focused.appName} (${focused.bundleId})`);
    }
    if (dialogCount > 0) {
      parts.push(
        `${dialogCount} active dialog(s): ${this.state.activeDialogs.map((d) => d.title || d.type).join(", ")}`,
      );
    }
    const scanAge = Date.now() - new Date(this.state.lastFullScan).getTime();
    const scanAgeSec = Math.round(scanAge / 1000);
    parts.push(`Last scan: ${scanAgeSec}s ago`);

    return parts.join("\n");
  }

  /**
   * Update browser domain state from a CDP snapshot (url, title).
   */
  ingestCDPSnapshot(bundleId: string, url: string, title: string, windowId?: number): void {
    const snap = this.takeSnapshot();
    let domain = this.state.appDomains.get(bundleId);
    if (!domain) {
      domain = { family: "browser", url: null, title: null };
      this.state.appDomains.set(bundleId, domain);
    }
    if (domain.family === "browser") {
      (domain as BrowserState).url = tracked(url);
      (domain as BrowserState).title = tracked(title);
    }

    // Mark lastCDPScanAt on the window if we know which one
    if (windowId !== undefined) {
      const win = this.state.windows.get(windowId);
      if (win) win.lastCDPScanAt = now();
    } else {
      // Best effort: mark the focused window
      for (const win of this.state.windows.values()) {
        if (win.bundleId === bundleId) {
          win.lastCDPScanAt = now();
          break;
        }
      }
    }

    this.state.updatedAt = now();
    this.recordTransitions(snap, "cdp");
    this.schedulePersist();
  }

  /**
   * Update controls from OCR text regions (vision source).
   * Creates synthetic controls for text regions found by OCR.
   */
  ingestOCRRegions(
    windowId: number,
    regions: Array<{ text: string; bounds: { x: number; y: number; width: number; height: number } }>,
  ): void {
    const snap = this.takeSnapshot();
    const win = this.state.windows.get(windowId);
    if (!win) return;

    for (const region of regions) {
      const sid = computeStableId("staticText", region.text, region.bounds.x, region.bounds.y);
      // Only add if not already tracked by AX
      if (!win.controls.has(sid) && win.controls.size < this.config.maxControlsPerWindow) {
        win.controls.set(sid, {
          stableId: sid,
          role: "staticText",
          label: tracked(region.text, sid),
          value: tracked(region.text, sid),
          enabled: tracked(true, sid),
          focused: false,
          position: { x: region.bounds.x, y: region.bounds.y },
          size: { width: region.bounds.width, height: region.bounds.height },
        });
      }
    }
    win.lastOCRAt = now();
    this.state.updatedAt = now();
    this.recordTransitions(snap, "ocr");
    this.schedulePersist();
  }

  /**
   * Get recent state transitions (max 50, newest last).
   */
  getRecentTransitions(): StateTransition[] {
    return this.state.recentTransitions;
  }

  /**
   * Diff two WorldState objects and return the state transitions between them.
   * Useful for external callers that need to compare snapshots without mutating internal state.
   */
  static diffStates(before: WorldState, after: WorldState): StateTransition[] {
    const ts = now();
    const transitions: StateTransition[] = [];

    // Focus change
    const beforeBundleId = before.focusedApp?.bundleId ?? null;
    const afterBundleId = after.focusedApp?.bundleId ?? null;
    if (beforeBundleId !== afterBundleId) {
      transitions.push({
        from: beforeBundleId ?? "(none)",
        to: afterBundleId ?? "(none)",
        trigger: "diff:focus_changed",
        timestamp: ts,
      });
    }

    // Window added/removed
    const beforeWindowIds = new Set(before.windows.keys());
    const afterWindowIds = new Set(after.windows.keys());
    for (const id of afterWindowIds) {
      if (!beforeWindowIds.has(id)) {
        const win = after.windows.get(id);
        transitions.push({
          from: "(none)",
          to: win?.title.value ?? String(id),
          trigger: "diff:window_added",
          timestamp: ts,
        });
      }
    }
    for (const id of beforeWindowIds) {
      if (!afterWindowIds.has(id)) {
        const win = before.windows.get(id);
        transitions.push({
          from: win?.title.value ?? String(id),
          to: "(none)",
          trigger: "diff:window_removed",
          timestamp: ts,
        });
      }
    }

    // Window title changes
    for (const [id, beforeWin] of before.windows) {
      const afterWin = after.windows.get(id);
      if (afterWin && afterWin.title.value !== beforeWin.title.value) {
        transitions.push({
          from: beforeWin.title.value,
          to: afterWin.title.value,
          trigger: "diff:title_changed",
          timestamp: ts,
        });
      }
    }

    // Dialog count changes
    if (before.activeDialogs.length !== after.activeDialogs.length) {
      transitions.push({
        from: String(before.activeDialogs.length),
        to: String(after.activeDialogs.length),
        trigger: "diff:dialog_count_changed",
        timestamp: ts,
      });
    }

    return transitions;
  }

  flush(): void {
    this.persister.flush();
  }

  getState(): WorldState {
    return this.state;
  }

  /**
   * Capture a lightweight snapshot of key state for diffing.
   */
  private takeSnapshot(): StateSnapshot {
    const windowTitles = new Map<number, string>();
    const controlCounts = new Map<number, number>();
    for (const [id, win] of this.state.windows) {
      windowTitles.set(id, win.title.value);
      controlCounts.set(id, win.controls.size);
    }
    return {
      focusedBundleId: this.state.focusedApp?.bundleId ?? null,
      focusedWindowId: this.state.focusedWindowId,
      windowIds: new Set(this.state.windows.keys()),
      windowTitles,
      controlCounts,
      dialogCount: this.state.activeDialogs.length,
      dialogTitles: this.state.activeDialogs.map((d) => d.title),
    };
  }

  /**
   * Diff a before/after snapshot and record transitions.
   */
  private recordTransitions(before: StateSnapshot, trigger: string): void {
    const ts = now();
    const transitions: StateTransition[] = [];

    // Focus change
    if (before.focusedBundleId !== (this.state.focusedApp?.bundleId ?? null)) {
      transitions.push({
        from: before.focusedBundleId ?? "(none)",
        to: this.state.focusedApp?.bundleId ?? "(none)",
        trigger: `${trigger}:focus_changed`,
        timestamp: ts,
      });
    }

    // Window added/removed
    const afterWindowIds = new Set(this.state.windows.keys());
    for (const id of afterWindowIds) {
      if (!before.windowIds.has(id)) {
        const win = this.state.windows.get(id);
        transitions.push({
          from: "(none)",
          to: win?.title.value ?? String(id),
          trigger: `${trigger}:window_added`,
          timestamp: ts,
        });
      }
    }
    for (const id of before.windowIds) {
      if (!afterWindowIds.has(id)) {
        transitions.push({
          from: before.windowTitles.get(id) ?? String(id),
          to: "(none)",
          trigger: `${trigger}:window_removed`,
          timestamp: ts,
        });
      }
    }

    // Window title changed
    for (const [id, oldTitle] of before.windowTitles) {
      const win = this.state.windows.get(id);
      if (win && win.title.value !== oldTitle) {
        transitions.push({
          from: oldTitle,
          to: win.title.value,
          trigger: `${trigger}:title_changed`,
          timestamp: ts,
        });
      }
    }

    // Dialog count changed
    if (before.dialogCount !== this.state.activeDialogs.length) {
      transitions.push({
        from: String(before.dialogCount),
        to: String(this.state.activeDialogs.length),
        trigger: `${trigger}:dialog_count_changed`,
        timestamp: ts,
      });
    }

    // Control count changed per window
    for (const [id, oldCount] of before.controlCounts) {
      const win = this.state.windows.get(id);
      if (win && win.controls.size !== oldCount) {
        transitions.push({
          from: String(oldCount),
          to: String(win.controls.size),
          trigger: `${trigger}:controls_changed`,
          timestamp: ts,
        });
      }
    }

    if (transitions.length > 0) {
      this.state.recentTransitions.push(...transitions);
      // Cap at 50
      if (this.state.recentTransitions.length > 50) {
        this.state.recentTransitions = this.state.recentTransitions.slice(-50);
      }
    }
  }

  private findControlByRoleLabel(
    role: string,
    label: string,
  ): ControlState | undefined {
    for (const win of this.state.windows.values()) {
      for (const control of win.controls.values()) {
        if (control.role === role && control.label.value === label) {
          return control;
        }
      }
    }
    return undefined;
  }

  /** Start a periodic timer that proactively decays all tracked field confidences. */
  startDecayTimer(intervalMs: number = 10_000): void {
    this.stopDecayTimer();
    this.decayTimer = setInterval(() => {
      this.decayAll();
    }, intervalMs);
    if (this.decayTimer && typeof this.decayTimer === "object" && "unref" in this.decayTimer) {
      this.decayTimer.unref(); // Don't prevent process exit
    }
  }

  /** Stop the decay timer. */
  stopDecayTimer(): void {
    if (this.decayTimer !== null) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
  }

  /** Walk all tracked fields and apply exponential decay in-place. */
  private decayAll(): void {
    const rate = this.config.confidenceDecayRate;
    for (const win of this.state.windows.values()) {
      win.title = applyDecay(win.title, rate);
      win.bounds = applyDecay(win.bounds, rate);
      for (const [id, control] of win.controls) {
        win.controls.set(id, {
          ...control,
          label: applyDecay(control.label, rate),
          value: applyDecay(control.value, rate),
          enabled: applyDecay(control.enabled, rate),
        });
      }
    }
    this.state.updatedAt = now();
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.persister.schedule(this.state);
  }
}
