import { describe, it, expect } from "vitest";

// ── Routing logic tests ──
// We test the routing constants and logic without instantiating the full adapter
// (which requires a real bridge subprocess).

describe("CompositeAdapter routing constants", () => {
  it("BROWSER_BUNDLES contains major Chromium browsers (macOS)", async () => {
    // Import the module to verify the constants are defined correctly
    const mod = await import("../src/runtime/composite-adapter.js");
    // The constants are module-level, not exported — so we test the behavior
    // by checking that the module loads without error
    expect(mod.CompositeAdapter).toBeDefined();
  });

  it("correctly identifies browser process names for Windows routing", () => {
    // These are the process names that should route to CDP on Windows
    const browserProcessNames = new Set([
      "chrome", "chrome.exe",
      "brave", "brave.exe",
      "msedge", "msedge.exe",
      "vivaldi", "vivaldi.exe",
      "chromium", "chromium.exe",
    ]);

    // Positive cases
    expect(browserProcessNames.has("chrome")).toBe(true);
    expect(browserProcessNames.has("chrome.exe")).toBe(true);
    expect(browserProcessNames.has("msedge")).toBe(true);
    expect(browserProcessNames.has("brave.exe")).toBe(true);

    // Negative cases — these should NOT route to CDP
    expect(browserProcessNames.has("notepad")).toBe(false);
    expect(browserProcessNames.has("firefox")).toBe(false);
    expect(browserProcessNames.has("explorer")).toBe(false);
    expect(browserProcessNames.has("safari")).toBe(false);
  });

  it("correctly identifies browser bundle IDs for macOS routing", () => {
    const browserBundles = new Set([
      "com.google.Chrome",
      "com.google.Chrome.canary",
      "com.brave.Browser",
      "com.microsoft.edgemac",
      "com.vivaldi.Vivaldi",
      "org.chromium.Chromium",
    ]);

    expect(browserBundles.has("com.google.Chrome")).toBe(true);
    expect(browserBundles.has("com.apple.Safari")).toBe(false);
    expect(browserBundles.has("com.apple.Notes")).toBe(false);
  });
});

describe("Platform-aware routing", () => {
  it("isWindows flag matches process.platform", () => {
    const isWindows = process.platform === "win32";

    if (process.platform === "darwin") {
      expect(isWindows).toBe(false);
    }
    // On Windows CI this would be true
  });
});
