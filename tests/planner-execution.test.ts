// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GoalStore } from "../src/planner/goal-store.js";
import { ToolRegistry } from "../src/planner/tool-registry.js";
import type { Goal } from "../src/planner/types.js";

function makeGoal(overrides?: Partial<Goal>): Goal {
  return {
    id: `goal_${Math.random().toString(36).slice(2, 8)}`,
    description: "Test goal",
    status: "pending",
    subgoals: [{
      id: "sg_1",
      description: "Sub 1",
      status: "pending",
      plan: null,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
    }],
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

describe("goal-store", () => {
  let tmpDir: string;
  let store: GoalStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goalstore-test-"));
    store = new GoalStore(tmpDir);
    store.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(store.list()).toHaveLength(0);
  });

  it("add and get", () => {
    const goal = makeGoal({ id: "goal_abc" });
    store.add(goal);

    expect(store.get("goal_abc")).toBeDefined();
    expect(store.get("goal_abc")!.description).toBe("Test goal");
    expect(store.list()).toHaveLength(1);
  });

  it("update replaces goal", () => {
    const goal = makeGoal({ id: "goal_x" });
    store.add(goal);

    goal.status = "completed";
    store.update("goal_x", goal);

    expect(store.get("goal_x")!.status).toBe("completed");
  });

  it("remove", () => {
    const goal = makeGoal({ id: "goal_r" });
    store.add(goal);
    expect(store.remove("goal_r")).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("list filters by status", () => {
    store.add(makeGoal({ id: "g1", status: "active" }));
    store.add(makeGoal({ id: "g2", status: "completed" }));
    store.add(makeGoal({ id: "g3", status: "active" }));

    expect(store.list("active")).toHaveLength(2);
    expect(store.list("completed")).toHaveLength(1);
    expect(store.list("failed")).toHaveLength(0);
  });

  it("persists and reloads", () => {
    store.add(makeGoal({ id: "goal_persist", description: "Persisted" }));

    const store2 = new GoalStore(tmpDir);
    store2.init();

    expect(store2.get("goal_persist")).toBeDefined();
    expect(store2.get("goal_persist")!.description).toBe("Persisted");
  });

  it("prune evicts old completed goals", () => {
    // Add 110 completed goals
    for (let i = 0; i < 110; i++) {
      store.add(makeGoal({
        id: `goal_${i}`,
        status: "completed",
        createdAt: new Date(Date.now() - (110 - i) * 1000).toISOString(),
      }));
    }

    const evicted = store.prune();
    expect(evicted).toBe(10);
    expect(store.list()).toHaveLength(100);
  });
});

describe("tool-registry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and executes tools", async () => {
    registry.register("test_tool", async (params) => ({
      content: [{ type: "text", text: `Got: ${params.value}` }],
    }));

    expect(registry.has("test_tool")).toBe(true);
    expect(registry.has("other")).toBe(false);

    const result = await registry.execute("test_tool", { value: "hello" });
    expect(result.ok).toBe(true);
    expect(result.result).toBe("Got: hello");
  });

  it("returns error for unknown tools", async () => {
    const result = await registry.execute("nonexistent", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("handles tool exceptions", async () => {
    registry.register("bad_tool", async () => {
      throw new Error("Tool crashed");
    });

    const result = await registry.execute("bad_tool", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tool crashed");
  });

  it("toExecutor returns a valid ToolExecutor", async () => {
    registry.register("echo", async (params) => ({
      content: [{ type: "text", text: JSON.stringify(params) }],
    }));

    const executor = registry.toExecutor();
    const result = await executor("echo", { foo: "bar" });
    expect(result.ok).toBe(true);
    expect(result.result).toContain("bar");
  });
});
