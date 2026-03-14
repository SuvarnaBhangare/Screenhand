// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import type { SharedPlaybook, ValidationResult } from "./types.js";
import type { ToolExecutor } from "../planner/executor.js";

/**
 * PlaybookValidator — tests a community playbook against the live app
 * before accepting it into the local collection.
 */
export class PlaybookValidator {
  constructor(private readonly executeTool: ToolExecutor) {}

  /**
   * Validate a community playbook by executing its steps.
   * Runs all steps and reports success/failure.
   */
  async validate(playbook: SharedPlaybook): Promise<ValidationResult> {
    const errors: string[] = [];
    let stepsCompleted = 0;

    for (const step of playbook.steps) {
      try {
        const result = await this.executeTool(step.tool, step.params);
        if (result.ok) {
          stepsCompleted++;
        } else {
          errors.push(
            `Step ${stepsCompleted + 1} ("${step.description}") failed: ${result.error ?? "unknown error"}`,
          );
          break; // Stop on first failure
        }
      } catch (err) {
        errors.push(
          `Step ${stepsCompleted + 1} ("${step.description}") threw: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
    }

    return {
      playbook,
      success: stepsCompleted === playbook.steps.length,
      stepsCompleted,
      totalSteps: playbook.steps.length,
      errors,
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate multiple playbooks and return the best one.
   */
  async findBest(playbooks: SharedPlaybook[]): Promise<ValidationResult | null> {
    for (const pb of playbooks) {
      const result = await this.validate(pb);
      if (result.success) return result;
    }
    return null;
  }
}
