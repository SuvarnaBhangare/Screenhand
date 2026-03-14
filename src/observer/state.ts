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
  type ObserverCommand,
  type DetectedPopup,
  type PopupPattern,
  DEFAULT_POPUP_PATTERNS,
  OBSERVER_DIR,
  OBSERVER_STATE_FILE,
  OBSERVER_COMMANDS_FILE,
  OBSERVER_PID_FILE,
  CAPTURE_LOCK_FILE,
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

// ── Command file helpers ──

/** Read all commands from the command file. */
export function readObserverCommands(): ObserverCommand[] {
  const data = readJsonWithRecovery<ObserverCommand[]>(OBSERVER_COMMANDS_FILE);
  return data ?? [];
}

/** Write commands to disk (atomic). */
export function writeObserverCommands(commands: ObserverCommand[]): void {
  fs.mkdirSync(OBSERVER_DIR, { recursive: true });
  writeFileAtomicSync(OBSERVER_COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

/** Submit a new command. Returns the command ID. */
export function submitObserverCommand(
  cmd: Omit<ObserverCommand, "id" | "status" | "createdAt">,
): string {
  const commands = readObserverCommands();
  const id = `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const newCmd: ObserverCommand = {
    ...cmd,
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  commands.push(newCmd);
  // Cap at 50 commands, evict oldest completed/errored first
  if (commands.length > 50) {
    const done = commands.filter((c) => c.status === "done" || c.status === "error");
    if (done.length > 0) {
      const removeId = done[0]!.id;
      const idx = commands.findIndex((c) => c.id === removeId);
      if (idx >= 0) commands.splice(idx, 1);
    } else {
      commands.shift();
    }
  }
  writeObserverCommands(commands);
  return id;
}

/** Get a command by ID. */
export function getObserverCommand(id: string): ObserverCommand | null {
  const commands = readObserverCommands();
  return commands.find((c) => c.id === id) ?? null;
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

// ── Capture lock helpers ──
// Prevents observer daemon and perception coordinator from capturing simultaneously.

const LOCK_STALE_MS = 10_000; // Locks older than 10s are considered stale

/**
 * Acquire the capture lock. Returns true if acquired, false if held by another process.
 * Lock contains PID + timestamp so stale locks from crashed processes can be cleaned up.
 */
export function acquireCaptureLock(): boolean {
  fs.mkdirSync(OBSERVER_DIR, { recursive: true });
  try {
    // Check existing lock
    const existing = fs.readFileSync(CAPTURE_LOCK_FILE, "utf-8").trim();
    if (existing) {
      const parts = existing.split(":");
      const lockPid = Number(parts[0]);
      const lockTime = Number(parts[1]);
      // Stale lock check
      if (Date.now() - lockTime > LOCK_STALE_MS) {
        // Lock is stale — safe to overwrite
      } else if (lockPid !== process.pid) {
        // Check if holding process is alive
        try {
          process.kill(lockPid, 0);
          return false; // Process alive, lock is valid
        } catch {
          // Process dead — stale lock
        }
      }
      // Lock is ours or stale — fall through to acquire
    }
  } catch {
    // No lock file — safe to create
  }

  try {
    fs.writeFileSync(CAPTURE_LOCK_FILE, `${process.pid}:${Date.now()}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the capture lock (only if we hold it).
 */
export function releaseCaptureLock(): void {
  try {
    const existing = fs.readFileSync(CAPTURE_LOCK_FILE, "utf-8").trim();
    const lockPid = Number(existing.split(":")[0]);
    if (lockPid === process.pid) {
      fs.unlinkSync(CAPTURE_LOCK_FILE);
    }
  } catch {
    // No lock file or already cleaned up
  }
}

/**
 * Check if the capture lock is currently held (by any process).
 */
export function isCaptureLocked(): boolean {
  try {
    const existing = fs.readFileSync(CAPTURE_LOCK_FILE, "utf-8").trim();
    if (!existing) return false;
    const parts = existing.split(":");
    const lockPid = Number(parts[0]);
    const lockTime = Number(parts[1]);
    if (Date.now() - lockTime > LOCK_STALE_MS) return false;
    try {
      process.kill(lockPid, 0);
      return true;
    } catch {
      return false; // Process dead
    }
  } catch {
    return false;
  }
}
