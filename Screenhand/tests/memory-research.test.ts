import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { backgroundResearch } from "../src/memory/research.js";
import { MemoryStore } from "../src/memory/store.js";

let tmpDir: string;
let store: MemoryStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-test-"));
  store = new MemoryStore(tmpDir);
  store.init();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("backgroundResearch", () => {
  it("returns immediately (non-blocking)", () => {
    const start = Date.now();
    // Mock fetch to prevent actual network calls
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    backgroundResearch(store, "launch", { bundleId: "com.test" }, "app not found");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it("does not throw on any input", () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    expect(() => backgroundResearch(store, "launch", {}, "error")).not.toThrow();
    expect(() => backgroundResearch(store, "", {}, "")).not.toThrow();
    expect(() => backgroundResearch(store, "key", { combo: "cmd+s" }, "failed")).not.toThrow();
  });

  it("saves resolution to error cache (mock fetch)", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        AbstractText: "Try launching the app with the correct bundle ID from the Applications folder.",
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    // Delete API key so it falls through to DuckDuckGo path
    const origKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    backgroundResearch(store, "launch", { bundleId: "com.test" }, "app not found");

    // Wait for the async work to complete
    await new Promise((r) => setTimeout(r, 100));

    const errors = store.readErrors();
    // Should have the seed error (from backgroundResearch) plus any existing
    const researchErrors = errors.filter((e) => e.resolution !== null);
    expect(researchErrors.length).toBeGreaterThan(0);
    expect(researchErrors[0]!.resolution).toContain("bundle ID");

    // Restore
    if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
  });

  it("saves resolution as strategy too (mock fetch)", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        AbstractText: "Use the correct app identifier to launch applications on macOS.",
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const origKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    const initialCount = store.readStrategies().length;
    backgroundResearch(store, "launch", { bundleId: "com.test" }, "app not found");

    await new Promise((r) => setTimeout(r, 100));

    const strategies = store.readStrategies();
    expect(strategies.length).toBeGreaterThan(initialCount);
    const researchStrategy = strategies.find((s) => s.id.startsWith("str_research_"));
    expect(researchStrategy).toBeDefined();
    expect(researchStrategy!.tags).toContain("research");

    if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
  });

  it("handles fetch failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const origKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    const initialErrors = store.readErrors().length;
    backgroundResearch(store, "launch", {}, "test error");

    await new Promise((r) => setTimeout(r, 100));

    // No new errors should be added since fetch failed
    const errors = store.readErrors();
    expect(errors.length).toBe(initialErrors);

    if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
  });

  it("falls back to DuckDuckGo when no API key", async () => {
    const origKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: "DuckDuckGo answer for macOS automation fix.",
      }),
    } as Response);

    backgroundResearch(store, "focus", { bundleId: "com.test" }, "app not running");

    await new Promise((r) => setTimeout(r, 100));

    // Should have called DuckDuckGo (api.duckduckgo.com), not Anthropic
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("duckduckgo.com");

    if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
  });

  it("tries Claude API first when API key is set", async () => {
    const origKey = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Use the correct bundle identifier for the application." }],
      }),
    } as Response);

    backgroundResearch(store, "launch", {}, "app not found");

    await new Promise((r) => setTimeout(r, 100));

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("anthropic.com");

    if (origKey !== undefined) {
      process.env["ANTHROPIC_API_KEY"] = origKey;
    } else {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });
});
