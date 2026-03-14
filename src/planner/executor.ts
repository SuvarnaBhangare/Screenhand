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

import type { WorldModel } from "../state/world-model.js";
import type { RecoveryEngine } from "../recovery/engine.js";
import type { RecoveryBudget } from "../recovery/types.js";
import { DEFAULT_RECOVERY_BUDGET } from "../recovery/types.js";
import type { LearningEngine } from "../learning/engine.js";
import type {
  Goal,
  Subgoal,
  ActionPlan,
  PlanStep,
  PlanResult,
  StepResult,
  PlannerConfig,
  ReplanReason,
  ExecutionPause,
} from "./types.js";
import { DEFAULT_PLANNER_CONFIG } from "./types.js";
import type { Planner } from "./planner.js";

/**
 * Function signature for executing a single tool call.
 * This is injected by the caller (mcp-desktop.ts) to avoid coupling
 * the executor to the MCP server internals.
 */
export type ToolExecutor = (
  tool: string,
  params: Record<string, unknown>,
) => Promise<{ ok: boolean; result?: string; error?: string }>;

/**
 * PlanExecutor — runs ActionPlans step by step, verifying postconditions
 * against the world model after each step.
 *
 * On failure, delegates to the Planner for replanning.
 * On LLM steps, pauses and returns control to the client.
 */
export class PlanExecutor {
  private readonly config: PlannerConfig;

  constructor(
    private readonly worldModel: WorldModel,
    private readonly planner: Planner,
    private readonly executeTool: ToolExecutor,
    config?: Partial<PlannerConfig>,
    private readonly recovery?: RecoveryEngine,
    private readonly learningEngine?: LearningEngine,
  ) {
    this.config = { ...DEFAULT_PLANNER_CONFIG, ...config };
  }

  /**
   * Execute a full goal: iterate subgoals, execute plans, replan on failure.
   * Pauses at LLM steps and returns an ExecutionPause for the client to resolve.
   */
  async executeGoal(goal: Goal): Promise<PlanResult | ExecutionPause> {
    const start = Date.now();
    let stepsExecuted = 0;
    let replans = 0;

    // Capture the expected app at goal start for app_switched detection
    const expectedBundleId = this.worldModel.getState().focusedApp?.bundleId ?? null;

    // Recovery budget for the entire goal lifetime
    const recoveryBudget: RecoveryBudget = {
      ...DEFAULT_RECOVERY_BUDGET,
      usedStrategyIds: new Set<string>(),
    };

    // Plan any unplanned subgoals
    await this.planner.planGoal(goal);

    // Resume from pausedAt if set
    const startSubgoalIdx = goal.pausedAt?.subgoalIndex ?? 0;
    delete goal.pausedAt;

    for (let sgIdx = startSubgoalIdx; sgIdx < goal.subgoals.length; sgIdx++) {
      const subgoal = goal.subgoals[sgIdx]!;
      if (subgoal.status === "completed" || subgoal.status === "skipped")
        continue;

      subgoal.status = "active";

      while (
        subgoal.status === "active" &&
        subgoal.attempts < subgoal.maxAttempts
      ) {
        if (!subgoal.plan) {
          subgoal.status = "failed";
          subgoal.lastError = "No plan available";
          break;
        }

        const result = await this.executePlan(subgoal.plan, recoveryBudget);

        // Check if we hit an LLM pause
        if ("paused" in result) {
          // Save resume point on the goal
          goal.pausedAt = {
            subgoalIndex: sgIdx,
            stepIndex: result.stepIndex,
          };
          goal.status = "active";
          return {
            ...result,
            subgoalIndex: sgIdx,
          };
        }

        stepsExecuted += result.stepsExecuted;

        if (result.success) {
          subgoal.status = "completed";
          break;
        }

        // Plan failed — try replanning
        replans++;
        const reason = this.diagnoseFailure(result, expectedBundleId);
        const newPlan = await this.planner.replan(subgoal, reason, result.error ?? undefined);

        if (!newPlan) {
          break;
        }

        subgoal.plan = newPlan;
        subgoal.status = "active";
      }
    }

    this.planner.evaluateGoal(goal);

    return {
      goalId: goal.id,
      success: goal.status === "completed",
      subgoalsCompleted: goal.subgoals.filter((sg) => sg.status === "completed")
        .length,
      totalSubgoals: goal.subgoals.length,
      stepsExecuted,
      replans,
      durationMs: Date.now() - start,
      error:
        goal.status === "failed"
          ? goal.subgoals.find((sg) => sg.status === "failed")?.lastError ??
            "Unknown error"
          : null,
    };
  }

  /**
   * Execute the next single step of a goal. Returns the step result,
   * or an ExecutionPause if the next step requires LLM interpretation.
   */
  async executeNextStep(goal: Goal): Promise<StepResult | ExecutionPause | PlanResult> {
    // Find the current active subgoal and step
    for (let sgIdx = 0; sgIdx < goal.subgoals.length; sgIdx++) {
      const subgoal = goal.subgoals[sgIdx]!;
      if (subgoal.status === "completed" || subgoal.status === "skipped" || subgoal.status === "failed")
        continue;

      if (!subgoal.plan) {
        subgoal.plan = await this.planner.planSubgoal(subgoal);
      }
      subgoal.status = "active";

      const plan = subgoal.plan;
      if (plan.currentStepIndex >= plan.steps.length) {
        subgoal.status = "completed";
        continue;
      }

      const step = plan.steps[plan.currentStepIndex]!;

      // If step requires LLM and has no tool assigned, pause
      if (step.requiresLLM && !step.tool) {
        return {
          paused: true,
          reason: "requires_llm",
          stepIndex: plan.currentStepIndex,
          stepDescription: step.description,
          subgoalIndex: sgIdx,
          completedSteps: plan.currentStepIndex,
          totalSteps: plan.steps.length,
        };
      }

      const result = await this.executeStepInternal(step);

      if (result.success) {
        step.status = "completed";
        step.resolvedBy = "auto";
        plan.currentStepIndex++;

        // Check if subgoal is complete
        if (plan.currentStepIndex >= plan.steps.length) {
          subgoal.status = "completed";
          this.planner.evaluateGoal(goal);
        }
      } else {
        step.status = "failed";
      }

      return result;
    }

    // All subgoals done
    this.planner.evaluateGoal(goal);
    return {
      goalId: goal.id,
      success: goal.status === "completed",
      subgoalsCompleted: goal.subgoals.filter((sg) => sg.status === "completed").length,
      totalSubgoals: goal.subgoals.length,
      stepsExecuted: 0,
      replans: 0,
      durationMs: 0,
      error: goal.status === "failed"
        ? goal.subgoals.find((sg) => sg.status === "failed")?.lastError ?? "Unknown error"
        : null,
    };
  }

  /**
   * Resolve an LLM step: the client provides the tool + params to use.
   * Executes the tool, advances the plan, and returns the result.
   */
  async resolveStep(
    goal: Goal,
    tool: string,
    params: Record<string, unknown>,
  ): Promise<StepResult> {
    // Find the paused step
    const sgIdx = goal.pausedAt?.subgoalIndex ?? 0;
    const stepIdx = goal.pausedAt?.stepIndex ?? 0;
    const subgoal = goal.subgoals[sgIdx];
    if (!subgoal?.plan) {
      return {
        step: { tool: "", params: {}, expectedPostcondition: null, timeout: 0, fallbackTool: null, requiresLLM: true, status: "failed", description: "No plan" },
        success: false,
        durationMs: 0,
        postconditionMet: false,
        error: "No active plan to resolve",
        usedFallback: false,
      };
    }

    const plan = subgoal.plan;
    const step = plan.steps[stepIdx];
    if (!step) {
      return {
        step: { tool: "", params: {}, expectedPostcondition: null, timeout: 0, fallbackTool: null, requiresLLM: true, status: "failed", description: "No step" },
        success: false,
        durationMs: 0,
        postconditionMet: false,
        error: "Step not found at pause index",
        usedFallback: false,
      };
    }

    // Resolve the LLM step with client-provided tool+params
    step.tool = tool;
    step.params = params;
    step.resolvedBy = "client";

    const result = await this.executeStepInternal(step);

    if (result.success) {
      step.status = "completed";
      plan.currentStepIndex = stepIdx + 1;
      delete goal.pausedAt;

      if (plan.currentStepIndex >= plan.steps.length) {
        subgoal.status = "completed";
        this.planner.evaluateGoal(goal);
      }
    } else {
      step.status = "failed";
    }

    return result;
  }

  /**
   * Execute a single ActionPlan's steps sequentially.
   * Pauses at LLM steps instead of failing.
   */
  async executePlan(
    plan: ActionPlan,
    recoveryBudget?: RecoveryBudget,
  ): Promise<{
    success: boolean;
    stepsExecuted: number;
    error: string | null;
    stepResults: StepResult[];
  } | ExecutionPause> {
    const stepResults: StepResult[] = [];

    for (let i = plan.currentStepIndex; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      plan.currentStepIndex = i;

      // Pause at LLM-required steps for client resolution
      if (step.requiresLLM && !step.tool) {
        return {
          paused: true,
          reason: "requires_llm",
          stepIndex: i,
          stepDescription: step.description,
          subgoalIndex: 0,
          completedSteps: stepResults.length,
          totalSteps: plan.steps.length,
        };
      }

      const result = await this.executeStepInternal(step);
      stepResults.push(result);

      if (!result.success) {
        step.status = "failed";

        // Attempt recovery before reporting failure
        if (this.recovery && recoveryBudget) {
          const expectedBundleId = this.worldModel.getState().focusedApp?.bundleId ?? null;
          const recoveryOutcome = await this.recovery.attemptRecovery(
            result.error ?? "unknown failure",
            expectedBundleId,
            recoveryBudget,
          );
          if (recoveryOutcome.recovered) {
            // Retry the failed step once after recovery
            step.status = "pending";
            const retryResult = await this.executeStepInternal(step);
            stepResults.push(retryResult);
            if (retryResult.success) {
              step.status = "completed";
              continue;
            }
            step.status = "failed";
          }
        }

        return {
          success: false,
          stepsExecuted: stepResults.length,
          error: result.error,
          stepResults,
        };
      }

      step.status = "completed";
    }

    return {
      success: true,
      stepsExecuted: stepResults.length,
      error: null,
      stepResults,
    };
  }

  /**
   * Execute a single PlanStep and verify its postcondition.
   */
  private async executeStepInternal(step: PlanStep): Promise<StepResult> {
    const start = Date.now();
    step.status = "executing";
    let usedFallback = false;

    // Inject adaptive budget from learning engine if available
    const params = { ...step.params };
    if (this.learningEngine && !params._budget) {
      const bundleId = this.worldModel.getState().focusedApp?.bundleId;
      if (bundleId) {
        params._budget = this.learningEngine.getAdaptiveBudget(bundleId);
      }
    }

    // Execute primary tool with timeout enforcement
    const stepTimeout = step.timeout || this.config.defaultStepTimeout;
    let result = await this.tryToolWithTimeout(step.tool, params, stepTimeout);

    // Try fallback if primary failed
    if (!result.ok && step.fallbackTool) {
      result = await this.tryToolWithTimeout(step.fallbackTool, params, stepTimeout);
      usedFallback = true;
    }

    if (!result.ok) {
      const durationMs = Date.now() - start;
      this.recordLearningOutcomes(
        usedFallback ? (step.fallbackTool ?? step.tool) : step.tool,
        params,
        false,
        durationMs,
      );
      return {
        step,
        success: false,
        durationMs,
        postconditionMet: false,
        error: result.error ?? "Tool execution failed",
        usedFallback,
      };
    }

    // Feed tool results into world model to keep it fresh between perception cycles
    this.feedWorldModel(usedFallback ? step.fallbackTool! : step.tool, params, result);

    // Record tool timing and locator outcomes to learning engine
    this.recordLearningOutcomes(
      usedFallback ? step.fallbackTool! : step.tool,
      params,
      true,
      Date.now() - start,
    );

    // Verify postcondition if defined
    let postconditionMet = true;
    let postconditionActual: string | null = null;
    if (step.expectedPostcondition) {
      // Wait briefly for state to update — best-effort if world model is empty
      await sleep(Math.min(this.config.postconditionWaitMs, 500));
      if (this.worldModel.getState().windows.size > 0) {
        const pcResult = this.worldModel.assertStateDetailed(
          step.expectedPostcondition,
        );
        postconditionMet = pcResult.matched;
        postconditionActual = pcResult.actual;
      }
    }

    return {
      step,
      success: postconditionMet,
      durationMs: Date.now() - start,
      postconditionMet,
      error: postconditionMet ? null : `Postcondition not met: expected ${step.expectedPostcondition?.type}="${step.expectedPostcondition?.target}", got ${postconditionActual ?? "nothing"}`,
      usedFallback,
    };
  }

  /**
   * Feed tool execution results into the world model to keep state fresh
   * between perception cycles. Best-effort — parse failures are silently ignored.
   */
  private feedWorldModel(
    tool: string,
    params: Record<string, unknown>,
    result: { ok: boolean; result?: string },
  ): void {
    if (!result.ok || !result.result) return;

    try {
      if (FOCUS_TOOLS.has(tool)) {
        const bundleId = (params.bundleId as string) ?? (params.appName as string);
        if (bundleId) {
          this.worldModel.updateFocusedApp({
            bundleId,
            appName: (params.appName as string) ?? bundleId,
            pid: 0,
            windowTitle: "",
          });
        }
      } else if (BROWSER_TOOLS.has(tool)) {
        // Extract URL and title from result for CDP snapshot
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(result.result) as Record<string, unknown>; } catch { /* not JSON */ }
        const url = (parsed?.url as string) ?? (params.url as string) ?? "";
        const title = (parsed?.title as string) ?? "";
        const bundleId = this.worldModel.getState().focusedApp?.bundleId;
        if (bundleId && url) {
          this.worldModel.ingestCDPSnapshot(bundleId, url, title);
        }
      } else if (tool === "ocr") {
        // OCR results may contain text regions
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(result.result) as Record<string, unknown>; } catch { /* not JSON */ }
        if (parsed?.regions && Array.isArray(parsed.regions)) {
          const windowId = (params.windowId as number) ??
            this.worldModel.getState().focusedWindowId ?? 0;
          const regions = (parsed.regions as Array<{ text: string; bounds: { x: number; y: number; width: number; height: number } }>);
          if (regions.length > 0 && windowId) {
            this.worldModel.ingestOCRRegions(windowId, regions);
          }
        }
      }
    } catch {
      // Best-effort: don't let world model feeding break execution
    }
  }

  /**
   * Record tool timing and locator outcomes to the learning engine.
   * Best-effort — errors are silently ignored.
   */
  private recordLearningOutcomes(
    tool: string,
    params: Record<string, unknown>,
    success: boolean,
    durationMs: number,
  ): void {
    if (!this.learningEngine) return;

    try {
      const bundleId = this.worldModel.getState().focusedApp?.bundleId;
      if (!bundleId) return;

      // Record tool timing for adaptive budget learning
      this.learningEngine.recordToolTiming({
        tool,
        bundleId,
        durationMs,
        success,
      });

      // Record locator outcome when a target/selector was used
      const target = (params.target ?? params.selector) as string | undefined;
      if (target && LOCATOR_TOOLS.has(tool)) {
        const method = tool.startsWith("browser_") ? "cdp" as const :
          tool === "ocr" ? "ocr" as const : "ax" as const;
        this.learningEngine.recordLocatorOutcome({
          bundleId,
          actionKey: tool,
          locator: target,
          method,
          success,
        });
      }
    } catch {
      // Best-effort
    }
  }

  private async tryToolWithTimeout(
    tool: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<{ ok: boolean; error?: string }> {
    return Promise.race([
      this.tryTool(tool, params),
      new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(
          () => resolve({ ok: false, error: `Step timeout after ${timeoutMs}ms` }),
          timeoutMs,
        ),
      ),
    ]);
  }

  private async tryTool(
    tool: string,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.executeTool(tool, params);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private diagnoseFailure(planResult: {
    error: string | null;
    stepResults: StepResult[];
  }, expectedBundleId?: string | null): ReplanReason {
    // Check if the focused app changed (app_switched)
    if (expectedBundleId) {
      const currentBundleId = this.worldModel.getState().focusedApp?.bundleId;
      if (currentBundleId && currentBundleId !== expectedBundleId) {
        return "app_switched";
      }
    }

    const lastFailed = [...planResult.stepResults].reverse().find((r: StepResult) => !r.success);
    if (!lastFailed) return "postcondition_mismatch";

    const error = lastFailed.error ?? "";

    if (error.includes("dialog") || error.includes("Dialog"))
      return "unexpected_dialog";
    if (error.includes("not found") || error.includes("LOCATE_FAILED"))
      return "element_not_found";
    if (error.includes("timeout") || error.includes("TIMEOUT"))
      return "timeout";
    if (error.includes("Postcondition")) return "postcondition_mismatch";

    return "postcondition_mismatch";
  }
}

/**
 * Tools whose results can be fed into the world model to keep it fresh.
 */
const FOCUS_TOOLS = new Set(["focus", "launch"]);
const BROWSER_TOOLS = new Set(["browser_navigate", "browser_open", "browser_dom", "browser_page_info"]);
const LOCATOR_TOOLS = new Set([
  "click", "click_text", "click_with_fallback",
  "type_text", "type_with_fallback",
  "ui_press", "ui_set_value", "ui_find",
  "browser_click", "browser_type",
  "select_with_fallback", "read_with_fallback", "locate_with_fallback",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
