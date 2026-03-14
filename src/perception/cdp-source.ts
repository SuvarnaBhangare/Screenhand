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

import type { PerceptionEvent, CDPMutationData } from "./types.js";

/**
 * CDP perception source — tracks DOM mutations and provides snapshots
 * via Chrome DevTools Protocol.
 *
 * The CDP client is injected as `any` since it comes from the `chrome-remote-interface`
 * package which is dynamically imported in mcp-desktop.ts.
 */
export class CDPSource {
  private mutationBuffer: CDPMutationData["mutations"] = [];
  private observerInstalled = false;
  private readonly maxBufferSize = 100;

  /**
   * Install a DOM mutation observer via CDP Runtime.evaluate.
   * This injects a MutationObserver into the page that sends mutations
   * back via CDP's Runtime.consoleAPICalled.
   */
  async installMutationObserver(cdpClient: any): Promise<void> {
    if (this.observerInstalled) return;

    try {
      // Enable DOM and Runtime domains
      await cdpClient.DOM.enable();
      await cdpClient.Runtime.enable();

      // Inject MutationObserver that logs changes as JSON
      await cdpClient.Runtime.evaluate({
        expression: `
          (() => {
            if (window.__shMutationObserver) return;
            const observer = new MutationObserver((mutations) => {
              const summary = mutations.slice(0, 20).map(m => ({
                type: m.type,
                target: m.target.nodeName + (m.target.id ? '#' + m.target.id : ''),
                attribute: m.attributeName || undefined,
                addedNodes: m.addedNodes.length,
                removedNodes: m.removedNodes.length,
              }));
              console.debug('__sh_mutations__' + JSON.stringify(summary));
            });
            observer.observe(document.body, {
              childList: true, subtree: true,
              attributes: true, attributeOldValue: true,
            });
            window.__shMutationObserver = observer;
          })();
        `,
        returnByValue: true,
      });

      // Listen for console messages that contain mutation data
      cdpClient.Runtime.consoleAPICalled((params: any) => {
        if (params.type === "debug" && params.args?.length > 0) {
          const msg = params.args[0]?.value;
          if (typeof msg === "string") {
            this.processCDPConsoleMessage(msg);
          }
        }
      });

      this.observerInstalled = true;
    } catch {
      // CDP not available or page not ready
    }
  }

  /**
   * Process a CDP console message that might contain mutation data.
   * Call this from a Runtime.consoleAPICalled handler.
   */
  processCDPConsoleMessage(message: string): void {
    if (!message.startsWith("__sh_mutations__")) return;

    try {
      const raw = JSON.parse(message.slice("__sh_mutations__".length)) as Array<{
        type: string;
        target: string;
        attribute?: string;
        addedNodes: number;
        removedNodes: number;
      }>;

      for (const m of raw) {
        const entry: CDPMutationData["mutations"][number] = {
          selector: m.target,
        };
        if (m.attribute) entry.attribute = m.attribute;
        if (m.addedNodes) entry.addedNodes = m.addedNodes;
        if (m.removedNodes) entry.removedNodes = m.removedNodes;
        this.mutationBuffer.push(entry);
      }

      // Cap buffer
      if (this.mutationBuffer.length > this.maxBufferSize) {
        this.mutationBuffer = this.mutationBuffer.slice(-this.maxBufferSize);
      }
    } catch {
      // Malformed message
    }
  }

  /**
   * FAST rate: drain buffered DOM mutations.
   */
  drainMutations(): PerceptionEvent | null {
    if (this.mutationBuffer.length === 0) return null;

    const mutations = [...this.mutationBuffer];
    this.mutationBuffer = [];

    return {
      source: "cdp_mutations",
      rate: "fast",
      timestamp: new Date().toISOString(),
      data: {
        type: "cdp_mutations",
        mutations,
      },
    };
  }

  /**
   * MEDIUM rate: take a DOM snapshot — page URL, title, node count.
   */
  async pollSnapshot(cdpClient: any): Promise<PerceptionEvent | null> {
    try {
      const result = await cdpClient.Runtime.evaluate({
        expression: `JSON.stringify({
          url: location.href,
          title: document.title,
          nodeCount: document.querySelectorAll('*').length,
        })`,
        returnByValue: true,
      });

      const data = JSON.parse(result.result.value as string) as {
        url: string;
        title: string;
        nodeCount: number;
      };

      return {
        source: "cdp_snapshot",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: {
          type: "cdp_snapshot",
          ...data,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Reset state (e.g., on page navigation).
   */
  reset(): void {
    this.mutationBuffer = [];
    this.observerInstalled = false;
  }
}
