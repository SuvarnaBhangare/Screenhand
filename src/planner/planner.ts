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

import crypto from "node:crypto";
import type { PlaybookStore } from "../playbook/store.js";
import type { MemoryService } from "../memory/service.js";
import type { ContextTracker } from "../context-tracker.js";
import type { WorldModel } from "../state/world-model.js";
import type { LearningEngine } from "../learning/engine.js";
import type { ToolRegistry } from "./tool-registry.js";
import type {
  Goal,
  Subgoal,
  ActionPlan,
  PlanStep,
  PlannerConfig,
  ReplanReason,
} from "./types.js";
import { DEFAULT_PLANNER_CONFIG } from "./types.js";
import { playbookToPlan, strategyToPlan, flowToPlan } from "./deterministic.js";

function uid(): string {
  return crypto.randomBytes(6).toString("hex");
}

/**
 * Decompose a goal description into subgoal parts.
 * Splits on: numbered steps ("1. ... 2. ..."), "and then", "then",
 * ", and " (Oxford comma), or semicolons.
 * Returns the original description as a single-element array if no split applies.
 */
function decomposeGoal(description: string): string[] {
  // 1. Try numbered steps: "1. do X 2. do Y" or "1) do X 2) do Y"
  const numberedPattern = /(?:^|\s)(\d+)[.)]\s+/g;
  const numberedMatches = [...description.matchAll(numberedPattern)];
  if (numberedMatches.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < numberedMatches.length; i++) {
      const start = numberedMatches[i]!.index! + numberedMatches[i]![0].indexOf(numberedMatches[i]![1]!);
      const stepStart = start + numberedMatches[i]![0].trimStart().length;
      const end = i + 1 < numberedMatches.length
        ? numberedMatches[i + 1]!.index!
        : description.length;
      const text = description.slice(stepStart, end).trim();
      if (text) parts.push(text);
    }
    if (parts.length >= 2) return parts;
  }

  // 2. Try semicolons
  const semiParts = description.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  if (semiParts.length >= 2) return semiParts;

  // 3. Try "and then" or ", then"
  const thenParts = description.split(/\s+and\s+then\s+|,\s*then\s+/i).map((s) => s.trim()).filter((s) => s.length > 0);
  if (thenParts.length >= 2) return thenParts;

  // 4. Try ", and " (Oxford comma pattern — implies list of actions)
  const andParts = description.split(/,\s+and\s+/i).map((s) => s.trim()).filter((s) => s.length > 0);
  if (andParts.length >= 2) return andParts;

  // 5. No decomposition
  return [description];
}

/**
 * Planner — goal-oriented planning with deterministic fast-path.
 *
 * Priority:
 * 1. Playbook match → deterministic plan (0 LLM calls)
 * 2. Strategy recall → plan from memory (0 LLM calls)
 * 3. Reference flow → semi-deterministic (LLM interprets steps)
 * 4. LLM generation → full plan from scratch
 */
export class Planner {
  private readonly config: PlannerConfig;

  constructor(
    private readonly playbookStore: PlaybookStore,
    private readonly memory: MemoryService,
    private readonly contextTracker: ContextTracker,
    private readonly worldModel: WorldModel,
    configOrLearning?: Partial<PlannerConfig> | LearningEngine,
    learningOrConfig?: LearningEngine | Partial<PlannerConfig>,
  ) {
    // Support both (config, learning) and (learning, config) orderings
    let config: Partial<PlannerConfig> | undefined;
    let learning: LearningEngine | undefined;
    for (const arg of [configOrLearning, learningOrConfig]) {
      if (!arg) continue;
      if (typeof (arg as LearningEngine).recommendLocator === "function") {
        learning = arg as LearningEngine;
      } else {
        config = arg as Partial<PlannerConfig>;
      }
    }
    this.config = { ...DEFAULT_PLANNER_CONFIG, ...config };
    this.learningEngine = learning ?? null;
  }

  private readonly learningEngine: LearningEngine | null;
  private toolRegistry: ToolRegistry | null = null;

  /**
   * Set the tool registry for LLM plan generation.
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * Create a Goal from a description.
   * Decomposes complex goals into multiple subgoals when the description
   * contains "and then", "then", ", and", numbered steps, or semicolons.
   */
  createGoal(description: string): Goal {
    const parts = decomposeGoal(description);
    const subgoals: Subgoal[] = parts.map((part) => ({
      id: `sg_${uid()}`,
      description: part,
      status: "pending" as const,
      plan: null,
      attempts: 0,
      maxAttempts: this.config.defaultMaxAttempts,
      lastError: null,
    }));

    const goal: Goal = {
      id: `goal_${uid()}`,
      description,
      status: "pending",
      subgoals,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    return goal;
  }

  /**
   * Plan a subgoal: find the best ActionPlan from available sources.
   *
   * Priority: playbook > strategy > reference flow > LLM
   */
  async planSubgoal(subgoal: Subgoal): Promise<ActionPlan> {
    // 1. Try playbook match
    const playbookPlan = this.findPlaybookPlan(subgoal.description);
    if (playbookPlan) return playbookPlan;

    // 2. Try strategy recall
    const strategyPlan = this.findStrategyPlan(subgoal.description);
    if (strategyPlan) return strategyPlan;

    // 3. Try reference flow
    const flowPlan = this.findFlowPlan(subgoal.description);
    if (flowPlan) return flowPlan;

    // 4. Fallback: LLM-generated plan (or stub if no API key)
    return this.createLLMPlan(subgoal.description);
  }

  /**
   * Plan all subgoals in a goal.
   */
  async planGoal(goal: Goal): Promise<void> {
    goal.status = "active";
    for (const sg of goal.subgoals) {
      if (sg.status === "completed" || sg.status === "skipped") continue;
      sg.plan = await this.planSubgoal(sg);
      sg.status = "pending";
    }
  }

  /**
   * Replan a subgoal after failure.
   * Increments attempt count, resets plan, tries alternative sources.
   */
  async replan(subgoal: Subgoal, reason: ReplanReason, errorMsg?: string): Promise<ActionPlan | null> {
    subgoal.attempts++;
    subgoal.lastError = errorMsg ?? reason;

    if (subgoal.attempts >= subgoal.maxAttempts) {
      subgoal.status = "failed";
      return null;
    }

    subgoal.status = "pending";

    // On replan, try alternative sources or adjust params
    const currentSource = subgoal.plan?.source;

    // If playbook failed, try strategy
    if (currentSource === "playbook") {
      const strategyPlan = this.findStrategyPlan(subgoal.description);
      if (strategyPlan) return strategyPlan;
    }

    // If strategy failed, try reference flow
    if (currentSource === "playbook" || currentSource === "strategy") {
      const flowPlan = this.findFlowPlan(subgoal.description);
      if (flowPlan) return flowPlan;
    }

    // Always fall back to LLM
    return this.createLLMPlan(subgoal.description);
  }

  /**
   * Check if a goal is complete (all subgoals done or failed).
   */
  evaluateGoal(goal: Goal): void {
    const allDone = goal.subgoals.every(
      (sg) =>
        sg.status === "completed" ||
        sg.status === "failed" ||
        sg.status === "skipped",
    );

    if (!allDone) return;

    const anyFailed = goal.subgoals.some((sg) => sg.status === "failed");
    goal.status = anyFailed ? "failed" : "completed";
    goal.completedAt = new Date().toISOString();
  }

  /**
   * Serialize a goal to JSON (for persistence/transport).
   */
  static serializeGoal(goal: Goal): string {
    return JSON.stringify(goal);
  }

  /**
   * Deserialize a goal from JSON.
   */
  static deserializeGoal(json: string): Goal {
    const obj = JSON.parse(json) as Goal;
    if (!obj.id || !Array.isArray(obj.subgoals)) {
      throw new Error("Invalid Goal JSON: missing id or subgoals");
    }
    return obj;
  }

  // ── Private plan finding ──

  private getBundleId(): string {
    return this.worldModel.getState().focusedApp?.bundleId ?? "";
  }

  private findPlaybookPlan(description: string): ActionPlan | null {
    // Try task-based match only — don't unconditionally use the active playbook
    // here, because that would shadow findFlowPlan() which also uses the active
    // playbook's flows. The active playbook's steps are only a good match if
    // matchByTask explicitly selects it.
    const playbook = this.playbookStore.matchByTask(description);
    if (playbook && playbook.steps.length > 0) {
      return playbookToPlan(playbook, this.config, this.learningEngine, this.getBundleId());
    }

    return null;
  }

  private findStrategyPlan(description: string): ActionPlan | null {
    const strategies = this.memory.recallStrategies(description, 1);
    if (strategies.length === 0) return null;

    const best = strategies[0]!;
    if (best.score < 0.3) return null;

    return strategyToPlan(best, this.config, this.learningEngine, this.getBundleId());
  }

  private findFlowPlan(description: string): ActionPlan | null {
    const active = this.contextTracker.getActivePlaybook();
    if (!active?.flows) return null;

    // Find best matching flow by keyword overlap
    const tokens = description.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    let bestFlow: { name: string; flow: import("../playbook/types.js").PlaybookFlow } | null = null;
    let bestScore = 0;

    for (const [name, flow] of Object.entries(active.flows)) {
      const flowTokens = name.toLowerCase().split(/[_\-\s]+/);
      const allTokens = [
        ...flowTokens,
        ...flow.steps.join(" ").toLowerCase().split(/\W+/),
      ];
      let score = 0;
      for (const t of tokens) {
        if (allTokens.some((ft) => ft.includes(t))) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestFlow = { name, flow };
      }
    }

    if (!bestFlow || bestScore === 0) return null;
    return flowToPlan(bestFlow.name, bestFlow.flow, this.config);
  }

  private createLLMPlanStub(description: string): ActionPlan {
    const step: PlanStep = {
      tool: "",
      params: {},
      expectedPostcondition: null,
      timeout: this.config.defaultStepTimeout,
      fallbackTool: null,
      requiresLLM: true,
      status: "pending",
      description,
    };

    return {
      steps: [step],
      currentStepIndex: 0,
      confidence: 0.3,
      source: "llm",
      sourceId: null,
    };
  }

  private async createLLMPlan(description: string): Promise<ActionPlan> {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey || !this.toolRegistry) {
      return this.createLLMPlanStub(description);
    }

    try {
      const toolNames = this.toolRegistry.getToolNames();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Decompose this desktop automation goal into tool steps. Available tools: ${toolNames.join(", ")}. Goal: ${description}. Return ONLY a JSON array of objects with fields: tool (string), params (object), description (string). No markdown, no explanation.`,
          }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return this.createLLMPlanStub(description);
      }

      const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.[0]?.text?.trim();
      if (!text) return this.createLLMPlanStub(description);

      // Extract JSON array from response (may be wrapped in markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return this.createLLMPlanStub(description);

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        tool: string;
        params?: Record<string, unknown>;
        description?: string;
      }>;

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.createLLMPlanStub(description);
      }

      const steps: PlanStep[] = parsed.map((s) => ({
        tool: s.tool ?? "",
        params: s.params ?? {},
        expectedPostcondition: null,
        timeout: this.config.defaultStepTimeout,
        fallbackTool: null,
        requiresLLM: false,
        status: "pending" as const,
        description: s.description ?? s.tool ?? description,
      }));

      return {
        steps,
        currentStepIndex: 0,
        confidence: 0.5,
        source: "llm",
        sourceId: null,
      };
    } catch {
      return this.createLLMPlanStub(description);
    }
  }
}
