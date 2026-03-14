// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from "vitest";
import { FrameDiffer } from "../src/perception/frame-differ.js";

describe("frame-differ", () => {
  let differ: FrameDiffer;

  beforeEach(() => {
    differ = new FrameDiffer(64);
  });

  it("identical frames produce same hash", () => {
    const buf = Buffer.alloc(1024, 0xab);
    const h1 = differ.hashBuffer(buf);
    const h2 = differ.hashBuffer(buf);
    expect(h1).toBe(h2);
  });

  it("different frames produce different hash", () => {
    const buf1 = Buffer.alloc(1024, 0xab);
    const buf2 = Buffer.alloc(1024, 0xcd);
    expect(differ.hashBuffer(buf1)).not.toBe(differ.hashBuffer(buf2));
  });

  it("first diff reports no change (no previous frame)", () => {
    const buf = Buffer.alloc(1024, 0xab);
    const result = differ.diff(buf, 32, 32);
    expect(result.changed).toBe(false);
    expect(result.hash).toBeTruthy();
    expect(result.changedRegions).toHaveLength(0);
  });

  it("second diff with same buffer reports no change", () => {
    const buf = Buffer.alloc(1024, 0xab);
    differ.diff(buf, 32, 32);
    const result = differ.diff(Buffer.from(buf), 32, 32);
    expect(result.changed).toBe(false);
  });

  it("second diff with different buffer reports change", () => {
    const buf1 = Buffer.alloc(1024, 0xab);
    const buf2 = Buffer.alloc(1024, 0xcd);
    differ.diff(buf1, 32, 32);
    const result = differ.diff(buf2, 32, 32);
    expect(result.changed).toBe(true);
  });

  it("changed region extraction returns ROIs", () => {
    // Use larger buffers so grid cells are meaningful
    const buf1 = Buffer.alloc(4096, 0xab);
    const buf2 = Buffer.from(buf1);
    // Modify a specific region
    buf2.fill(0xcd, 0, 256);

    differ.diff(buf1, 64, 64);
    const result = differ.diff(buf2, 64, 64);
    expect(result.changed).toBe(true);
    expect(result.changedRegions.length).toBeGreaterThan(0);
    for (const roi of result.changedRegions) {
      expect(roi.reason).toBe("changed_pixels");
      expect(roi.x).toBeGreaterThanOrEqual(0);
      expect(roi.y).toBeGreaterThanOrEqual(0);
      expect(roi.width).toBeGreaterThan(0);
      expect(roi.height).toBeGreaterThan(0);
    }
  });

  it("quickChanged detects change without updating state", () => {
    const buf1 = Buffer.alloc(1024, 0xab);
    const buf2 = Buffer.alloc(1024, 0xcd);

    differ.diff(buf1, 32, 32); // set baseline
    expect(differ.quickChanged(buf2)).toBe(true);
    expect(differ.quickChanged(buf1)).toBe(false);
    // State should NOT have changed (quickChanged is read-only)
    expect(differ.getLastHash()).toBe(differ.hashBuffer(buf1));
  });

  it("reset clears state", () => {
    const buf = Buffer.alloc(1024, 0xab);
    differ.diff(buf, 32, 32);
    expect(differ.getLastHash()).not.toBeNull();

    differ.reset();
    expect(differ.getLastHash()).toBeNull();

    // After reset, first diff should report no change again
    const result = differ.diff(buf, 32, 32);
    expect(result.changed).toBe(false);
  });

  it("handles blank (zero-filled) frames", () => {
    const blank = Buffer.alloc(1024, 0x00);
    const result = differ.diff(blank, 32, 32);
    expect(result.changed).toBe(false);
    expect(result.hash).toBeTruthy();
  });

  it("handles tiny buffers", () => {
    const tiny = Buffer.from([0x01, 0x02, 0x03]);
    const result = differ.diff(tiny, 1, 1);
    expect(result.changed).toBe(false);
    expect(result.hash).toBeTruthy();
  });
});
