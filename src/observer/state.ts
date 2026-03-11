// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Observer state helpers — read/write observer state file.
 * Used by: observer-daemon.ts (writes), playbook engine (reads), MCP tools (reads).
 */

import fs from "node:fs";
import { readJsonWithRecovery, writeFileAtomicSync } from "../util/atomic-write.js";
import {
  type ObserverState,
  type DetectedPopup,
  type PopupPattern,
  DEFAULT_POPUP_PATTERNS,
  OBSERVER_DIR,
  OBSERVER_STATE_FILE,
  OBSERVER_PID_FILE,
} from "./types.js";

/** Read current observer state from disk. Returns null if not running. */
export function readObserverState(): ObserverState | null {
  return readJsonWithRecovery<ObserverState>(OBSERVER_STATE_FILE);
}

/** Write observer state to disk (atomic). */
export function writeObserverState(state: ObserverState): void {
  fs.mkdirSync(OBSERVER_DIR, { recursive: true });
  writeFileAtomicSync(OBSERVER_STATE_FILE, JSON.stringify(state, null, 2));
}

/** Get PID of running observer daemon, or null if not running. */
export function getObserverDaemonPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(OBSERVER_PID_FILE, "utf-8").trim());
    if (Number.isNaN(pid)) return null;
    // Check if process is alive
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      // Process not running — stale PID file
      try { fs.unlinkSync(OBSERVER_PID_FILE); } catch { /* ignore */ }
      return null;
    }
  } catch {
    return null;
  }
}

/** Match OCR text against popup patterns. Returns first match or null. */
export function detectPopup(
  ocrText: string,
  patterns: PopupPattern[] = DEFAULT_POPUP_PATTERNS,
): DetectedPopup | null {
  const lowerText = ocrText.toLowerCase();
  for (const p of patterns) {
    const regex = new RegExp(p.pattern, "i");
    if (regex.test(lowerText)) {
      return {
        matchedText: ocrText.substring(0, 200),
        pattern: p.pattern,
        dismissAction: p.action,
        detectedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

/** Get the latest OCR text from observer (if running and has data). */
export function getObserverOcrText(): string | null {
  const state = readObserverState();
  if (!state?.running || !state.lastFrame) return null;
  return state.lastFrame.ocrText;
}

/** Get detected popup from observer (if any). */
export function getObserverPopup(): DetectedPopup | null {
  const state = readObserverState();
  if (!state?.running) return null;
  return state.popup;
}
