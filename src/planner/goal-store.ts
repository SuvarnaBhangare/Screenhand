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

/**
 * GoalStore — atomic JSON persistence for planner goals.
 *
 * In-memory cache + sync atomic writes (same pattern as JobStore).
 * File: ~/.screenhand/planner/goals.json
 */

import fs from "node:fs";
import path from "node:path";
import { writeFileAtomicSync, readJsonWithRecovery } from "../util/atomic-write.js";
import type { Goal, GoalStatus } from "./types.js";

const MAX_GOALS = 100;

export class GoalStore {
  private readonly filePath: string;
  private goals: Goal[] = [];
  private initialized = false;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "goals.json");
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.goals = readJsonWithRecovery<Goal[]>(this.filePath) ?? [];
  }

  get(id: string): Goal | undefined {
    return this.goals.find((g) => g.id === id);
  }

  list(status?: GoalStatus): Goal[] {
    if (status) return this.goals.filter((g) => g.status === status);
    return [...this.goals];
  }

  add(goal: Goal): void {
    this.goals.push(goal);
    this.persist();
  }

  update(id: string, goal: Goal): void {
    const idx = this.goals.findIndex((g) => g.id === id);
    if (idx < 0) {
      this.goals.push(goal);
    } else {
      this.goals[idx] = goal;
    }
    this.persist();
  }

  remove(id: string): boolean {
    const before = this.goals.length;
    this.goals = this.goals.filter((g) => g.id !== id);
    if (this.goals.length < before) {
      this.persist();
      return true;
    }
    return false;
  }

  prune(): number {
    const terminal = this.goals
      .filter((g) => g.status === "completed" || g.status === "failed")
      .sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    if (terminal.length <= MAX_GOALS) return 0;

    const evictCount = terminal.length - MAX_GOALS;
    const evictIds = new Set(terminal.slice(0, evictCount).map((g) => g.id));
    this.goals = this.goals.filter((g) => !evictIds.has(g.id));
    this.persist();
    return evictCount;
  }

  private persist(): void {
    try {
      writeFileAtomicSync(this.filePath, JSON.stringify(this.goals, null, 2));
    } catch {
      // Non-critical — in-memory cache is authoritative
    }
  }
}
