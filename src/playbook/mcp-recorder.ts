// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * McpPlaybookRecorder — captures MCP tool calls as PlaybookSteps.
 *
 * Start recording → agent does the flow → stop → saves as executable playbook.
 * Like a macro recorder, but for AI tool calls.
 */

import fs from "node:fs";
import path from "node:path";
import { writeFileAtomicSync } from "../util/atomic-write.js";
import type { Playbook, PlaybookStep } from "./types.js";

/** Tools that are observation-only — not recorded as steps */
const SKIP_TOOLS = new Set([
  "ui_tree", "ui_find", "browser_dom", "browser_page_info", "browser_tabs",
  "ocr", "apps", "windows", "memory_recall", "memory_save", "memory_snapshot",
  "memory_stats", "memory_errors", "memory_query_patterns", "memory_record_error",
  "memory_record_learning", "memory_clear", "platform_guide", "playbook_preflight",
  "export_playbook", "playbook_record", "job_create", "job_status", "job_list",
  "job_run", "job_run_all", "job_create_chain", "job_remove", "job_transition",
  "job_step_done", "job_step_fail", "job_resume", "job_dequeue",
  "worker_start", "worker_stop", "worker_status",
  "supervisor_status", "supervisor_start", "supervisor_stop",
  "supervisor_pause", "supervisor_resume", "supervisor_install", "supervisor_uninstall",
  "session_claim", "session_heartbeat", "session_release",
  "recovery_queue_add", "recovery_queue_list",
  "codex_monitor_start", "codex_monitor_status", "codex_monitor_add_task",
  "codex_monitor_tasks", "codex_monitor_assign_now", "codex_monitor_stop",
  "platform_learn", "platform_explore",
]);

/** Map MCP tool names to PlaybookStep actions */
function mapToolToAction(toolName: string): PlaybookStep["action"] | null {
  switch (toolName) {
    case "browser_navigate": return "navigate";
    case "click": case "click_text": case "browser_click":
    case "click_with_fallback": case "ui_press": return "press";
    case "type_text": case "browser_type": case "type_with_fallback": return "type_into";
    case "key": return "key_combo";
    case "scroll": case "scroll_with_fallback": return "scroll";
    case "browser_js": return "browser_js";
    case "screenshot": case "screenshot_file": return "screenshot";
    case "browser_wait": case "wait_for_state": return "wait";
    case "focus": case "launch": return null; // useful context but not a step
    case "drag": return null; // drag is complex, skip for now
    default: return null;
  }
}

/** Build a PlaybookStep from an MCP tool call */
function buildStep(
  toolName: string,
  params: Record<string, unknown>,
  success: boolean,
): PlaybookStep | null {
  const action = mapToolToAction(toolName);
  if (!action) return null;

  const step: PlaybookStep = { action };

  switch (action) {
    case "navigate":
      step.url = String(params.url ?? "");
      step.description = `Navigate to ${step.url}`;
      break;

    case "press":
      step.target = String(params.selector ?? params.text ?? params.title ?? params.target ?? "");
      step.description = `Click ${step.target}`;
      break;

    case "type_into":
      step.target = String(params.selector ?? params.target ?? params.field ?? "");
      step.text = String(params.text ?? params.value ?? "");
      step.description = `Type "${step.text.substring(0, 50)}" into ${step.target}`;
      break;

    case "key_combo": {
      const combo = String(params.combo ?? params.key ?? "");
      step.keys = combo.split("+").map(k => k.trim());
      step.description = `Key combo: ${combo}`;
      break;
    }

    case "scroll":
      step.direction = (params.direction as "up" | "down") ?? "down";
      if (params.amount != null) step.amount = Number(params.amount);
      step.description = `Scroll ${step.direction}`;
      break;

    case "browser_js":
      step.code = String(params.code ?? "");
      step.description = `Execute JS: ${step.code.substring(0, 60)}...`;
      break;

    case "screenshot":
      step.description = "Take screenshot";
      break;

    case "wait":
      step.ms = Number(params.timeout ?? params.ms ?? params.timeoutMs ?? 1000);
      step.description = `Wait ${step.ms}ms`;
      break;
  }

  if (!success) {
    step.optional = true;
  }

  return step;
}

export class McpPlaybookRecorder {
  private recording = false;
  private platform = "";
  private steps: PlaybookStep[] = [];
  private startTime = "";
  private cdpPort?: number;

  constructor(private readonly playbooksDir: string) {}

  get isRecording(): boolean { return this.recording; }
  get stepCount(): number { return this.steps.length; }

  getSteps(): PlaybookStep[] { return [...this.steps]; }

  start(platform: string, cdpPort?: number): void {
    this.recording = true;
    this.platform = platform;
    this.steps = [];
    this.startTime = new Date().toISOString();
    if (cdpPort !== undefined) this.cdpPort = cdpPort;
  }

  captureToolCall(
    toolName: string,
    params: Record<string, unknown>,
    success: boolean,
    _result: string,
    _durationMs: number,
  ): void {
    if (!this.recording) return;
    if (SKIP_TOOLS.has(toolName)) return;

    const step = buildStep(toolName, params, success);
    if (!step) return;

    // Deduplicate consecutive identical steps
    const last = this.steps[this.steps.length - 1];
    if (last && last.action === step.action && last.target === step.target && last.code === step.code) {
      return; // skip duplicate
    }

    this.steps.push(step);
  }

  stop(name: string, description: string): Playbook {
    this.recording = false;

    const id = this.platform + "-" + Date.now().toString(36);
    const playbook: Playbook = {
      id,
      name,
      description,
      platform: this.platform,
      version: "1.0.0",
      tags: [this.platform, "recorded"],
      successCount: 0,
      failCount: 0,
      steps: this.steps,
    };

    if (this.cdpPort) {
      playbook.cdpPort = this.cdpPort;
    }

    // Save to playbooks dir
    if (!fs.existsSync(this.playbooksDir)) {
      fs.mkdirSync(this.playbooksDir, { recursive: true });
    }
    writeFileAtomicSync(
      path.join(this.playbooksDir, `${id}.json`),
      JSON.stringify(playbook, null, 2),
    );

    this.steps = [];
    return playbook;
  }

  cancel(): void {
    this.recording = false;
    this.steps = [];
  }
}
