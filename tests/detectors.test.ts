// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest";
import { detectBlockers } from "../src/recovery/detectors.js";
import type { WorldModel } from "../src/state/world-model.js";

function makeMockWorldModel(overrides?: {
  dialogs?: Array<{ type: string; title: string; windowId: number; controls: Map<any, any>; detectedAt: string }>;
  focusedBundleId?: string | null;
  windowCount?: number;
  staleCount?: number;
}): WorldModel {
  const windows = new Map();
  const count = overrides?.windowCount ?? 1;
  for (let i = 0; i < count; i++) {
    windows.set(i, { windowId: i, controls: new Map(), bundleId: overrides?.focusedBundleId ?? "com.test.app" });
  }

  return {
    getActiveDialogs: vi.fn().mockReturnValue(overrides?.dialogs ?? []),
    getState: vi.fn().mockReturnValue({
      windows,
      focusedApp: overrides?.focusedBundleId !== undefined
        ? (overrides.focusedBundleId ? { bundleId: overrides.focusedBundleId, appName: "Test", pid: 1 } : null)
        : { bundleId: "com.test.app", appName: "Test", pid: 1 },
    }),
    getStaleControls: vi.fn().mockReturnValue(
      Array.from({ length: overrides?.staleCount ?? 0 }, (_, i) => ({ stableId: `s${i}` })),
    ),
    assertState: vi.fn().mockReturnValue(true),
    toSummary: vi.fn().mockReturnValue(""),
    init: vi.fn(),
    ingestAXTree: vi.fn(),
    ingestUIEvents: vi.fn(),
    updateFocusedApp: vi.fn(),
    getWindowState: vi.fn().mockReturnValue(null),
    getFocusedWindow: vi.fn().mockReturnValue(null),
    getControl: vi.fn().mockReturnValue(null),
    getAppDomain: vi.fn().mockReturnValue(null),
    flush: vi.fn(),
  } as unknown as WorldModel;
}

describe("detectBlockers", () => {
  it("detects unexpected_dialog from active dialog", () => {
    const wm = makeMockWorldModel({
      dialogs: [{ type: "modal", title: "Save changes?", windowId: 1, controls: new Map(), detectedAt: new Date().toISOString() }],
    });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers[0]!.type).toBe("unexpected_dialog");
  });

  it("detects permission_dialog from dialog title", () => {
    const wm = makeMockWorldModel({
      dialogs: [{ type: "alert", title: "Allow Accessibility Access", windowId: 1, controls: new Map(), detectedAt: new Date().toISOString() }],
    });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers[0]!.type).toBe("permission_dialog");
  });

  it("detects login_required from dialog title", () => {
    const wm = makeMockWorldModel({
      dialogs: [{ type: "modal", title: "Session expired — Sign In", windowId: 1, controls: new Map(), detectedAt: new Date().toISOString() }],
    });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers[0]!.type).toBe("login_required");
  });

  it("detects focus_lost when bundleId mismatches", () => {
    const wm = makeMockWorldModel({ focusedBundleId: "com.other.app" });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers.some((b) => b.type === "focus_lost")).toBe(true);
  });

  it("detects app_crashed when no focused app and no windows", () => {
    const wm = makeMockWorldModel({ focusedBundleId: null, windowCount: 0 });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers.some((b) => b.type === "app_crashed")).toBe(true);
  });

  it("detects unknown_state from many stale controls", () => {
    const wm = makeMockWorldModel({ staleCount: 15 });
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers.some((b) => b.type === "unknown_state")).toBe(true);
  });

  it("detects element_gone from error text", () => {
    const wm = makeMockWorldModel();
    const blockers = detectBlockers(wm, "LOCATE_FAILED: element not found", "com.test.app");
    expect(blockers.some((b) => b.type === "element_gone")).toBe(true);
  });

  it("detects rate_limited from error text", () => {
    const wm = makeMockWorldModel();
    const blockers = detectBlockers(wm, "Rate limit exceeded", "com.test.app");
    expect(blockers.some((b) => b.type === "rate_limited")).toBe(true);
  });

  it("detects captcha from error text", () => {
    const wm = makeMockWorldModel();
    const blockers = detectBlockers(wm, "CAPTCHA challenge detected", "com.test.app");
    expect(blockers.some((b) => b.type === "captcha")).toBe(true);
  });

  it("detects network_error from error text", () => {
    const wm = makeMockWorldModel();
    const blockers = detectBlockers(wm, "Network error: connection refused", "com.test.app");
    expect(blockers.some((b) => b.type === "network_error")).toBe(true);
  });

  it("falls back to unknown_state on clean state with empty error", () => {
    const wm = makeMockWorldModel();
    const blockers = detectBlockers(wm, "", "com.test.app");
    expect(blockers.length).toBe(1);
    expect(blockers[0]!.type).toBe("unknown_state");
  });

  it("detects selector_drift when element_gone and controls are fresh", () => {
    const freshControls = new Map([
      ["c1", { value: { updatedAt: new Date().toISOString() } }],
    ]);
    const windows = new Map([
      [0, { windowId: 0, controls: freshControls, bundleId: "com.test.app" }],
    ]);

    const wm = {
      getActiveDialogs: vi.fn().mockReturnValue([]),
      getState: vi.fn().mockReturnValue({
        windows,
        focusedApp: { bundleId: "com.test.app", appName: "Test", pid: 1 },
        focusedWindowId: 0,
      }),
      getStaleControls: vi.fn().mockReturnValue([]),
      assertState: vi.fn().mockReturnValue(true),
    } as unknown as WorldModel;

    const blockers = detectBlockers(wm, "Element not found", "com.test.app");
    expect(blockers.some((b) => b.type === "element_gone")).toBe(true);
    expect(blockers.some((b) => b.type === "selector_drift")).toBe(true);
  });

  it("no selector_drift when controls are stale", () => {
    const staleTime = new Date(Date.now() - 30_000).toISOString();
    const staleControls = new Map([
      ["c1", { value: { updatedAt: staleTime } }],
    ]);
    const windows = new Map([
      [0, { windowId: 0, controls: staleControls, bundleId: "com.test.app" }],
    ]);

    const wm = {
      getActiveDialogs: vi.fn().mockReturnValue([]),
      getState: vi.fn().mockReturnValue({
        windows,
        focusedApp: { bundleId: "com.test.app", appName: "Test", pid: 1 },
        focusedWindowId: 0,
      }),
      getStaleControls: vi.fn().mockReturnValue([]),
      assertState: vi.fn().mockReturnValue(true),
    } as unknown as WorldModel;

    const blockers = detectBlockers(wm, "Element not found", "com.test.app");
    expect(blockers.some((b) => b.type === "element_gone")).toBe(true);
    expect(blockers.some((b) => b.type === "selector_drift")).toBe(false);
  });

  it("deduplicates by type", () => {
    const wm = makeMockWorldModel({
      dialogs: [
        { type: "modal", title: "Dialog 1", windowId: 1, controls: new Map(), detectedAt: new Date().toISOString() },
        { type: "alert", title: "Dialog 2", windowId: 1, controls: new Map(), detectedAt: new Date().toISOString() },
      ],
    });
    const blockers = detectBlockers(wm, "", "com.test.app");
    const dialogBlockers = blockers.filter((b) => b.type === "unexpected_dialog");
    expect(dialogBlockers.length).toBe(1);
  });
});
