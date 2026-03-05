import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeClient } from "../src/native/bridge-client.js";
import { EventEmitter } from "node:events";
import { ChildProcess } from "node:child_process";
import path from "node:path";

// ── Platform detection ──

describe("BridgeClient platform detection", () => {
  it("selects macOS binary path when platform is darwin", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });

    const client = new BridgeClient();
    // Access the private binaryPath via any cast
    const binaryPath = (client as any).binaryPath as string;
    expect(binaryPath).toContain("macos-bridge");
    expect(binaryPath).not.toContain("windows-bridge");

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("selects Windows binary path when platform is win32", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", writable: true });

    const client = new BridgeClient();
    const binaryPath = (client as any).binaryPath as string;
    expect(binaryPath).toContain("windows-bridge");
    expect(binaryPath).toContain(".exe");

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("accepts a custom binary path", () => {
    const customPath = "/custom/path/to/bridge";
    const client = new BridgeClient(customPath);
    expect((client as any).binaryPath).toBe(customPath);
  });
});

// ── JSON-RPC line parsing ──

describe("BridgeClient JSON-RPC parsing", () => {
  let client: BridgeClient;

  beforeEach(() => {
    client = new BridgeClient("/fake/path");
  });

  afterEach(async () => {
    await client.stop();
  });

  it("resolves pending request on valid response", async () => {
    // Manually set up a pending request and feed it a line
    const pending = (client as any).pending as Map<number, any>;

    const resultPromise = new Promise((resolve, reject) => {
      pending.set(1, {
        resolve,
        reject,
        timer: setTimeout(() => reject(new Error("timeout")), 5000),
      });
    });

    // Simulate receiving a response line
    (client as any).handleLine(JSON.stringify({ id: 1, result: { pong: true } }));

    const result = await resultPromise;
    expect(result).toEqual({ pong: true });
    expect(pending.size).toBe(0);
  });

  it("rejects pending request on error response", async () => {
    const pending = (client as any).pending as Map<number, any>;

    const resultPromise = new Promise((resolve, reject) => {
      pending.set(2, {
        resolve,
        reject,
        timer: setTimeout(() => reject(new Error("timeout")), 5000),
      });
    });

    (client as any).handleLine(JSON.stringify({
      id: 2,
      result: null,
      error: { code: -1, message: "Not found: element" },
    }));

    await expect(resultPromise).rejects.toThrow("Not found: element");
    expect(pending.size).toBe(0);
  });

  it("emits ax-event for event messages", async () => {
    const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.on("ax-event", resolve);
    });

    (client as any).handleLine(JSON.stringify({
      id: 0,
      event: { type: "value_changed", pid: 123 },
    }));

    const event = await eventPromise;
    expect(event).toEqual({ type: "value_changed", pid: 123 });
  });

  it("ignores malformed JSON lines", () => {
    // Should not throw
    (client as any).handleLine("not json at all");
    (client as any).handleLine("{incomplete");
    (client as any).handleLine("");
  });

  it("ignores responses for unknown request IDs", () => {
    // Should not throw
    (client as any).handleLine(JSON.stringify({ id: 999, result: "orphan" }));
  });
});

// ── Lifecycle ──

describe("BridgeClient lifecycle", () => {
  it("rejects all pending requests on stop", async () => {
    const client = new BridgeClient("/fake/path");
    const pending = (client as any).pending as Map<number, any>;

    const p1 = new Promise((resolve, reject) => {
      pending.set(10, {
        resolve,
        reject,
        timer: setTimeout(() => reject(new Error("timeout")), 5000),
      });
    });

    const p2 = new Promise((resolve, reject) => {
      pending.set(11, {
        resolve,
        reject,
        timer: setTimeout(() => reject(new Error("timeout")), 5000),
      });
    });

    await client.stop();

    await expect(p1).rejects.toThrow("Bridge stopped");
    await expect(p2).rejects.toThrow("Bridge stopped");
    expect(pending.size).toBe(0);
  });

  it("start is idempotent after first call", async () => {
    const client = new BridgeClient("/fake/path");
    (client as any).started = true;

    // Second start() should return immediately without spawning
    await client.start(); // should not throw or spawn
    expect((client as any).process).toBeNull();
  });
});

// ── MacOSBridgeClient backward compat ──

describe("MacOSBridgeClient backward compatibility", () => {
  it("MacOSBridgeClient is the same as BridgeClient", async () => {
    const { MacOSBridgeClient } = await import("../src/native/bridge-client.js");
    expect(MacOSBridgeClient).toBe(BridgeClient);
  });

  it("re-export from macos-bridge-client.ts works", async () => {
    const mod = await import("../src/native/macos-bridge-client.js");
    expect(mod.MacOSBridgeClient).toBe(BridgeClient);
    expect(mod.BridgeClient).toBe(BridgeClient);
  });
});
