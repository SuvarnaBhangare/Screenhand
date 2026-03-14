// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReferenceMerger } from "../src/ingestion/reference-merger.js";
import { CoverageAuditor } from "../src/ingestion/coverage-auditor.js";
import { DocParser } from "../src/ingestion/doc-parser.js";
import { TutorialExtractor } from "../src/ingestion/tutorial-extractor.js";
import type { MenuScanResult, MenuNode } from "../src/ingestion/types.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ingestion-int-test-"));
}

function makeMenuScanResult(overrides?: Partial<MenuScanResult>): MenuScanResult {
  const fileMenu: MenuNode = {
    title: "File",
    shortcut: null,
    enabled: true,
    children: [
      { title: "New Project", shortcut: "Cmd+N", enabled: true, children: [] },
      { title: "Open", shortcut: "Cmd+O", enabled: true, children: [] },
      { title: "Save", shortcut: "Cmd+S", enabled: true, children: [] },
      { title: "Export", shortcut: null, enabled: true, children: [
        { title: "Export as MP4", shortcut: "Shift+Cmd+E", enabled: true, children: [] },
        { title: "Export as MOV", shortcut: null, enabled: true, children: [] },
      ]},
    ],
  };
  const editMenu: MenuNode = {
    title: "Edit",
    shortcut: null,
    enabled: true,
    children: [
      { title: "Undo", shortcut: "Cmd+Z", enabled: true, children: [] },
      { title: "Redo", shortcut: "Shift+Cmd+Z", enabled: true, children: [] },
      { title: "Cut", shortcut: "Cmd+X", enabled: true, children: [] },
      { title: "Copy", shortcut: "Cmd+C", enabled: true, children: [] },
      { title: "Paste", shortcut: "Cmd+V", enabled: true, children: [] },
    ],
  };

  return {
    bundleId: "com.test.videoeditor",
    appName: "TestVideoEditor",
    totalMenus: 2,
    totalItems: 10,
    shortcuts: {
      "File.New Project": "Cmd+N",
      "File.Open": "Cmd+O",
      "File.Save": "Cmd+S",
      "File.Export.Export as MP4": "Shift+Cmd+E",
      "Edit.Undo": "Cmd+Z",
      "Edit.Redo": "Shift+Cmd+Z",
      "Edit.Cut": "Cmd+X",
      "Edit.Copy": "Cmd+C",
      "Edit.Paste": "Cmd+V",
    },
    menuTree: [fileMenu, editMenu],
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Ingestion Integration: Menu Scan → Merge → Audit", () => {
  let refsDir: string;
  let playbooksDir: string;

  beforeEach(() => {
    refsDir = makeTmpDir();
    playbooksDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(refsDir, { recursive: true, force: true });
    fs.rmSync(playbooksDir, { recursive: true, force: true });
  });

  it("merges menu scan into reference and audit detects it", () => {
    const merger = new ReferenceMerger(refsDir);
    const auditor = new CoverageAuditor(refsDir, playbooksDir);
    const scan = makeMenuScanResult();

    // Before merge: empty
    const beforeReport = auditor.audit("com.test.videoeditor", "TestVideoEditor");
    expect(beforeReport.shortcutsKnown).toBe(0);

    // Merge the scan
    const mergeResult = merger.mergeMenuScan(scan);
    expect(mergeResult.added).toBeGreaterThan(0);
    expect(fs.existsSync(mergeResult.filePath)).toBe(true);

    // After merge: shortcuts are visible
    const afterReport = auditor.audit("com.test.videoeditor", "TestVideoEditor");
    expect(afterReport.shortcutsKnown).toBeGreaterThan(0);
  });

  it("audit with live menu scan finds undocumented shortcuts", () => {
    const merger = new ReferenceMerger(refsDir);
    const auditor = new CoverageAuditor(refsDir, playbooksDir);

    // Merge a partial set of shortcuts manually
    merger.mergeDocShortcuts(
      [{ name: "Undo", keys: "Cmd+Z", category: "Edit" }],
      "com.test.videoeditor",
      "TestVideoEditor",
    );

    // Audit with full menu scan — should find undocumented shortcuts
    const scan = makeMenuScanResult();
    const report = auditor.audit("com.test.videoeditor", "TestVideoEditor", scan);

    // We documented only Undo, so everything else should be "not in reference"
    expect(report.shortcutsNotInReference.length).toBeGreaterThan(0);
  });

  it("audit detects missing playbooks for common workflows", () => {
    const auditor = new CoverageAuditor(refsDir, playbooksDir);
    const report = auditor.audit("com.test.videoeditor", "TestVideoEditor");

    expect(report.workflowsWithNoPlaybook.length).toBeGreaterThan(0);
    // "export", "import", "save as", etc. should all be missing
    expect(report.workflowsWithNoPlaybook).toContain("export");
  });

  it("high-value gaps recommend action when nothing is documented", () => {
    const auditor = new CoverageAuditor(refsDir, playbooksDir);
    const report = auditor.audit("com.unknown.app", "UnknownApp");

    expect(report.highValueGaps.length).toBeGreaterThan(0);
    // Should recommend scanning menu bar, exploring selectors, etc.
    const gapsText = report.highValueGaps.join(" ");
    expect(gapsText).toContain("scan_menu_bar");
  });
});

describe("Ingestion Integration: Doc Parse → Merge → Audit", () => {
  let refsDir: string;
  let playbooksDir: string;

  beforeEach(() => {
    refsDir = makeTmpDir();
    playbooksDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(refsDir, { recursive: true, force: true });
    fs.rmSync(playbooksDir, { recursive: true, force: true });
  });

  it("parses HTML docs, merges shortcuts and flows, audits coverage", () => {
    const parser = new DocParser();
    const merger = new ReferenceMerger(refsDir);
    const auditor = new CoverageAuditor(refsDir, playbooksDir);

    const html = `
      <html>
      <head><title>TestApp Keyboard Shortcuts</title></head>
      <body>
        <h1>TestApp Shortcuts</h1>
        <table>
          <tr><td>New File</td><td>Cmd+N</td></tr>
          <tr><td>Save</td><td>Cmd+S</td></tr>
          <tr><td>Quit</td><td>Cmd+Q</td></tr>
        </table>
        <h2>How to Export a Project</h2>
        <ol>
          <li>Click on File > Export > Media</li>
          <li>Select the output format</li>
          <li>Click "Start Export"</li>
        </ol>
      </body>
      </html>
    `;

    // Parse
    const docResult = parser.parse(html, "https://docs.testapp.com/shortcuts", "html");
    expect(docResult.title).toBe("TestApp Keyboard Shortcuts");
    expect(docResult.shortcuts.length).toBeGreaterThan(0);

    // Merge
    const shortcutMerge = merger.mergeDocShortcuts(
      docResult.shortcuts,
      "com.test.app",
      "TestApp",
    );
    const flowMerge = merger.mergeDocFlows(docResult, "com.test.app", "TestApp");
    expect(shortcutMerge.added).toBeGreaterThan(0);

    // Audit
    const report = auditor.audit("com.test.app", "TestApp");
    expect(report.shortcutsKnown).toBeGreaterThan(0);
    expect(report.shortcutsKnown).toBe(shortcutMerge.added);
    expect(report.flowsKnown).toBe(flowMerge.added);
  });

  it("merging the same shortcuts twice doesn't duplicate", () => {
    const merger = new ReferenceMerger(refsDir);

    const shortcuts = [
      { name: "Save", keys: "Cmd+S", category: "File" },
      { name: "Undo", keys: "Cmd+Z", category: "Edit" },
    ];

    const first = merger.mergeDocShortcuts(shortcuts, "com.test.app", "TestApp");
    const second = merger.mergeDocShortcuts(shortcuts, "com.test.app", "TestApp");

    expect(first.added).toBe(2);
    expect(second.added).toBe(0); // Already present
    expect(second.updated).toBe(0);
  });
});

describe("Ingestion Integration: Tutorial → Playbook Steps", () => {
  it("extracts steps from transcript and produces playbook-ready output", () => {
    const extractor = new TutorialExtractor();

    const segments = [
      { text: "Hey guys, welcome back to another tutorial.", startTime: 0, duration: 3 },
      { text: "First, click on the Edit tab at the top.", startTime: 3, duration: 4 },
      { text: "Then select all by pressing Cmd+A.", startTime: 7, duration: 3 },
      { text: "Type your new text in the field.", startTime: 10, duration: 3 },
      { text: "Click on File > Export > PNG.", startTime: 13, duration: 3 },
      { text: "Don't forget to subscribe and like the video.", startTime: 16, duration: 3 },
      { text: "Finally, click Save to confirm.", startTime: 19, duration: 3 },
    ];

    const result = extractor.extract(segments, "How to Edit in TestApp", "test-app");

    // Filler should be filtered out
    expect(result.rawSegments).toBe(7);
    expect(result.actionSegments).toBeGreaterThan(0);
    expect(result.actionSegments).toBeLessThan(result.rawSegments); // Some filtered

    // Convert to playbook steps
    const steps = extractor.toPlaybookSteps(result);
    expect(steps.length).toBeGreaterThan(0);

    // Each step should have action, tool, params, description
    for (const step of steps) {
      expect(step.action).toBeDefined();
      expect(step.tool).toBeDefined();
      expect(step.description).toBeDefined();
    }
  });
});
