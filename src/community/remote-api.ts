// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import type { SharedPlaybook, PlaybookQuery } from "./types.js";

/**
 * RemoteCommunityAPI — optional remote backend for community playbook sharing.
 *
 * When `SCREENHAND_COMMUNITY_URL` is set, publish/fetch operations
 * go to the remote API in addition to local disk. The local repo
 * remains the source of truth; remote is best-effort sync.
 *
 * Expected API endpoints:
 *   POST /playbooks         — publish a playbook
 *   GET  /playbooks?...     — search playbooks (query params from PlaybookQuery)
 *   GET  /playbooks/:id     — get a single playbook
 *   POST /playbooks/:id/rate — rate a playbook { score: 1 | -1 }
 */
export class RemoteCommunityAPI {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 5_000) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  /**
   * Get the configured remote URL, or null if not configured.
   */
  static fromEnv(): RemoteCommunityAPI | null {
    const url = process.env["SCREENHAND_COMMUNITY_URL"];
    if (!url) return null;
    return new RemoteCommunityAPI(url);
  }

  /**
   * Publish a playbook to the remote API.
   * Returns the server-assigned ID, or null on failure.
   */
  async publish(playbook: SharedPlaybook): Promise<string | null> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/playbooks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(playbook),
        },
        this.timeoutMs,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { id?: string };
      return body.id ?? playbook.id;
    } catch {
      return null;
    }
  }

  /**
   * Fetch playbooks from the remote API matching a query.
   */
  async fetch(query: PlaybookQuery): Promise<SharedPlaybook[]> {
    try {
      const params = new URLSearchParams();
      if (query.platform) params.set("platform", query.platform);
      if (query.bundleId) params.set("bundleId", query.bundleId);
      if (query.workflow) params.set("workflow", query.workflow);
      if (query.minScore !== undefined) params.set("minScore", String(query.minScore));
      if (query.limit !== undefined) params.set("limit", String(query.limit));

      const res = await fetchWithTimeout(
        `${this.baseUrl}/playbooks?${params.toString()}`,
        { method: "GET" },
        this.timeoutMs,
      );
      if (!res.ok) return [];
      return (await res.json()) as SharedPlaybook[];
    } catch {
      return [];
    }
  }

  /**
   * Get a specific playbook by ID.
   */
  async get(id: string): Promise<SharedPlaybook | null> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/playbooks/${encodeURIComponent(id)}`,
        { method: "GET" },
        this.timeoutMs,
      );
      if (!res.ok) return null;
      return (await res.json()) as SharedPlaybook;
    } catch {
      return null;
    }
  }

  /**
   * Rate a playbook (upvote/downvote).
   */
  async rate(id: string, score: 1 | -1): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/playbooks/${encodeURIComponent(id)}/rate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score }),
        },
        this.timeoutMs,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Fetch with AbortController timeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
