// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only
//
// This file is part of ScreenHand.

/**
 * ContextTracker — lightweight singleton that connects tool execution to playbook knowledge.
 *
 * Three jobs, each fires at the right moment:
 *   1. DETECT context  — on domain/app change (from tool params), cache matching playbook
 *   2. GET hints       — per tool call, return 0-2 relevant hint strings (0ms, in-memory)
 *   3. COLLECT outcome — per tool call, push to in-memory buffer (no disk, no AI)
 *   4. FLUSH           — on session_release or every N actions, merge learnings into playbook
 */

import type { Playbook, PlaybookError } from "./playbook/types.js";
import type { PlaybookStore } from "./playbook/store.js";

// ── Types ──

export interface ToolOutcome {
  tool: string;
  target: string | null;
  domain: string;
  success: boolean;
  error: string | null;
  timestamp: string;
}

interface CachedContext {
  domain: string;
  playbook: Playbook | null;
  /** Flat list of errors from playbook, indexed by tool name for fast lookup */
  errorsByTool: Map<string, PlaybookError[]>;
  /** Flat map of all selectors from playbook: name → selector string */
  allSelectors: Map<string, string>;
}

// ── Tool → error relevance mapping ──
// Maps tool names to the error context keywords that are relevant to them
const TOOL_ERROR_KEYWORDS: Record<string, string[]> = {
  browser_click: ["click", "button", "element"],
  browser_human_click: ["click", "button", "element"],
  click: ["click", "button", "element"],
  click_text: ["click", "button", "element"],
  click_with_fallback: ["click", "button", "element"],
  browser_type: ["type", "input", "form", "field", "value"],
  type_text: ["type", "input", "form", "field", "value"],
  type_with_fallback: ["type", "input", "form", "field", "value"],
  browser_fill_form: ["form", "field", "input", "value"],
  browser_navigate: ["navigate", "url", "page", "load"],
  browser_dom: ["dom", "selector", "element"],
  browser_js: ["script", "eval", "js"],
  browser_wait: ["wait", "load", "timeout"],
  scroll: ["scroll"],
  scroll_with_fallback: ["scroll"],
};

// Tools that carry a URL in their params
const URL_TOOLS = new Set([
  "browser_open", "browser_navigate",
]);

// Tools that carry a target/selector in their params
const TARGET_PARAM_NAMES = ["selector", "target", "text", "label", "placeholder"];

const FLUSH_THRESHOLD = 50;
const MIN_OCCURRENCES_TO_PROMOTE = 2;

export class ContextTracker {
  private context: CachedContext | null = null;
  private learnings: ToolOutcome[] = [];
  private actionCount = 0;

  constructor(private readonly store: PlaybookStore) {}

  // ═══════════════════════════════════════════════
  // 1. DETECT — update context when domain changes
  // ═══════════════════════════════════════════════

  /**
   * Call after every tool call. Extracts domain from params if present.
   * Only does a playbook lookup when the domain actually changes.
   */
  updateContext(toolName: string, params: Record<string, unknown>): void {
    // Extract URL from tool params
    if (!URL_TOOLS.has(toolName)) return;
    const url = params.url as string | undefined;
    if (!url) return;

    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return;
    }

    // Skip if domain hasn't changed
    if (this.context?.domain === domain) return;

    // Domain changed — find matching playbook (one Map scan)
    const playbook = this.store.matchByDomain(domain);
    this.context = buildCachedContext(domain, playbook);
  }

  // ═══════════════════════════════════════════════
  // 2. GET HINTS — 0-2 lines per tool call
  // ═══════════════════════════════════════════════

  /**
   * Returns relevant hints for this tool call. Max 2 hints.
   * Cost: map lookups only, ~0ms.
   */
  getHints(toolName: string, params: Record<string, unknown>): string[] {
    if (!this.context?.playbook) return [];

    const hints: string[] = [];

    // Check for known errors relevant to this tool
    const errors = this.context.errorsByTool.get(toolName);
    if (errors && errors.length > 0) {
      // Pick highest severity error
      const top = errors[0]!;
      hints.push(`⚠ Known issue (${this.context.playbook.platform}): ${top.error} → ${top.solution}`);
    }

    // Check if there's a preferred selector for what the tool is targeting
    if (hints.length < 2) {
      const target = extractTarget(params);
      if (target) {
        // Look for a matching selector in playbook
        const match = findRelevantSelector(target, this.context.allSelectors);
        if (match) {
          hints.push(`💡 Preferred selector (${this.context.playbook.platform}): ${match}`);
        }
      }
    }

    // If playbook has executable steps and this looks like manual execution
    if (hints.length < 2 && this.context.playbook.steps.length > 0) {
      const pb = this.context.playbook;
      const rate = pb.successCount + pb.failCount > 0
        ? Math.round((pb.successCount / (pb.successCount + pb.failCount)) * 100)
        : 0;
      hints.push(`📋 Playbook "${pb.id}" has ${pb.steps.length} steps (${rate}% success). Use job_create(task=..., playbookId="${pb.id}") for auto-execution.`);
    }

    return hints;
  }

  // ═══════════════════════════════════════════════
  // 3. COLLECT — record outcome in memory buffer
  // ═══════════════════════════════════════════════

  /**
   * Record a tool outcome. Just an array push — no disk, no AI.
   */
  recordOutcome(
    toolName: string,
    params: Record<string, unknown>,
    success: boolean,
    error: string | null,
  ): void {
    if (!this.context) return;

    this.learnings.push({
      tool: toolName,
      target: extractTarget(params),
      domain: this.context.domain,
      success,
      error,
      timestamp: new Date().toISOString(),
    });

    this.actionCount++;

    // Auto-flush at threshold
    if (this.actionCount >= FLUSH_THRESHOLD) {
      this.flush();
    }
  }

  // ═══════════════════════════════════════════════
  // 4. FLUSH — merge learnings into playbook (one write)
  // ═══════════════════════════════════════════════

  /**
   * Merge collected learnings into the matched playbook.
   * Call on session_release or process exit.
   * One disk write via PlaybookStore.save().
   */
  flush(): void {
    if (this.learnings.length === 0) return;
    if (!this.context?.playbook) {
      this.learnings = [];
      this.actionCount = 0;
      return;
    }

    const playbook = this.context.playbook;
    let changed = false;

    // ── Promote selectors that worked 2+ times ──
    const selectorSuccessCount = new Map<string, number>();
    for (const l of this.learnings) {
      if (l.success && l.target && l.target.startsWith("[") || l.target?.startsWith("#") || l.target?.startsWith(".")) {
        const key = l.target!;
        selectorSuccessCount.set(key, (selectorSuccessCount.get(key) ?? 0) + 1);
      }
    }

    if (!playbook.selectors) playbook.selectors = {};
    if (!playbook.selectors["auto_discovered"]) playbook.selectors["auto_discovered"] = {};
    for (const [selector, count] of selectorSuccessCount) {
      if (count >= MIN_OCCURRENCES_TO_PROMOTE) {
        // Don't overwrite existing selectors
        const existing = this.context.allSelectors;
        const alreadyKnown = [...existing.values()].some(s => s === selector);
        if (!alreadyKnown) {
          const key = `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          playbook.selectors["auto_discovered"]![key] = selector;
          changed = true;
        }
      }
    }

    // ── Promote error patterns seen 2+ times with a common error message ──
    const errorCounts = new Map<string, { count: number; tool: string; error: string }>();
    for (const l of this.learnings) {
      if (!l.success && l.error) {
        const key = `${l.tool}::${l.error}`;
        const existing = errorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          errorCounts.set(key, { count: 1, tool: l.tool, error: l.error });
        }
      }
    }

    if (!playbook.errors) playbook.errors = [];
    for (const [, { count, tool, error }] of errorCounts) {
      if (count >= MIN_OCCURRENCES_TO_PROMOTE) {
        // Don't add duplicates
        const alreadyKnown = playbook.errors.some(e => e.error === error);
        if (!alreadyKnown) {
          playbook.errors.push({
            error,
            context: `tool: ${tool}, domain: ${this.context.domain}`,
            solution: "No resolution yet — investigate and update this entry",
            severity: count >= 4 ? "high" : "medium",
          });
          changed = true;
        }
      }
    }

    // ── Save if changed ──
    if (changed) {
      this.store.save(playbook);
    }

    // Reset
    this.learnings = [];
    this.actionCount = 0;
  }

  /** Get the currently matched playbook (if any). */
  getActivePlaybook(): Playbook | null {
    return this.context?.playbook ?? null;
  }

  /** Get the current domain being tracked. */
  getCurrentDomain(): string | null {
    return this.context?.domain ?? null;
  }
}

// ── Helpers ──

function buildCachedContext(domain: string, playbook: Playbook | null): CachedContext {
  const errorsByTool = new Map<string, PlaybookError[]>();
  const allSelectors = new Map<string, string>();

  if (playbook) {
    // Index errors by relevant tool names
    if (playbook.errors) {
      for (const err of playbook.errors) {
        const errLower = `${err.error} ${err.context} ${err.solution}`.toLowerCase();
        for (const [tool, keywords] of Object.entries(TOOL_ERROR_KEYWORDS)) {
          if (keywords.some(kw => errLower.includes(kw))) {
            const existing = errorsByTool.get(tool) ?? [];
            existing.push(err);
            errorsByTool.set(tool, existing);
          }
        }
      }

      // Sort each tool's errors by severity
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      for (const [tool, errors] of errorsByTool) {
        errors.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));
        errorsByTool.set(tool, errors);
      }
    }

    // Flatten all selectors into one map
    if (playbook.selectors) {
      for (const [group, sels] of Object.entries(playbook.selectors)) {
        for (const [name, sel] of Object.entries(sels)) {
          allSelectors.set(`${group}.${name}`, sel);
        }
      }
    }
  }

  return { domain, playbook, errorsByTool, allSelectors };
}

function extractTarget(params: Record<string, unknown>): string | null {
  for (const name of TARGET_PARAM_NAMES) {
    const val = params[name];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function findRelevantSelector(target: string, selectors: Map<string, string>): string | null {
  if (selectors.size === 0) return null;

  const targetLower = target.toLowerCase();

  // Check if any selector name loosely matches the target
  for (const [name, sel] of selectors) {
    const nameLower = name.toLowerCase();
    // If target text matches a selector name (e.g., target="Search" matches "toolbar.search")
    if (nameLower.includes(targetLower) || targetLower.includes(nameLower.split(".").pop() ?? "")) {
      return `${name}: ${sel}`;
    }
  }

  return null;
}
