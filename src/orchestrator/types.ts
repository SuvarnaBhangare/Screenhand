// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orchestrator types — multi-agent task routing and coordination.
 *
 * Architecture:
 *   Orchestrator daemon manages a pool of worker slots.
 *   Web tasks (CDP-only) run in parallel — no mouse/keyboard conflict.
 *   Native tasks (AX/keyboard) are serialized per-app via lease locks.
 *   Mixed tasks split into web + native phases automatically.
 */

import os from "node:os";
import path from "node:path";

/** How a task interacts with the desktop */
export type TaskMode = "web" | "native" | "mixed";

/** A high-level task submitted to the orchestrator */
export interface OrchestratorTask {
  id: string;
  /** Human-readable description */
  task: string;
  /** Execution mode: web (CDP only), native (AX/keyboard), mixed (both) */
  mode: TaskMode;
  /** Playbook to execute (optional — can be free-form) */
  playbookId?: string;
  /** Target app bundle ID (for native/mixed tasks) */
  bundleId?: string;
  /** Target window ID (for native tasks) */
  windowId?: number;
  /** Variables for playbook substitution */
  vars?: Record<string, string>;
  /** Priority: lower = higher. Default 10 */
  priority: number;
  /** Current status */
  status: "queued" | "assigned" | "running" | "done" | "failed" | "blocked";
  /** Which worker slot is executing this task */
  assignedWorker?: number;
  /** Underlying job ID (created when task is dispatched to a worker) */
  jobId?: string;
  /** Result summary */
  result?: string;
  /** Error if failed */
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** Status of a single worker slot */
export interface WorkerSlot {
  id: number;
  /** What kind of work this slot handles */
  type: "web" | "native";
  /** Whether this slot is currently processing a task */
  busy: boolean;
  /** Task currently being processed */
  currentTaskId?: string;
  /** PID of the worker process (if forked) */
  pid?: number;
  /** Number of tasks completed by this slot */
  tasksCompleted: number;
  /** Number of tasks failed */
  tasksFailed: number;
}

/** Orchestrator state persisted to disk */
export interface OrchestratorState {
  pid: number;
  running: boolean;
  startedAt: string;
  /** Worker slot pool */
  workers: WorkerSlot[];
  /** Total web worker slots */
  webSlots: number;
  /** Total native worker slots (usually 1 per app) */
  nativeSlots: number;
  /** Task queue */
  tasks: OrchestratorTask[];
  /** Stats */
  totalSubmitted: number;
  totalCompleted: number;
  totalFailed: number;
  /** Apps currently locked by native workers */
  nativeLocks: Record<string, number>; // bundleId → worker slot ID
}

/** Config for orchestrator daemon */
export interface OrchestratorConfig {
  /** Number of parallel web worker slots (default: 4) */
  webSlots: number;
  /** Number of native worker slots (default: 1) */
  nativeSlots: number;
  /** Poll interval in ms (default: 1000) */
  pollMs: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  webSlots: 4,
  nativeSlots: 1,
  pollMs: 1000,
};

export const ORCHESTRATOR_DIR = path.join(os.homedir(), ".screenhand", "orchestrator");
export const ORCHESTRATOR_STATE_FILE = path.join(ORCHESTRATOR_DIR, "state.json");
export const ORCHESTRATOR_PID_FILE = path.join(ORCHESTRATOR_DIR, "orchestrator.pid");
export const ORCHESTRATOR_LOG_FILE = path.join(ORCHESTRATOR_DIR, "orchestrator.log");
