// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeFileAtomicSync } from "../util/atomic-write.js";
import type { SharedPlaybook, ContributionMeta, SharedStep } from "./types.js";
import type { Playbook, PlaybookStep } from "../playbook/types.js";
import { RemoteCommunityAPI } from "./remote-api.js";

/**
 * PlaybookPublisher — prepares and publishes validated playbooks
 * to a local shared repository and optionally to a remote API
 * (when SCREENHAND_COMMUNITY_URL is set).
 */
export class PlaybookPublisher {
  private readonly repoDir: string;
  private readonly remote: RemoteCommunityAPI | null;

  constructor(repoDir?: string, remote?: RemoteCommunityAPI | null) {
    this.repoDir = repoDir ?? path.join(os.homedir(), ".screenhand", "community");
    this.remote = remote ?? RemoteCommunityAPI.fromEnv();
    fs.mkdirSync(this.repoDir, { recursive: true });
  }

  /**
   * Publish a validated local playbook to the community repository.
   * Requires the playbook to have been run successfully at least minRuns times.
   */
  publish(
    playbook: Playbook,
    successRate: number,
    executionCount: number,
    minRuns = 3,
  ): SharedPlaybook | null {
    if (executionCount < minRuns) return null;
    if (successRate < 0.5) return null;

    const shared: SharedPlaybook = {
      id: `community_${playbook.id}_${Date.now().toString(36)}`,
      name: playbook.name,
      description: playbook.description,
      platform: playbook.platform,
      bundleId: playbook.bundleId ?? "",
      version: "1.0.0",
      steps: this.convertSteps(playbook.steps),
      metadata: {
        author: os.userInfo().username,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        os: process.platform,
        successRate,
        executionCount,
        tags: playbook.tags ?? [],
      },
      ratings: {
        upvotes: 0,
        downvotes: 0,
        score: 0,
        reportCount: 0,
      },
    };

    // Strip sensitive data from params
    for (const step of shared.steps) {
      this.sanitizeParams(step.params);
    }

    const filePath = path.join(this.repoDir, `${shared.id}.json`);
    writeFileAtomicSync(filePath, JSON.stringify(shared, null, 2) + "\n");

    // Best-effort sync to remote API
    if (this.remote) {
      void this.remote.publish(shared).catch(() => {});
    }

    return shared;
  }

  /**
   * List all published playbooks in the local repository.
   */
  list(): SharedPlaybook[] {
    const playbooks: SharedPlaybook[] = [];
    try {
      const files = fs.readdirSync(this.repoDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = fs.readFileSync(path.join(this.repoDir, file), "utf-8");
          playbooks.push(JSON.parse(raw) as SharedPlaybook);
        } catch { /* skip */ }
      }
    } catch { /* dir not found */ }
    return playbooks;
  }

  private convertSteps(steps: PlaybookStep[]): SharedStep[] {
    return steps.map((step) => ({
      action: step.action,
      tool: this.actionToTool(step.action),
      params: this.extractParams(step),
      description: step.description ?? `${step.action} step`,
    }));
  }

  private extractParams(step: PlaybookStep): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (step.target !== undefined) params.target = step.target;
    if (step.text !== undefined) params.text = step.text;
    if (step.url !== undefined) params.url = step.url;
    if (step.keys !== undefined) params.keys = step.keys;
    if (step.menuPath !== undefined) params.menuPath = step.menuPath;
    if (step.ms !== undefined) params.ms = step.ms;
    if (step.direction !== undefined) params.direction = step.direction;
    if (step.amount !== undefined) params.amount = step.amount;
    return params;
  }

  private actionToTool(action: string): string {
    switch (action) {
      case "click": return "click_with_fallback";
      case "type": return "type_with_fallback";
      case "press": return "key";
      case "navigate": return "browser_navigate";
      case "wait": return "wait_for_state";
      case "scroll": return "scroll_with_fallback";
      default: return action;
    }
  }

  /**
   * Remove potentially sensitive values from params.
   */
  private sanitizeParams(params: Record<string, unknown>): void {
    const sensitiveKeys = [
      "password", "token", "secret", "key", "credential",
      "apiKey", "api_key", "auth",
    ];
    for (const key of Object.keys(params)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        delete params[key];
      }
      // Strip absolute file paths
      if (typeof params[key] === "string" && (params[key] as string).startsWith("/")) {
        const val = params[key] as string;
        if (val.includes("/Users/") || val.includes("/home/")) {
          params[key] = path.basename(val);
        }
      }
    }
  }
}
