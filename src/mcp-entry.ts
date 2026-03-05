#!/usr/bin/env node

/**
 * ScreenHand MCP Server — stdio entry point.
 *
 * Usage in claude_desktop_config.json or openclaw.json:
 *
 *   {
 *     "mcpServers": {
 *       "screenhand": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/screenhand/src/mcp-entry.ts"]
 *       }
 *     }
 *   }
 *
 * Environment variables:
 *   SCREENHAND_ADAPTER  - "accessibility" (default), "composite", "cdp", "placeholder"
 *   SCREENHAND_HEADLESS - "1" to run browser in headless mode
 */

import type { AppAdapter } from "./runtime/app-adapter.js";
import { PlaceholderAppAdapter } from "./runtime/app-adapter.js";
import { CdpChromeAdapter } from "./runtime/cdp-chrome-adapter.js";
import { TimelineLogger } from "./logging/timeline-logger.js";
import { AutomationRuntimeService } from "./runtime/service.js";
import { startMcpStdioServer } from "./mcp/mcp-stdio-server.js";

async function createAdapter(): Promise<AppAdapter> {
  const adapterType = process.env.SCREENHAND_ADAPTER ?? process.env.AUTOMATOR_ADAPTER ?? "accessibility";

  switch (adapterType) {
    case "placeholder":
      return new PlaceholderAppAdapter();

    case "cdp":
      return new CdpChromeAdapter({
        headless: process.env.SCREENHAND_HEADLESS === "1" || process.env.AUTOMATOR_HEADLESS === "1",
      });

    case "composite": {
      const { BridgeClient } = await import("./native/bridge-client.js");
      const { CompositeAdapter } = await import("./runtime/composite-adapter.js");
      const bridge = new BridgeClient();
      return new CompositeAdapter(bridge, {
        headless: process.env.SCREENHAND_HEADLESS === "1" || process.env.AUTOMATOR_HEADLESS === "1",
      });
    }

    case "accessibility":
    default: {
      const { BridgeClient } = await import("./native/bridge-client.js");
      const { AccessibilityAdapter } = await import("./runtime/accessibility-adapter.js");
      const bridge = new BridgeClient();
      return new AccessibilityAdapter(bridge);
    }
  }
}

try {
  const adapter = await createAdapter();
  const logger = new TimelineLogger();
  const runtime = new AutomationRuntimeService(adapter, logger);

  process.stderr.write("ScreenHand MCP server starting...\n");
  await startMcpStdioServer(runtime);
  process.stderr.write("ScreenHand MCP server connected.\n");
} catch (e) {
  process.stderr.write(`ScreenHand startup error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
