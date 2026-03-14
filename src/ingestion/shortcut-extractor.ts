// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import type { ParsedShortcut } from "./types.js";

/**
 * ShortcutExtractor — parses keyboard shortcut lists from various formats
 * (HTML tables, plain text lists, markdown) into structured data.
 */

/**
 * Parse shortcuts from an HTML table.
 * Expects columns like: Action/Name | Shortcut/Keys
 */
export function parseShortcutsFromHTML(html: string): ParsedShortcut[] {
  const shortcuts: ParsedShortcut[] = [];

  // Extract table rows
  const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const row = tableMatch[1]!;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      // Strip HTML tags and normalize whitespace
      const text = cellMatch[1]!
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, "")
        .trim();
      cells.push(text);
    }

    if (cells.length >= 2 && cells[0] && cells[1]) {
      // Skip header rows
      const lower0 = cells[0].toLowerCase();
      if (
        lower0 === "action" ||
        lower0 === "command" ||
        lower0 === "shortcut" ||
        lower0 === "name" ||
        lower0 === "function"
      ) {
        continue;
      }

      shortcuts.push({
        name: cells[0],
        keys: normalizeKeys(cells[1]),
        context: cells.length > 2 ? cells[2] : undefined,
      });
    }
  }

  return shortcuts;
}

/**
 * Parse shortcuts from plain text lines.
 * Supports formats:
 * - "Action: Cmd+K"
 * - "Action — Cmd+K"
 * - "Action\tCmd+K"
 * - "Cmd+K  Action"
 */
export function parseShortcutsFromText(text: string): ParsedShortcut[] {
  const shortcuts: ParsedShortcut[] = [];
  const lines = text.split("\n");
  let currentCategory: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect category headers (all caps or ending with colon, no shortcut key)
    if (
      (line.endsWith(":") && !SHORTCUT_PATTERN.test(line)) ||
      (line === line.toUpperCase() && line.length > 3 && !SHORTCUT_PATTERN.test(line))
    ) {
      currentCategory = line.replace(/:$/, "").trim();
      continue;
    }

    // Try "Name: Keys" or "Name — Keys" or "Name\tKeys"
    const separatorMatch = line.match(
      /^(.+?)(?:\s*[:—–\-|]\s*|\t)(.+)$/,
    );
    if (separatorMatch && SHORTCUT_PATTERN.test(separatorMatch[2]!)) {
      shortcuts.push({
        name: separatorMatch[1]!.trim(),
        keys: normalizeKeys(separatorMatch[2]!.trim()),
        category: currentCategory,
      });
      continue;
    }

    // Try "Keys  Name" (shortcut first)
    const keysFirstMatch = line.match(
      /^((?:Cmd|Ctrl|Alt|Option|Shift|Meta|⌘|⌃|⌥|⇧)[+\s].+?)\s{2,}(.+)$/i,
    );
    if (keysFirstMatch) {
      shortcuts.push({
        name: keysFirstMatch[2]!.trim(),
        keys: normalizeKeys(keysFirstMatch[1]!.trim()),
        category: currentCategory,
      });
    }
  }

  return shortcuts;
}

/**
 * Parse shortcuts from markdown format.
 */
export function parseShortcutsFromMarkdown(md: string): ParsedShortcut[] {
  const shortcuts: ParsedShortcut[] = [];
  const lines = md.split("\n");
  let currentCategory: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Category from heading
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentCategory = headingMatch[1]!.trim();
      continue;
    }

    // Table row: | Name | Keys |
    const tableMatch = line.match(/^\|(.+)\|(.+)\|/);
    if (tableMatch) {
      const name = tableMatch[1]!.trim();
      const keys = tableMatch[2]!.trim();
      if (
        name &&
        keys &&
        name !== "---" &&
        !name.startsWith("-") &&
        SHORTCUT_PATTERN.test(keys)
      ) {
        shortcuts.push({
          name,
          keys: normalizeKeys(keys),
          category: currentCategory,
        });
      }
      continue;
    }

    // List item: - Name: Keys or * Name — Keys
    const listMatch = line.match(/^[*\-+]\s+(.+?)(?:\s*[:—–]\s*)(.+)$/);
    if (listMatch && SHORTCUT_PATTERN.test(listMatch[2]!)) {
      shortcuts.push({
        name: listMatch[1]!.trim(),
        keys: normalizeKeys(listMatch[2]!.trim()),
        category: currentCategory,
      });
      continue;
    }

    // Inline code: `Cmd+K` — Description
    const codeMatch = line.match(/`([^`]+)`\s*[-—:]\s*(.+)/);
    if (codeMatch && SHORTCUT_PATTERN.test(codeMatch[1]!)) {
      shortcuts.push({
        name: codeMatch[2]!.trim(),
        keys: normalizeKeys(codeMatch[1]!.trim()),
        category: currentCategory,
      });
    }
  }

  return shortcuts;
}

/**
 * Convert parsed shortcuts to reference JSON shortcuts format.
 */
export function shortcutsToReferenceFormat(
  shortcuts: ParsedShortcut[],
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const sc of shortcuts) {
    const category = sc.category ?? "general";
    if (!result[category]) result[category] = {};
    result[category]![sc.name] = sc.keys;
  }

  return result;
}

// Pattern to detect shortcut-like strings
const SHORTCUT_PATTERN =
  /(?:Cmd|Ctrl|Alt|Option|Shift|Meta|⌘|⌃|⌥|⇧|Command|Control)[+\s]/i;

/**
 * Normalize keyboard shortcut notation.
 * Converts symbols to names: ⌘→Cmd, ⌃→Ctrl, ⌥→Option, ⇧→Shift
 */
function normalizeKeys(keys: string): string {
  return keys
    .replace(/⌘/g, "Cmd")
    .replace(/⌃/g, "Ctrl")
    .replace(/⌥/g, "Option")
    .replace(/⇧/g, "Shift")
    .replace(/Command/gi, "Cmd")
    .replace(/Control/gi, "Ctrl")
    .replace(/\s*\+\s*/g, "+")
    .trim();
}
