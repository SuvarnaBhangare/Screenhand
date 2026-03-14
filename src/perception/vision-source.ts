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

import fs from "node:fs";
import type { BridgeClient } from "../native/bridge-client.js";
import type { Bounds } from "../state/types.js";
import type { ROI, PerceptionEvent } from "./types.js";
import { FrameDiffer } from "./frame-differ.js";

/**
 * Vision perception source — screenshot diff + ROI OCR.
 *
 * Uses the native bridge for capture and OCR. Keeps last frame in memory
 * to avoid file I/O on the diff path. Falls back to file-based capture
 * if in-memory buffer capture is not available from the bridge.
 */
export class VisionSource {
  private readonly differ: FrameDiffer;

  constructor(
    private readonly bridge: BridgeClient,
    cellSize = 128,
  ) {
    this.differ = new FrameDiffer(cellSize);
  }

  /**
   * SLOW rate: capture window and diff against last frame.
   * Returns changed status and regions needing OCR.
   */
  async captureAndDiff(windowId: number): Promise<PerceptionEvent | null> {
    const start = Date.now();
    try {
      // Try in-memory buffer capture first (cg.captureWindowBuffer — not yet in native bridges),
      // fall back to file-based capture (cg.captureWindow — always available)
      let buffer: Buffer;
      let width: number;
      let height: number;

      try {
        const result = await this.bridge.call<{
          base64: string;
          width: number;
          height: number;
        }>("cg.captureWindowBuffer", { windowId });
        buffer = Buffer.from(result.base64, "base64");
        width = result.width;
        height = result.height;
      } catch {
        // Fallback: file-based capture
        const fileResult = await this.bridge.call<{
          path: string;
          width: number;
          height: number;
        }>("cg.captureWindow", { windowId });
        buffer = fs.readFileSync(fileResult.path);
        width = fileResult.width;
        height = fileResult.height;
        // Clean up temp file
        try {
          fs.unlinkSync(fileResult.path);
        } catch {
          /* ignore */
        }
      }

      const diffResult = this.differ.diff(buffer, width, height);
      const captureMs = Date.now() - start;

      return {
        source: "vision_diff",
        rate: "slow",
        timestamp: new Date().toISOString(),
        data: {
          type: "vision_diff",
          changed: diffResult.changed,
          hash: diffResult.hash,
          changedRegions: diffResult.changedRegions,
          captureMs,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * OCR a specific region of interest.
   * Uses bridge's vision.ocrRegion if available (not yet in native bridges),
   * falls back to full capture + full OCR via vision.ocr.
   */
  async ocrRegion(
    windowId: number,
    roi: ROI,
  ): Promise<PerceptionEvent | null> {
    const start = Date.now();
    try {
      let text: string;
      let regions: Array<{ text: string; bounds: Bounds }>;

      try {
        // Try ROI-specific OCR
        const result = await this.bridge.call<{
          text: string;
          regions: Array<{ text: string; bounds: Bounds }>;
        }>("vision.ocrRegion", {
          windowId,
          region: { x: roi.x, y: roi.y, width: roi.width, height: roi.height },
        });
        text = result.text;
        regions = result.regions;
      } catch {
        // Fallback: full capture + OCR (less efficient)
        const shot = await this.bridge.call<{ path: string }>(
          "cg.captureWindow",
          { windowId },
        );
        const ocrResult = await this.bridge.call<{
          text: string;
          regions?: Array<{ text: string; bounds: Bounds }>;
        }>("vision.ocr", { imagePath: shot.path });
        text = ocrResult.text;
        regions = ocrResult.regions ?? [];
        try {
          fs.unlinkSync(shot.path);
        } catch {
          /* ignore */
        }
      }

      const latencyMs = Date.now() - start;
      return {
        source: "vision_ocr",
        rate: "slow",
        timestamp: new Date().toISOString(),
        data: {
          type: "vision_ocr",
          roi,
          text,
          regions,
          latencyMs,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Reset differ state (e.g., on context switch to new window).
   */
  reset(): void {
    this.differ.reset();
  }
}
