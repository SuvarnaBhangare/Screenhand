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

import type { Playbook, PlaybookStep, PlaybookFlow } from "../playbook/types.js";
import type { Strategy, StrategyStep } from "../memory/types.js";
import type { ActionPlan, PlanStep, PlannerConfig } from "./types.js";
import { DEFAULT_PLANNER_CONFIG } from "./types.js";
import type { LearningEngine } from "../learning/engine.js";

/** Minimum score threshold for a learned locator to override a playbook/strategy locator */
const LEARNED_LOCATOR_MIN_SCORE = 0.7;

/**
 * Maps PlaybookStep action types to MCP tool names.
 */
const ACTION_TO_TOOL: Record<string, string> = {
  navigate: "browser_navigate",
  press: "click_with_fallback",
  type_into: "type_with_fallback",
  key: "key",
  scroll: "scroll_with_fallback",
  wait: "wait_for_state",
  screenshot: "screenshot",
  extract: "browser_js",
  menu_click: "menu_click",
  browser_js: "browser_js",
  browser_click: "browser_click",
  browser_type: "browser_type",
  cdp_key_event: "browser_js",
  key_combo: "key",
};

/**
 * Converts a Playbook into an ActionPlan for deterministic execution.
 * No LLM calls needed — all steps come from the playbook.
 */
export function playbookToPlan(
  playbook: Playbook,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
  learningEngine?: LearningEngine | null,
  bundleId?: string,
): ActionPlan {
  const steps: PlanStep[] = playbook.steps.map((step, i) =>
    playbookStepToPlanStep(step, i, config, learningEngine, bundleId),
  );

  const reliability =
    playbook.successCount + playbook.failCount > 0
      ? playbook.successCount / (playbook.successCount + playbook.failCount)
      : 0.5;

  return {
    steps,
    currentStepIndex: 0,
    confidence: reliability,
    source: "playbook",
    sourceId: playbook.id,
  };
}

/**
 * Converts a Strategy (from memory recall) into an ActionPlan.
 */
export function strategyToPlan(
  strategy: Strategy,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
  learningEngine?: LearningEngine | null,
  bundleId?: string,
): ActionPlan {
  const steps: PlanStep[] = strategy.steps.map((step, i) =>
    strategyStepToPlanStep(step, i, config, learningEngine, bundleId),
  );

  const reliability =
    strategy.successCount + strategy.failCount > 0
      ? strategy.successCount / (strategy.successCount + strategy.failCount)
      : 0.5;

  return {
    steps,
    currentStepIndex: 0,
    confidence: reliability,
    source: "strategy",
    sourceId: strategy.id,
  };
}

/**
 * Converts a reference flow (from references/*.json) into an ActionPlan.
 * Flows are human-readable step descriptions, so each step is marked
 * requiresLLM=true — the LLM interprets the description into tool calls.
 */
export function flowToPlan(
  flowName: string,
  flow: PlaybookFlow,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
): ActionPlan {
  const steps: PlanStep[] = flow.steps.map((stepDesc, i) => ({
    tool: "",
    params: {},
    expectedPostcondition: null,
    timeout: config.defaultStepTimeout,
    fallbackTool: null,
    requiresLLM: true,
    status: "pending" as const,
    description: stepDesc,
  }));

  return {
    steps,
    currentStepIndex: 0,
    confidence: 0.4,
    source: "reference_flow",
    sourceId: flowName,
  };
}

function playbookStepToPlanStep(
  step: PlaybookStep,
  _index: number,
  config: PlannerConfig,
  learningEngine?: LearningEngine | null,
  bundleId?: string,
): PlanStep {
  const tool = ACTION_TO_TOOL[step.action] ?? step.action;
  const params: Record<string, unknown> = {};

  if (step.target) params.target = step.target;
  if (step.text) params.text = step.text;
  if (step.url) params.url = step.url;
  if (step.keys) params.keys = step.keys;
  if (step.code) params.code = step.code;
  if (step.format) params.format = step.format;
  if (step.amount !== undefined) params.amount = step.amount;
  if (step.locateByOcr) {
    params.locateByOcr = step.locateByOcr;
    if (step.offsetX !== undefined) params.offsetX = step.offsetX;
    if (step.offsetY !== undefined) params.offsetY = step.offsetY;
  }
  if (step.keyEvent) params.keyEvent = step.keyEvent;
  if (step.menuPath) params.menuPath = step.menuPath;
  if (step.ms !== undefined) params.ms = step.ms;

  // Overlay learned locator if confidence is high enough
  applyLearnedLocator(params, tool, learningEngine, bundleId);

  return {
    tool,
    params,
    expectedPostcondition: step.verify
      ? { type: "control_exists", target: step.verify }
      : null,
    timeout: step.verifyTimeoutMs ?? config.defaultStepTimeout,
    fallbackTool: null,
    requiresLLM: false,
    status: "pending",
    description: step.description ?? `${step.action} ${step.target ?? ""}`.trim(),
  };
}

function strategyStepToPlanStep(
  step: StrategyStep,
  _index: number,
  config: PlannerConfig,
  learningEngine?: LearningEngine | null,
  bundleId?: string,
): PlanStep {
  const params = { ...step.params };

  // Overlay learned locator if confidence is high enough
  applyLearnedLocator(params, step.tool, learningEngine, bundleId);

  return {
    tool: step.tool,
    params,
    expectedPostcondition: null,
    timeout: config.defaultStepTimeout,
    fallbackTool: null,
    requiresLLM: false,
    status: "pending",
    description: `${step.tool} (from strategy)`,
  };
}

/**
 * If the learning engine has a proven locator for this tool×app pair,
 * override the step's target/selector with the learned one.
 */
function applyLearnedLocator(
  params: Record<string, unknown>,
  tool: string,
  learningEngine?: LearningEngine | null,
  bundleId?: string,
): void {
  if (!learningEngine || !bundleId) return;

  const rec = learningEngine.recommendLocator(bundleId, tool);
  if (!rec || rec.score < LEARNED_LOCATOR_MIN_SCORE) return;

  // Only override target-based params — don't replace url, keys, code, etc.
  if (params.target !== undefined || params.selector !== undefined) {
    params._originalTarget = params.target ?? params.selector;
    params.target = rec.locator;
    params._learnedLocator = true;
    if (rec.method === "cdp") {
      params.selector = rec.locator;
    }
  }
}
