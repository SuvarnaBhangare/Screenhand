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

import type { StateObserver } from "../runtime/state-observer.js";
import type { BridgeClient } from "../native/bridge-client.js";
import type { AXNode, AppContext } from "../types.js";
import type { PerceptionEvent } from "./types.js";

/**
 * AX perception source — wraps StateObserver for push events
 * and provides periodic AX tree polling for structured snapshots.
 */
export class AXSource {
  constructor(
    private readonly observer: StateObserver,
    private readonly bridge: BridgeClient,
  ) {}

  /**
   * FAST rate: drain buffered AX events from StateObserver.
   * Returns a PerceptionEvent if there are events, null otherwise.
   */
  drainEvents(): PerceptionEvent | null {
    const events = this.observer.drainEvents();
    if (events.length === 0) return null;

    return {
      source: "ax_events",
      rate: "fast",
      timestamp: new Date().toISOString(),
      data: {
        type: "ax_events",
        events,
      },
    };
  }

  /**
   * MEDIUM rate: poll the full AX tree for the active window.
   * More expensive but gives a complete structural snapshot.
   */
  async pollAXTree(
    pid: number,
    windowId: number,
    appContext: AppContext,
    maxDepth = 10,
  ): Promise<PerceptionEvent | null> {
    try {
      const tree = await this.bridge.call<AXNode>("ax.getElementTree", {
        pid,
        maxDepth,
      });
      if (!tree) return null;

      return {
        source: "ax_tree",
        rate: "medium",
        timestamp: new Date().toISOString(),
        data: {
          type: "ax_tree",
          windowId,
          tree,
          appContext,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Start observing a process for AX events.
   */
  async startObserving(pid: number): Promise<void> {
    await this.observer.startObserving(pid);
  }

  /**
   * Stop observing a process.
   */
  async stopObserving(pid: number): Promise<void> {
    await this.observer.stopObserving(pid);
  }

  get isObserving(): boolean {
    return this.observer.isObserving;
  }
}
