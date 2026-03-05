import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  Target,
  WaitCondition,
  ToolName,
  UIEventType,
  SessionInfo,
  AppContext,
  LocatedElement,
  WindowInfo,
  RunningApp,
} from "../src/types.js";

/**
 * Type-level tests to ensure the type definitions compile correctly
 * and cover expected shapes. These catch regressions in the public API.
 */

describe("Type definitions", () => {
  it("Target union covers all locator strategies", () => {
    const selectorTarget: Target = { type: "selector", value: "button.submit" };
    const textTarget: Target = { type: "text", value: "Click me", exact: true };
    const roleTarget: Target = { type: "role", role: "button", name: "Submit" };
    const axPathTarget: Target = { type: "ax_path", path: ["0", "1", "3"] };
    const axAttrTarget: Target = { type: "ax_attribute", attribute: "AXIdentifier", value: "btn1" };
    const coordTarget: Target = { type: "coordinates", x: 100, y: 200 };
    const imageTarget: Target = { type: "image", base64: "abc123", confidence: 0.9 };

    // All should compile and be assignable
    const targets: Target[] = [
      selectorTarget, textTarget, roleTarget,
      axPathTarget, axAttrTarget, coordTarget, imageTarget,
    ];
    expect(targets).toHaveLength(7);
  });

  it("WaitCondition covers all condition types", () => {
    const conditions: WaitCondition[] = [
      { type: "selector_visible", selector: ".loaded" },
      { type: "selector_hidden", selector: ".spinner" },
      { type: "url_matches", regex: "https://.*" },
      { type: "text_appears", text: "Success" },
      { type: "element_exists", target: { type: "text", value: "OK" } },
      { type: "element_gone", target: { type: "text", value: "Loading" } },
      { type: "window_title_matches", regex: "Untitled" },
    ];
    expect(conditions.length).toBeGreaterThan(0);
  });

  it("SessionInfo has required fields", () => {
    const session: SessionInfo = {
      sessionId: "test-123",
      profile: "default",
      createdAt: Date.now(),
      adapterType: "composite",
    };
    expect(session.sessionId).toBe("test-123");
  });

  it("AppContext has required fields", () => {
    const ctx: AppContext = {
      bundleId: "com.apple.Notes",
      appName: "Notes",
      pid: 1234,
      windowTitle: "My Note",
    };
    expect(ctx.pid).toBe(1234);
  });

  it("WindowInfo has required fields", () => {
    const win: WindowInfo = {
      windowId: 42,
      title: "Test Window",
      appName: "TestApp",
      bundleId: "com.test.app",
      pid: 5678,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      isOnScreen: true,
    };
    expect(win.windowId).toBe(42);
  });

  it("RunningApp has required fields", () => {
    const app: RunningApp = {
      name: "Finder",
      bundleId: "com.apple.finder",
      pid: 100,
      isActive: true,
    };
    expect(app.name).toBe("Finder");
  });
});
