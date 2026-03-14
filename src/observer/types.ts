// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Observer types — background app-level visual monitoring
 *
 * The observer daemon watches a single app window via CGWindowListCreateImage,
 * runs OCR only when pixels change, and exposes state via a JSON file.
 * The playbook engine reads this file — zero overhead on the hot path.
 */

import os from "node:os";
import path from "node:path";

/** Snapshot of a single observed frame */
export interface ObserverFrame {
  /** Timestamp of capture */
  capturedAt: string;
  /** OCR text from the frame (only updated when pixels changed) */
  ocrText: string;
  /** Whether this frame differs from the previous one */
  changed: boolean;
}

/** Detected popup that may block execution */
export interface DetectedPopup {
  /** OCR text that matched a popup pattern */
  matchedText: string;
  /** Which pattern matched */
  pattern: string;
  /** Suggested dismissal action */
  dismissAction: "click_ok" | "click_cancel" | "click_close" | "click_allow" | "click_deny" | "press_escape" | "unknown";
  /** Coordinates of the matched text (from OCR bounds if available) */
  x?: number;
  y?: number;
  detectedAt: string;
}

/** Observer state persisted to disk */
export interface ObserverState {
  pid: number;
  running: boolean;
  startedAt: string;
  /** App being watched */
  bundleId: string;
  /** Window being captured */
  windowId: number;
  /** Capture interval */
  intervalMs: number;
  /** Total frames captured */
  framesCaptured: number;
  /** Frames where pixels actually changed */
  framesChanged: number;
  /** OCR runs (only on changed frames) */
  ocrRuns: number;
  /** Latest frame data */
  lastFrame: ObserverFrame | null;
  /** Currently detected popup (null if none) */
  popup: DetectedPopup | null;
  /** Last error encountered */
  lastError: string | null;
}

/** Popup pattern — text to match + how to dismiss */
export interface PopupPattern {
  /** Regex pattern to match against OCR text */
  pattern: string;
  /** How to dismiss this popup */
  action: DetectedPopup["dismissAction"];
  /** Button text to click (for click actions) */
  buttonText?: string;
}

/** Default popup patterns covering common OS and app dialogs */
export const DEFAULT_POPUP_PATTERNS: PopupPattern[] = [
  // Save dialogs
  { pattern: "Do you want to save", action: "click_cancel", buttonText: "Don't Save" },
  { pattern: "Save changes", action: "click_cancel", buttonText: "Don't Save" },
  { pattern: "would you like to save", action: "click_cancel", buttonText: "Don't Save" },
  // Permission dialogs
  { pattern: "would like to access", action: "click_allow", buttonText: "Allow" },
  { pattern: "wants to access", action: "click_allow", buttonText: "Allow" },
  { pattern: "requesting permission", action: "click_allow", buttonText: "Allow" },
  // Cookie banners
  { pattern: "Accept all cookies", action: "click_ok", buttonText: "Accept" },
  { pattern: "cookie preferences", action: "click_ok", buttonText: "Accept All" },
  // Update prompts
  { pattern: "update is available", action: "click_cancel", buttonText: "Later" },
  { pattern: "Remind Me Later", action: "click_cancel", buttonText: "Remind Me Later" },
  { pattern: "Update Now", action: "click_cancel", buttonText: "Not Now" },
  // Generic modals
  { pattern: "Are you sure", action: "click_ok", buttonText: "OK" },
  { pattern: "Close without saving", action: "click_ok", buttonText: "Close" },
  // Chrome specific
  { pattern: "Chrome is being controlled", action: "press_escape" },
  { pattern: "Restore pages", action: "press_escape" },
  // macOS specific
  { pattern: "allow notifications", action: "click_deny", buttonText: "Don't Allow" },
];

/** Command submitted to the observer daemon for targeted OCR */
export interface ObserverCommand {
  /** Unique command ID */
  id: string;
  /** Command type */
  type: "ocr_roi";
  /** Window to capture (uses daemon's windowId if omitted) */
  windowId?: number;
  /** Region of interest for OCR */
  roi: { x: number; y: number; width: number; height: number };
  /** Status lifecycle */
  status: "pending" | "running" | "done" | "error";
  /** ISO timestamp of when the command was submitted */
  createdAt: string;
  /** Result — populated when status is "done" */
  result?: ObserverCommandResult;
  /** Error message — populated when status is "error" */
  error?: string;
}

/** Result of an OCR ROI command */
export interface ObserverCommandResult {
  /** Full OCR text from the region */
  text: string;
  /** Individual text regions with bounds (in window coordinates) */
  regions: Array<{
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  /** When the OCR was performed */
  completedAt: string;
}

export const OBSERVER_DIR = path.join(os.homedir(), ".screenhand", "observer");
export const OBSERVER_STATE_FILE = path.join(OBSERVER_DIR, "state.json");
export const OBSERVER_COMMANDS_FILE = path.join(OBSERVER_DIR, "commands.json");
export const OBSERVER_PID_FILE = path.join(OBSERVER_DIR, "observer.pid");
export const OBSERVER_LOG_FILE = path.join(OBSERVER_DIR, "observer.log");
export const CAPTURE_LOCK_FILE = path.join(OBSERVER_DIR, "capture.lock");
