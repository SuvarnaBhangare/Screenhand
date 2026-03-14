// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { LearningEngine } from "../src/learning/engine.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-test-"));
}

describe("LearningEngine", () => {
  let dataDir: string;
  let engine: LearningEngine;

  beforeEach(() => {
    dataDir = makeTmpDir();
    engine = new LearningEngine({ dataDir, priorStrength: 2, minSamplesForConfidence: 3 });
    engine.init();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // ── Locator Policy ──────────────────────────────────────────

  it("records locator outcomes and recommends best", () => {
    const bundleId = "com.test.app";
    const actionKey = "click_submit";

    // Locator A: 8 successes, 2 failures
    for (let i = 0; i < 8; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey, locator: "#submit", method: "cdp", success: true });
    }
    for (let i = 0; i < 2; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey, locator: "#submit", method: "cdp", success: false });
    }

    // Locator B: 3 successes, 7 failures
    for (let i = 0; i < 3; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey, locator: "AXButton:Submit", method: "ax", success: true });
    }
    for (let i = 0; i < 7; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey, locator: "AXButton:Submit", method: "ax", success: false });
    }

    const rec = engine.recommendLocator(bundleId, actionKey);
    expect(rec).not.toBeNull();
    expect(rec!.locator).toBe("#submit");
    expect(rec!.method).toBe("cdp");
    expect(rec!.score).toBeGreaterThan(0.5);
  });

  it("returns null for locator with insufficient samples", () => {
    engine.recordLocatorOutcome({
      bundleId: "com.test.app",
      actionKey: "click_btn",
      locator: "#btn",
      method: "cdp",
      success: true,
    });
    // Only 1 sample, minSamplesForConfidence=3
    expect(engine.recommendLocator("com.test.app", "click_btn")).toBeNull();
  });

  // ── Recovery Policy ─────────────────────────────────────────

  it("ranks recovery strategies by success rate", () => {
    const bundleId = "com.test.app";

    // Strategy A: 5 successes
    for (let i = 0; i < 5; i++) {
      engine.recordRecoveryOutcome({
        bundleId,
        blockerType: "unexpected_dialog",
        strategyId: "dismiss_dialog_cancel",
        success: true,
        durationMs: 100,
      });
    }

    // Strategy B: 2 successes, 3 failures
    for (let i = 0; i < 2; i++) {
      engine.recordRecoveryOutcome({
        bundleId,
        blockerType: "unexpected_dialog",
        strategyId: "dismiss_dialog_ok",
        success: true,
        durationMs: 200,
      });
    }
    for (let i = 0; i < 3; i++) {
      engine.recordRecoveryOutcome({
        bundleId,
        blockerType: "unexpected_dialog",
        strategyId: "dismiss_dialog_ok",
        success: false,
        durationMs: 500,
      });
    }

    const ranked = engine.rankRecoveryStrategies("unexpected_dialog", bundleId);
    expect(ranked.length).toBe(2);
    expect(ranked[0]!.strategyId).toBe("dismiss_dialog_cancel");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  // ── Sensor Policy ───────────────────────────────────────────

  it("ranks sensors and recommends best for app", () => {
    const bundleId = "com.figma.Desktop";

    // AX works poorly for Figma (canvas-heavy)
    for (let i = 0; i < 3; i++) {
      engine.recordSensorOutcome({ bundleId, sourceType: "ax", success: true, latencyMs: 50 });
    }
    for (let i = 0; i < 7; i++) {
      engine.recordSensorOutcome({ bundleId, sourceType: "ax", success: false, latencyMs: 50 });
    }

    // OCR works well for Figma
    for (let i = 0; i < 9; i++) {
      engine.recordSensorOutcome({ bundleId, sourceType: "ocr", success: true, latencyMs: 200 });
    }
    engine.recordSensorOutcome({ bundleId, sourceType: "ocr", success: false, latencyMs: 200 });

    const ranked = engine.rankSensors(bundleId);
    expect(ranked.length).toBe(2);
    expect(ranked[0]!.sourceType).toBe("ocr");

    const best = engine.sensors.recommend(bundleId, 3);
    expect(best).toBe("ocr");
  });

  // ── App Summary ─────────────────────────────────────────────

  it("produces correct app summary", () => {
    const bundleId = "com.test.app";

    engine.recordLocatorOutcome({ bundleId, actionKey: "a", locator: "#x", method: "cdp", success: true });
    engine.recordRecoveryOutcome({ bundleId, blockerType: "focus_lost", strategyId: "refocus", success: true, durationMs: 50 });
    engine.recordToolTiming({ tool: "click", bundleId, durationMs: 100, success: true });
    engine.recordSensorOutcome({ bundleId, sourceType: "ax", success: true, latencyMs: 30 });

    const summary = engine.getAppSummary(bundleId);
    expect(summary.locatorEntries).toBe(1);
    expect(summary.recoveryEntries).toBe(1);
    expect(summary.timingSamples).toBe(1);
    expect(summary.sensorEntries).toBe(1);
  });

  // ── Persistence ─────────────────────────────────────────────

  it("persists and reloads across instances", () => {
    const bundleId = "com.persist.app";

    // Record data in engine 1
    for (let i = 0; i < 5; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey: "click_btn", locator: "#btn", method: "cdp", success: true });
    }
    engine.recordRecoveryOutcome({ bundleId, blockerType: "focus_lost", strategyId: "refocus", success: true, durationMs: 80 });
    engine.recordToolTiming({ tool: "click", bundleId, durationMs: 150, success: true });
    engine.recordSensorOutcome({ bundleId, sourceType: "cdp", success: true, latencyMs: 40 });

    engine.flush();

    // Create engine 2 from same directory
    const engine2 = new LearningEngine({ dataDir, priorStrength: 2, minSamplesForConfidence: 3 });
    engine2.init();

    const rec = engine2.recommendLocator(bundleId, "click_btn");
    expect(rec).not.toBeNull();
    expect(rec!.locator).toBe("#btn");
    expect(rec!.successCount).toBe(5);

    const ranked = engine2.rankRecoveryStrategies("focus_lost", bundleId);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.strategyId).toBe("refocus");

    const sensors = engine2.rankSensors(bundleId);
    expect(sensors.length).toBe(1);
    expect(sensors[0]!.sourceType).toBe("cdp");
  });

  // ── Cold Start ──────────────────────────────────────────────

  it("handles cold start gracefully (no data)", () => {
    const rec = engine.recommendLocator("com.unknown.app", "action");
    expect(rec).toBeNull();

    const ranked = engine.rankRecoveryStrategies("focus_lost", "com.unknown.app");
    expect(ranked).toEqual([]);

    const sensors = engine.rankSensors("com.unknown.app");
    expect(sensors).toEqual([]);

    const budget = engine.getAdaptiveBudget("com.unknown.app");
    // Falls back to defaults
    expect(budget.locateMs).toBe(800);
    expect(budget.actMs).toBe(200);
    expect(budget.verifyMs).toBe(2000);
  });

  // ── Score Adjustment ────────────────────────────────────────

  it("adjusts score on failure without resetting", () => {
    const bundleId = "com.test.app";
    const actionKey = "click_submit";

    // 5 successes
    for (let i = 0; i < 5; i++) {
      engine.recordLocatorOutcome({ bundleId, actionKey, locator: "#submit", method: "cdp", success: true });
    }

    const entries1 = engine.locators.getEntries(bundleId, actionKey);
    const scoreBefore = entries1[0]!.score;

    // 1 failure
    engine.recordLocatorOutcome({ bundleId, actionKey, locator: "#submit", method: "cdp", success: false });

    const entries2 = engine.locators.getEntries(bundleId, actionKey);
    const scoreAfter = entries2[0]!.score;

    expect(scoreAfter).toBeLessThan(scoreBefore);
    expect(scoreAfter).toBeGreaterThan(0.5); // Still positive — doesn't reset
    expect(entries2[0]!.successCount).toBe(5);
    expect(entries2[0]!.failCount).toBe(1);
  });

  // ── Data Pruning (5.4) ────────────────────────────────────

  it("prunes locator entries to maxEntriesPerFile on save", () => {
    const maxEntries = 10;
    const smallEngine = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 3,
      maxEntriesPerFile: maxEntries,
    });
    smallEngine.init();

    // Insert 15 unique locator entries (different actionKeys to create separate entries)
    for (let i = 0; i < 15; i++) {
      smallEngine.recordLocatorOutcome({
        bundleId: "com.test.app",
        actionKey: `action_${i}`,
        locator: `#el_${i}`,
        method: "cdp",
        success: true,
      });
    }

    // Flush to trigger pruning
    smallEngine.flush();

    // Reload from disk — should have at most maxEntries
    const reloaded = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 3,
      maxEntriesPerFile: maxEntries,
    });
    reloaded.init();

    const entries = reloaded.locators.getAllEntries();
    expect(entries.length).toBeLessThanOrEqual(maxEntries);
    expect(entries.length).toBe(maxEntries);
  });

  it("prunes timing samples to maxEntriesPerFile on save", () => {
    const maxEntries = 10;
    const smallEngine = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 3,
      maxEntriesPerFile: maxEntries,
    });
    smallEngine.init();

    // Insert 15 timing samples with distinct timestamps
    for (let i = 0; i < 15; i++) {
      smallEngine.recordToolTiming({
        tool: `tool_${i}`,
        bundleId: "com.test.app",
        durationMs: 100 + i,
        success: true,
      });
    }

    smallEngine.flush();

    const reloaded = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 3,
      maxEntriesPerFile: maxEntries,
    });
    reloaded.init();

    const samples = reloaded.timing.getAllSamples();
    expect(samples.length).toBeLessThanOrEqual(maxEntries);
  });

  // ── Pattern Policy ────────────────────────────────────────

  it("records patterns and queries by bundleId", () => {
    const bundleId = "com.test.app";

    engine.recordPattern({ bundleId, tool: "click", locator: "#submit", method: "cdp", success: true });
    engine.recordPattern({ bundleId, tool: "click", locator: "#submit", method: "cdp", success: true });
    engine.recordPattern({ bundleId, tool: "click", locator: "#submit", method: "cdp", success: false });
    engine.recordPattern({ bundleId, tool: "type_text", locator: "#email", method: "cdp", success: true });

    const all = engine.queryPatterns(bundleId);
    expect(all.length).toBe(2);
    // #submit has 2 success, 1 fail; #email has 1 success, 0 fail
    // Both should be returned, sorted by score descending

    const clickOnly = engine.queryPatterns(bundleId, "click");
    expect(clickOnly.length).toBe(1);
    expect(clickOnly[0]!.locator).toBe("#submit");
    expect(clickOnly[0]!.successCount).toBe(2);
    expect(clickOnly[0]!.failCount).toBe(1);
  });

  it("recommends best pattern for app×tool with sufficient samples", () => {
    const bundleId = "com.test.app";

    // Not enough samples yet (minSamplesForConfidence=3)
    engine.recordPattern({ bundleId, tool: "click", locator: "#btn", method: "ax", success: true });
    expect(engine.recommendPattern(bundleId, "click")).toBeNull();

    // Add more samples to cross the threshold
    engine.recordPattern({ bundleId, tool: "click", locator: "#btn", method: "ax", success: true });
    engine.recordPattern({ bundleId, tool: "click", locator: "#btn", method: "ax", success: true });

    const rec = engine.recommendPattern(bundleId, "click");
    expect(rec).not.toBeNull();
    expect(rec!.locator).toBe("#btn");
    expect(rec!.score).toBeGreaterThan(0.5);
  });

  it("does not recommend pattern with low success rate", () => {
    const bundleId = "com.test.app";

    // 1 success, 4 failures — score should be <= 0.5
    engine.recordPattern({ bundleId, tool: "click", locator: "#flaky", method: "cdp", success: true });
    for (let i = 0; i < 4; i++) {
      engine.recordPattern({ bundleId, tool: "click", locator: "#flaky", method: "cdp", success: false });
    }

    expect(engine.recommendPattern(bundleId, "click")).toBeNull();
  });

  it("persists patterns to patterns.jsonl and reloads", () => {
    const bundleId = "com.persist.app";

    for (let i = 0; i < 5; i++) {
      engine.recordPattern({ bundleId, tool: "click_text", locator: "Submit", method: "ax", success: true });
    }
    engine.flush();

    // Verify file exists
    expect(fs.existsSync(path.join(dataDir, "patterns.jsonl"))).toBe(true);

    // Reload in new engine
    const engine2 = new LearningEngine({ dataDir, priorStrength: 2, minSamplesForConfidence: 3 });
    engine2.init();

    const patterns = engine2.queryPatterns(bundleId, "click_text");
    expect(patterns.length).toBe(1);
    expect(patterns[0]!.locator).toBe("Submit");
    expect(patterns[0]!.successCount).toBe(5);
  });

  it("includes patternEntries in app summary", () => {
    const bundleId = "com.test.app";
    engine.recordPattern({ bundleId, tool: "click", locator: "#x", method: "cdp", success: true });
    const summary = engine.getAppSummary(bundleId);
    expect(summary.patternEntries).toBe(1);
  });

  it("clears patterns on reset", () => {
    engine.recordPattern({ bundleId: "com.test.app", tool: "click", locator: "#x", method: "cdp", success: true });
    expect(engine.queryPatterns("com.test.app").length).toBe(1);
    engine.reset();
    expect(engine.queryPatterns("com.test.app").length).toBe(0);
  });

  it("keeps most recent entries when pruning by lastUsed", () => {
    const maxEntries = 5;
    const smallEngine = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 1,
      maxEntriesPerFile: maxEntries,
    });
    smallEngine.init();

    // Insert entries with distinct timestamps via spaced-out recording
    // Old entries: bundleId "com.old.app"
    for (let i = 0; i < 5; i++) {
      smallEngine.recordLocatorOutcome({
        bundleId: "com.old.app",
        actionKey: `action_old_${i}`,
        locator: `#old_${i}`,
        method: "ax",
        success: true,
      });
    }

    // Manually set old lastUsed on existing entries
    const oldEntries = smallEngine.locators.getAllEntries();
    for (const entry of oldEntries) {
      entry.lastUsed = "2020-01-01T00:00:00.000Z";
    }

    // New entries: bundleId "com.new.app"
    for (let i = 0; i < 5; i++) {
      smallEngine.recordLocatorOutcome({
        bundleId: "com.new.app",
        actionKey: `action_new_${i}`,
        locator: `#new_${i}`,
        method: "cdp",
        success: true,
      });
    }

    // Total is now 10 entries (5 old + 5 new)
    expect(smallEngine.locators.getAllEntries().length).toBe(10);

    smallEngine.flush();

    const reloaded = new LearningEngine({
      dataDir,
      priorStrength: 2,
      minSamplesForConfidence: 1,
      maxEntriesPerFile: maxEntries,
    });
    reloaded.init();

    const entries = reloaded.locators.getAllEntries();
    expect(entries.length).toBe(maxEntries);
    // All remaining entries should be the new ones (old ones pruned)
    for (const entry of entries) {
      expect(entry.key).toContain("com.new.app");
    }
  });
});
