// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisionSource } from "../src/perception/vision-source.js";
import type { BridgeClient } from "../src/native/bridge-client.js";

function makeMockBridge(): BridgeClient {
  return {
    call: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "cg.captureWindowBuffer") {
        // Return a mock base64-encoded "image"
        const fakeImage = Buffer.alloc(256, 0xab);
        return {
          base64: fakeImage.toString("base64"),
          width: 16,
          height: 16,
        };
      }
      if (method === "cg.captureWindow") {
        return { path: "/tmp/fake-screenshot.png", width: 16, height: 16 };
      }
      if (method === "vision.ocrRegion") {
        return {
          text: "Hello World",
          regions: [
            { text: "Hello", bounds: { x: 10, y: 20, width: 50, height: 15 } },
            { text: "World", bounds: { x: 65, y: 20, width: 50, height: 15 } },
          ],
        };
      }
      if (method === "vision.ocr") {
        return {
          text: "Full OCR text",
          regions: [],
        };
      }
      return {};
    }),
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
  } as unknown as BridgeClient;
}

describe("vision-source", () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let source: VisionSource;

  beforeEach(() => {
    bridge = makeMockBridge();
    source = new VisionSource(bridge as unknown as BridgeClient, 64);
  });

  it("captureAndDiff returns no change on first frame", async () => {
    const result = await source.captureAndDiff(1);
    expect(result).not.toBeNull();
    expect(result!.data.type).toBe("vision_diff");
    if (result!.data.type === "vision_diff") {
      expect(result!.data.changed).toBe(false);
      expect(result!.data.hash).toBeTruthy();
      expect(result!.data.captureMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("captureAndDiff detects change on different frame", async () => {
    await source.captureAndDiff(1);

    // Change the mock to return different data
    (bridge.call as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string) => {
        if (method === "cg.captureWindowBuffer") {
          const differentImage = Buffer.alloc(256, 0xcd);
          return {
            base64: differentImage.toString("base64"),
            width: 16,
            height: 16,
          };
        }
        return {};
      },
    );

    const result = await source.captureAndDiff(1);
    expect(result).not.toBeNull();
    if (result!.data.type === "vision_diff") {
      expect(result!.data.changed).toBe(true);
    }
  });

  it("ocrRegion returns bounded results", async () => {
    const result = await source.ocrRegion(1, {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      reason: "changed_pixels",
    });

    expect(result).not.toBeNull();
    expect(result!.data.type).toBe("vision_ocr");
    if (result!.data.type === "vision_ocr") {
      expect(result!.data.text).toBe("Hello World");
      expect(result!.data.regions).toHaveLength(2);
      expect(result!.data.roi.x).toBe(10);
      expect(result!.data.roi.y).toBe(20);
      expect(result!.data.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("falls back to file-based capture when buffer capture fails", async () => {
    // Make buffer capture fail, file capture returns path
    // Write a real temp file so fs.readFileSync works
    const fs = await import("node:fs");
    const tmpPath = "/tmp/sh-test-vision-source.bin";
    fs.writeFileSync(tmpPath, Buffer.alloc(256, 0xab));

    (bridge.call as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string) => {
        if (method === "cg.captureWindowBuffer") {
          throw new Error("Not supported");
        }
        if (method === "cg.captureWindow") {
          return { path: tmpPath, width: 16, height: 16 };
        }
        return {};
      },
    );

    const result = await source.captureAndDiff(1);
    expect(result).not.toBeNull();
    expect(result!.data.type).toBe("vision_diff");

    // Clean up
    try { fs.unlinkSync(tmpPath); } catch { /* may already be cleaned */ }
  });

  it("reset clears internal state", async () => {
    await source.captureAndDiff(1);
    source.reset();

    // After reset, first diff should report no change
    const result = await source.captureAndDiff(1);
    expect(result).not.toBeNull();
    if (result!.data.type === "vision_diff") {
      expect(result!.data.changed).toBe(false);
    }
  });

  it("returns null on bridge error", async () => {
    (bridge.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Bridge down"),
    );

    const result = await source.captureAndDiff(1);
    expect(result).toBeNull();
  });
});
