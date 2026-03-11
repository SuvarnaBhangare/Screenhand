// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orchestrator state helpers — read/write state file, PID management.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { readJsonWithRecovery, writeFileAtomicSync } from "../util/atomic-write.js";
import {
  type OrchestratorState,
  type OrchestratorTask,
  type TaskMode,
  ORCHESTRATOR_DIR,
  ORCHESTRATOR_STATE_FILE,
  ORCHESTRATOR_PID_FILE,
} from "./types.js";

/** Read current orchestrator state from disk. */
export function readOrchestratorState(): OrchestratorState | null {
  return readJsonWithRecovery<OrchestratorState>(ORCHESTRATOR_STATE_FILE);
}

/** Write orchestrator state to disk (atomic). */
export function writeOrchestratorState(state: OrchestratorState): void {
  fs.mkdirSync(ORCHESTRATOR_DIR, { recursive: true });
  writeFileAtomicSync(ORCHESTRATOR_STATE_FILE, JSON.stringify(state, null, 2));
}

/** Get PID of running orchestrator daemon, or null. */
export function getOrchestratorDaemonPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(ORCHESTRATOR_PID_FILE, "utf-8").trim());
    if (Number.isNaN(pid)) return null;
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      try { fs.unlinkSync(ORCHESTRATOR_PID_FILE); } catch { /* ignore */ }
      return null;
    }
  } catch {
    return null;
  }
}

/** Generate a unique task ID */
export function generateTaskId(): string {
  return "task_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex");
}

/** Auto-detect task mode from playbook and parameters */
export function detectTaskMode(playbookId?: string, bundleId?: string): TaskMode {
  // If it has a bundleId, it's at least partially native
  if (bundleId) return "native";
  // CDP-only playbooks are web
  // For now, default to web if no bundleId specified
  return "web";
}

/** Create a new task */
export function createTask(
  task: string,
  opts: {
    mode?: TaskMode;
    playbookId?: string;
    bundleId?: string;
    windowId?: number;
    vars?: Record<string, string>;
    priority?: number;
  } = {},
): OrchestratorTask {
  return {
    id: generateTaskId(),
    task,
    mode: opts.mode ?? detectTaskMode(opts.playbookId, opts.bundleId),
    ...(opts.playbookId !== undefined ? { playbookId: opts.playbookId } : {}),
    ...(opts.bundleId !== undefined ? { bundleId: opts.bundleId } : {}),
    ...(opts.windowId !== undefined ? { windowId: opts.windowId } : {}),
    ...(opts.vars ? { vars: opts.vars } : {}),
    priority: opts.priority ?? 10,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
}
