// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from "vitest";
import { TimingModel } from "../src/learning/timing-model.js";

describe("TimingModel", () => {
  let model: TimingModel;

  beforeEach(() => {
    model = new TimingModel(50);
  });

  it("computes correct p50 and p95", () => {
    const bundleId = "com.test.app";
    // Add 20 samples: 100, 200, 300, ..., 2000
    for (let i = 1; i <= 20; i++) {
      model.record({ tool: "click", bundleId, durationMs: i * 100, success: true });
    }

    const dist = model.getDistribution("click", bundleId);
    expect(dist).not.toBeNull();
    expect(dist!.sampleCount).toBe(20);
    expect(dist!.min).toBe(100);
    expect(dist!.max).toBe(2000);
    // p50 should be around 1000-1100
    expect(dist!.p50).toBeGreaterThanOrEqual(1000);
    expect(dist!.p50).toBeLessThanOrEqual(1100);
    // p95 should be around 1900-2000
    expect(dist!.p95).toBeGreaterThanOrEqual(1900);
    expect(dist!.p95).toBeLessThanOrEqual(2000);
  });

  it("ignores failed samples in distribution", () => {
    const bundleId = "com.test.app";
    model.record({ tool: "click", bundleId, durationMs: 100, success: true });
    model.record({ tool: "click", bundleId, durationMs: 100, success: true });
    // Failed sample with very high duration — should be excluded
    model.record({ tool: "click", bundleId, durationMs: 99999, success: false });

    const dist = model.getDistribution("click", bundleId);
    expect(dist).not.toBeNull();
    expect(dist!.sampleCount).toBe(2); // Only successful
    expect(dist!.max).toBe(100);
  });

  it("returns null for no data", () => {
    expect(model.getDistribution("click", "com.none.app")).toBeNull();
  });

  it("returns null when only failures recorded", () => {
    model.record({ tool: "click", bundleId: "com.test.app", durationMs: 500, success: false });
    expect(model.getDistribution("click", "com.test.app")).toBeNull();
  });

  it("adapts budgets from timing data", () => {
    const bundleId = "com.fast.app";

    // Record locate tool timings (ui_find) — fast app, ~50ms
    for (let i = 0; i < 10; i++) {
      model.record({ tool: "ui_find", bundleId, durationMs: 40 + Math.random() * 20, success: true });
    }

    // Record act tool timings (click) — ~30ms
    for (let i = 0; i < 10; i++) {
      model.record({ tool: "click", bundleId, durationMs: 25 + Math.random() * 10, success: true });
    }

    // Record verify tool timings (screenshot) — ~150ms
    for (let i = 0; i < 10; i++) {
      model.record({ tool: "screenshot", bundleId, durationMs: 130 + Math.random() * 40, success: true });
    }

    const budget = model.getAdaptiveBudget(bundleId, 5);

    // Locate should be much less than default 800ms
    expect(budget.locateMs).toBeLessThan(800);
    expect(budget.locateMs).toBeGreaterThan(0);

    // Act should be much less than default 200ms
    expect(budget.actMs).toBeLessThan(200);
    expect(budget.actMs).toBeGreaterThan(0);

    // Verify should be less than default 2000ms
    expect(budget.verifyMs).toBeLessThan(2000);
    expect(budget.verifyMs).toBeGreaterThan(0);
  });

  it("falls back to defaults with insufficient data", () => {
    const bundleId = "com.sparse.app";

    // Only 2 samples — below minSamples=5
    model.record({ tool: "click", bundleId, durationMs: 100, success: true });
    model.record({ tool: "click", bundleId, durationMs: 120, success: true });

    const budget = model.getAdaptiveBudget(bundleId, 5);
    expect(budget.locateMs).toBe(800);
    expect(budget.actMs).toBe(200);
    expect(budget.verifyMs).toBe(2000);
  });

  it("handles outliers via p95", () => {
    const bundleId = "com.outlier.app";

    // 19 normal samples at ~100ms
    for (let i = 0; i < 19; i++) {
      model.record({ tool: "click", bundleId, durationMs: 100, success: true });
    }
    // 1 outlier at 5000ms
    model.record({ tool: "click", bundleId, durationMs: 5000, success: true });

    const dist = model.getDistribution("click", bundleId);
    expect(dist).not.toBeNull();
    // p50 should be ~100 (not affected by outlier)
    expect(dist!.p50).toBe(100);
    // p95 should be somewhere between 100 and 5000
    expect(dist!.p95).toBeGreaterThan(100);
    // Mean is pulled up by outlier
    expect(dist!.mean).toBeGreaterThan(100);
  });

  it("enforces sliding window max samples", () => {
    const model10 = new TimingModel(10);
    const bundleId = "com.test.app";

    // Add 20 samples
    for (let i = 1; i <= 20; i++) {
      model10.record({ tool: "click", bundleId, durationMs: i * 100, success: true });
    }

    const dist = model10.getDistribution("click", bundleId);
    expect(dist).not.toBeNull();
    // Only last 10 samples kept (1100-2000)
    expect(dist!.sampleCount).toBe(10);
    expect(dist!.min).toBe(1100);
  });

  it("loads and preserves samples across instances", () => {
    const bundleId = "com.test.app";
    for (let i = 0; i < 5; i++) {
      model.record({ tool: "click", bundleId, durationMs: 100 + i * 10, success: true });
    }

    const samples = model.getAllSamples();
    expect(samples.length).toBe(5);

    const model2 = new TimingModel(50);
    model2.loadSamples(samples);

    const dist = model2.getDistribution("click", bundleId);
    expect(dist).not.toBeNull();
    expect(dist!.sampleCount).toBe(5);
  });

  it("invalidates cache on new sample", () => {
    const bundleId = "com.test.app";
    model.record({ tool: "click", bundleId, durationMs: 100, success: true });

    const dist1 = model.getDistribution("click", bundleId);
    expect(dist1!.mean).toBe(100);

    model.record({ tool: "click", bundleId, durationMs: 300, success: true });

    const dist2 = model.getDistribution("click", bundleId);
    expect(dist2!.mean).toBe(200); // (100+300)/2
  });
});
