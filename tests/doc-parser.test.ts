// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest";
import { DocParser } from "../src/ingestion/doc-parser.js";

describe("DocParser", () => {
  const parser = new DocParser();

  it("extracts title from HTML", () => {
    const html = "<html><head><title>Photoshop Shortcuts</title></head><body></body></html>";
    const result = parser.parse(html, "https://example.com/ps", "html");
    expect(result.title).toBe("Photoshop Shortcuts");
  });

  it("extracts title from markdown", () => {
    const md = "# DaVinci Resolve Guide\n\nSome content here.";
    const result = parser.parse(md, "https://example.com/davinci", "markdown");
    expect(result.title).toBe("DaVinci Resolve Guide");
  });

  it("falls back to Untitled when no title found", () => {
    const result = parser.parse("Just some text", "https://example.com", "text");
    expect(result.title).toBe("Untitled");
  });

  it("extracts shortcuts from HTML tables", () => {
    const html = `
      <table>
        <tr><th>Action</th><th>Shortcut</th></tr>
        <tr><td>Copy</td><td>Cmd+C</td></tr>
        <tr><td>Paste</td><td>Cmd+V</td></tr>
      </table>
    `;
    const result = parser.parse(html, "https://example.com", "html");
    expect(result.shortcuts).toHaveLength(2);
    expect(result.shortcuts[0]!.name).toBe("Copy");
    expect(result.shortcuts[0]!.keys).toBe("Cmd+C");
  });

  it("extracts shortcuts from markdown", () => {
    const md = `
# Shortcuts

## Editing
| Action | Keys |
| --- | --- |
| Undo | Cmd+Z |
| Redo | Shift+Cmd+Z |
    `;
    const result = parser.parse(md, "https://example.com", "markdown");
    expect(result.shortcuts.length).toBeGreaterThanOrEqual(2);
    expect(result.shortcuts.find((s) => s.name === "Undo")?.keys).toBe("Cmd+Z");
  });

  it("extracts flows from numbered steps", () => {
    const md = `
# How to Export a Video

1. Open your project in the timeline
2. Click File > Export > Media
3. Choose the output format
4. Click Start Render
    `;
    const result = parser.parse(md, "https://example.com", "markdown");
    expect(result.flows.length).toBeGreaterThanOrEqual(1);
    expect(result.flows[0]!.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts tips", () => {
    const md = `
# Guide

Tip: Always save your work before rendering a long project.

Note: Use proxy media for smoother playback on slower machines.
    `;
    const result = parser.parse(md, "https://example.com", "markdown");
    expect(result.tips.length).toBeGreaterThanOrEqual(1);
  });

  it("infers tools from step descriptions", () => {
    const md = `
# Workflow

1. Click on the "File" menu
2. Type your project name
3. Press Cmd+S to save
4. Drag the clip to the timeline
    `;
    const result = parser.parse(md, "https://example.com", "markdown");
    if (result.flows.length > 0) {
      const steps = result.flows[0]!.steps;
      const clickStep = steps.find((s) => s.description.toLowerCase().includes("click"));
      if (clickStep) expect(clickStep.tool).toMatch(/click|menu/);
    }
  });

  it("sets parsedAt timestamp", () => {
    const result = parser.parse("# Test", "https://example.com", "markdown");
    expect(result.parsedAt).toBeTruthy();
    expect(new Date(result.parsedAt).getTime()).not.toBeNaN();
  });

  it("preserves url in result", () => {
    const result = parser.parse("content", "https://example.com/page", "text");
    expect(result.url).toBe("https://example.com/page");
  });
});
