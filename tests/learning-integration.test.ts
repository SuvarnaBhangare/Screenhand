// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Integration tests for all 4 learning loops.
 * These prove that recorded outcomes actually change downstream behavior
 * (planner locator selection, recovery ordering, adaptive budgets, sensor ranking).
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { LearningEngine } from "../src/learning/engine.js";
import { playbookToPlan } from "../src/planner/deterministic.js";
import type { Playbook } from "../src/playbook/types.js";

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `screenhand-learn-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("learning integration", () => {
  let engine: LearningEngine;
  let dataDir: string;

  beforeEach(() => {
    dataDir = makeTmpDir();
    engine = new LearningEngine({ dataDir });
    engine.init();
  });

  // ── 1. Locator loop: learned locators flow into planner ──

  it("planner prefers locator A after 10 successes", () => {
    const bundleId = "com.test.LocatorApp";
    const action = "click_with_fallback";

    // Record 10 successes with locator A
    for (let i = 0; i < 10; i++) {
      engine.recordLocatorOutcome({
        bundleId,
        actionKey: action,
        locator: "#btn-learned",
        method: "ax",
        success: true,
      });
    }

    // Record 3 failures with locator B
    for (let i = 0; i < 3; i++) {
      engine.recordLocatorOutcome({
        bundleId,
        actionKey: action,
        locator: "#btn-old",
        method: "ax",
        success: false,
      });
    }

    // Verify recommendation
    const rec = engine.recommendLocator(bundleId, action);
    expect(rec).not.toBeNull();
    expect(rec!.locator).toBe("#btn-learned");
    expect(rec!.score).toBeGreaterThan(0.7);

    // Verify planner deterministic converter uses the learned locator
    const playbook: Playbook = {
      id: "test",
      name: "Test",
      description: "",
      platform: "test",
      version: "1",
      tags: [],
      successCount: 0,
      failCount: 0,
      steps: [
        { action: "press", target: "#btn-old", description: "Click button" },
      ],
    };

    const plan = playbookToPlan(playbook, undefined, engine, bundleId);
    expect(plan.steps[0]!.params.target).toBe("#btn-learned");
    expect(plan.steps[0]!.params._originalTarget).toBe("#btn-old");
    expect(plan.steps[0]!.params._learnedLocator).toBe(true);
  });

  it("planner keeps original locator when learned score is too low", () => {
    const bundleId = "com.test.WeakLocator";

    // Only 2 successes, 2 failures — score ~0.5
    for (let i = 0; i < 2; i++) {
      engine.recordLocatorOutcome({
        bundleId,
        actionKey: "click_with_fallback",
        locator: "#maybe",
        method: "ax",
        success: true,
      });
      engine.recordLocatorOutcome({
        bundleId,
        actionKey: "click_with_fallback",
        locator: "#maybe",
        method: "ax",
        success: false,
      });
    }

    const rec = engine.recommendLocator(bundleId, "click_with_fallback");
    // Score should be around 0.5 — below the 0.7 threshold
    if (rec) {
      expect(rec.score).toBeLessThan(0.7);
    }

    const playbook: Playbook = {
      id: "test",
      name: "Test",
      description: "",
      platform: "test",
      version: "1",
      tags: [],
      successCount: 0,
      failCount: 0,
      steps: [
        { action: "press", target: "#original", description: "Click" },
      ],
    };

    const plan = playbookToPlan(playbook, undefined, engine, bundleId);
    expect(plan.steps[0]!.params.target).toBe("#original");
    expect(plan.steps[0]!.params._learnedLocator).toBeUndefined();
  });

  // ── 2. Recovery loop: strategy ranking reflects outcomes ──

  it("ranks successful strategy first after 5 successes", () => {
    const bundleId = "com.test.RecoveryApp";
    const blockerType = "unexpected_dialog" as const;

    // Strategy A: 5 successes
    for (let i = 0; i < 5; i++) {
      engine.recordRecoveryOutcome({
        bundleId,
        blockerType,
        strategyId: "strategy_A",
        success: true,
        durationMs: 200,
      });
    }

    // Strategy B: 5 failures
    for (let i = 0; i < 5; i++) {
      engine.recordRecoveryOutcome({
        bundleId,
        blockerType,
        strategyId: "strategy_B",
        success: false,
        durationMs: 500,
      });
    }

    const ranked = engine.rankRecoveryStrategies(blockerType, bundleId);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked[0]!.strategyId).toBe("strategy_A");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  // ── 3. Timing loop: adaptive budget reflects actual timings ──

  it("adaptive budget adapts after 20 timing samples", () => {
    const bundleId = "com.test.TimingApp";

    // Record 20 fast locate samples (~100ms)
    for (let i = 0; i < 20; i++) {
      engine.recordToolTiming({
        tool: "ui_find",
        bundleId,
        durationMs: 80 + Math.random() * 40, // 80-120ms
        success: true,
      });
    }

    // Record 20 fast act samples (~50ms)
    for (let i = 0; i < 20; i++) {
      engine.recordToolTiming({
        tool: "ui_press",
        bundleId,
        durationMs: 30 + Math.random() * 40, // 30-70ms
        success: true,
      });
    }

    const budget = engine.getAdaptiveBudget(bundleId);

    // With samples around 80-120ms for locate, p95 + 20% should be well under default 800ms
    expect(budget.locateMs).toBeLessThan(400);
    expect(budget.locateMs).toBeGreaterThan(0);

    // Act budget should also be adapted
    expect(budget.actMs).toBeLessThan(400);
    expect(budget.actMs).toBeGreaterThan(0);
  });

  it("adaptive budget returns defaults with insufficient samples", () => {
    const budget = engine.getAdaptiveBudget("com.test.NoData");

    // Default budgets: 800ms locate, 200ms act, 2000ms verify
    expect(budget.locateMs).toBe(800);
    expect(budget.actMs).toBe(200);
    expect(budget.verifyMs).toBe(2000);
  });

  // ── 4. Sensor loop: ranking reflects outcome patterns ──

  it("ranks OCR first after 10 successes vs AX failures", () => {
    const bundleId = "com.figma.Desktop";

    // OCR: 10 successes, fast
    for (let i = 0; i < 10; i++) {
      engine.recordSensorOutcome({
        bundleId,
        sourceType: "ocr",
        success: true,
        latencyMs: 100,
      });
    }

    // AX: 10 failures, slow
    for (let i = 0; i < 10; i++) {
      engine.recordSensorOutcome({
        bundleId,
        sourceType: "ax",
        success: false,
        latencyMs: 500,
      });
    }

    const ranked = engine.rankSensors(bundleId);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked[0]!.sourceType).toBe("ocr");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("returns empty ranking with no sensor data", () => {
    const ranked = engine.rankSensors("com.test.NoSensorData");
    expect(ranked).toEqual([]);
  });

  // ── 5. Persistence: learning survives restart ──

  it("persisted data survives engine restart", () => {
    const bundleId = "com.test.Persist";

    // Record data
    for (let i = 0; i < 10; i++) {
      engine.recordLocatorOutcome({
        bundleId,
        actionKey: "click",
        locator: "#persist-btn",
        method: "cdp",
        success: true,
      });
    }

    // Force save
    engine.save();

    // Create new engine from same data dir
    const engine2 = new LearningEngine({ dataDir });
    engine2.init();

    const rec = engine2.recommendLocator(bundleId, "click");
    expect(rec).not.toBeNull();
    expect(rec!.locator).toBe("#persist-btn");
    expect(rec!.successCount).toBe(10);
  });
});
