// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoverageAuditor } from "../src/ingestion/coverage-auditor.js";
import type { MenuScanResult } from "../src/ingestion/types.js";

// Mock fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue(["davinci.json"]),
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      id: "davinci",
      name: "DaVinci Resolve",
      platform: "davinci-resolve",
      bundleId: "com.blackmagic-design.DaVinciResolveLite",
      shortcuts: {
        Edit: { Undo: "Cmd+Z", Redo: "Shift+Cmd+Z" },
        File: { Save: "Cmd+S" },
      },
      selectors: {
        timeline: { playButton: "AXButton[title='Play']" },
      },
      flows: {
        export_video: { steps: ["Open export", "Set format", "Render"], description: "Export video" },
      },
      errors: [
        { error: "GPU not found", solution: "Install GPU drivers" },
      ],
    }),
  ),
}));

describe("CoverageAuditor", () => {
  let auditor: CoverageAuditor;

  beforeEach(() => {
    auditor = new CoverageAuditor("/tmp/references", "/tmp/playbooks");
  });

  it("counts known shortcuts from reference", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.shortcutsKnown).toBe(3); // Undo, Redo, Save
  });

  it("counts known selectors", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.selectorsKnown).toBe(1);
  });

  it("counts known flows", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.flowsKnown).toBe(1);
  });

  it("counts documented errors", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.errorsDocumented).toBe(1);
  });

  it("detects shortcuts not in reference from menu scan", () => {
    const menuScan: MenuScanResult = {
      bundleId: "com.blackmagic-design.DaVinciResolveLite",
      appName: "DaVinci Resolve",
      totalMenus: 2,
      totalItems: 5,
      shortcuts: {
        "File.New": "Cmd+N",
        "File.Save": "Cmd+S",
        "Edit.Undo": "Cmd+Z",
      },
      menuTree: [],
      scannedAt: new Date().toISOString(),
    };
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
      menuScan,
    );
    // All 3 menu shortcuts should appear since the auditor matches by exact "name:keys"
    // and the ref uses short names (e.g. "Save") while menu scan uses dotted paths ("File.Save")
    expect(report.shortcutsNotInReference.length).toBeGreaterThan(0);
    expect(report.shortcutsNotInReference.some((s) => s.includes("Cmd+N"))).toBe(true);
  });

  it("sets app and bundleId in report", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.app).toBe("DaVinci Resolve");
    expect(report.bundleId).toBe("com.blackmagic-design.DaVinciResolveLite");
  });

  it("sets generatedAt timestamp", () => {
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    expect(report.generatedAt).toBeTruthy();
    expect(new Date(report.generatedAt).getTime()).not.toBeNaN();
  });

  it("handles unknown bundleId gracefully", () => {
    const report = auditor.audit("com.unknown.app", "Unknown App");
    expect(report.shortcutsKnown).toBe(0);
    expect(report.selectorsKnown).toBe(0);
    expect(report.flowsKnown).toBe(0);
  });

  it("matches shortcuts with menu path prefix stripped", () => {
    const menuScan: MenuScanResult = {
      bundleId: "com.blackmagic-design.DaVinciResolveLite",
      appName: "DaVinci Resolve",
      totalMenus: 2,
      totalItems: 3,
      shortcuts: {
        "Edit.Undo": "Cmd+Z",     // Should match ref "Undo: Cmd+Z"
        "File.Save": "Cmd+S",     // Should match ref "Save: Cmd+S"
        "Edit.Redo": "Shift+Cmd+Z", // Should match ref "Redo: Shift+Cmd+Z"
      },
      menuTree: [],
      scannedAt: new Date().toISOString(),
    };
    const report = auditor.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
      menuScan,
    );
    // All 3 menu shortcuts match the reference (after normalization), so none should be "not in reference"
    expect(report.shortcutsNotInReference.length).toBe(0);
  });

  it("strips parenthetical key descriptions", async () => {
    // Mock reference that has parenthetical descriptions in keys
    const { readFileSync } = await import("node:fs");
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      JSON.stringify({
        id: "canva",
        name: "Canva",
        platform: "canva",
        bundleId: "com.canva.CanvaDesktop",
        shortcuts: {
          Edit: { Undo: "Cmd+Z (desktop app)" },
        },
        selectors: {},
        flows: {},
        errors: [],
      }),
    );

    const auditor2 = new CoverageAuditor("/tmp/references", "/tmp/playbooks");
    const menuScan: MenuScanResult = {
      bundleId: "com.canva.CanvaDesktop",
      appName: "Canva",
      totalMenus: 1,
      totalItems: 1,
      shortcuts: { "Edit.Undo": "Cmd+Z" },
      menuTree: [],
      scannedAt: new Date().toISOString(),
    };
    const report = auditor2.audit("com.canva.CanvaDesktop", "Canva", menuScan);
    // "Cmd+Z (desktop app)" should normalize to "cmd+z" matching "Cmd+Z" → "cmd+z"
    expect(report.shortcutsNotInReference.length).toBe(0);
  });

  it("computes playbookSuccessRate from goal store", () => {
    const mockGoalStore = {
      list: vi.fn().mockReturnValue([
        {
          id: "g1",
          status: "completed",
          subgoals: [{ plan: { source: "playbook" } }],
        },
        {
          id: "g2",
          status: "failed",
          subgoals: [{ plan: { source: "playbook" } }],
        },
        {
          id: "g3",
          status: "completed",
          subgoals: [{ plan: { source: "strategy" } }],
        },
      ]),
    };

    const auditorWithGoals = new CoverageAuditor(
      "/tmp/references",
      "/tmp/playbooks",
      undefined,
      mockGoalStore as any,
    );
    const report = auditorWithGoals.audit(
      "com.blackmagic-design.DaVinciResolveLite",
      "DaVinci Resolve",
    );
    // 2 playbook goals, 1 completed → 0.5
    expect(report.playbookSuccessRate).toBeCloseTo(0.5, 2);
  });
});
