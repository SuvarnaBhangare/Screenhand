// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { getChromePath, launch } from "chrome-launcher";
import type { LaunchedChrome } from "chrome-launcher";
import CDP from "chrome-remote-interface";
import { writeFileAtomicSync } from "../util/atomic-write.js";

type CdpClient = Awaited<ReturnType<typeof CDP>>;

const HELP_SCOPE_SEGMENTS = new Set([
  "help",
  "docs",
  "support",
  "kb",
  "hc",
  "guide",
  "knowledgebase",
  "knowledge-base",
]);

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "ref",
  "source",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const STOP_MARKERS = [
  "Skip to end of footer",
  "Download Canva for free",
  "How would you rate the help you received from this article?",
  "People also viewed",
  "Privacy",
  "Terms",
] as const;

const BLOCK_SELECTOR = "h1,h2,h3,h4,p,li,pre,blockquote";

export interface HelpCenterLink {
  url: string;
  title: string;
  description?: string;
}

export interface HelpCenterPage {
  url: string;
  title: string;
  kind: "article" | "listing";
  markdown: string;
  links: HelpCenterLink[];
}

export interface HelpCenterExportOptions {
  startUrl: string;
  outputPath: string;
  scopePrefix?: string;
  maxPages?: number;
  headless?: boolean;
  waitAfterLoadMs?: number;
  onProgress?: (message: string) => void;
}

interface BrowserExtractResult {
  blocked: boolean;
  links: HelpCenterLink[];
  markdown: string;
  kind: "article" | "listing";
  title: string;
}

interface ExportResult {
  outputPath: string;
  pageCount: number;
  pages: HelpCenterPage[];
  scopePrefix: string;
}

export function deriveScopePrefix(startUrl: string): string {
  const url = new URL(startUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const helpIdx = parts.findIndex((part) => HELP_SCOPE_SEGMENTS.has(part.toLowerCase()));

  if (helpIdx >= 0) {
    return `/${parts.slice(0, helpIdx + 1).join("/")}/`;
  }

  if (parts.length === 0) {
    return "/";
  }

  if (url.pathname.endsWith("/")) {
    return `/${parts.join("/")}/`;
  }

  return `/${parts.slice(0, -1).join("/")}/`;
}

export function normalizeCrawlUrl(candidate: string, baseUrl: string): string | null {
  if (!candidate || /^(javascript:|mailto:|tel:)/i.test(candidate)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate, baseUrl);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) {
    return null;
  }

  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }

  const pathname = url.pathname.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|mov)$/i.test(pathname)) {
    return null;
  }

  return url.toString();
}

export function filterScopedLinks(
  links: readonly HelpCenterLink[],
  startUrl: string,
  scopePrefix: string,
): HelpCenterLink[] {
  const start = new URL(startUrl);
  const seen = new Set<string>();
  const filtered: HelpCenterLink[] = [];

  for (const link of links) {
    const normalized = normalizeCrawlUrl(link.url, startUrl);
    if (!normalized) continue;
    const url = new URL(normalized);
    if (url.origin !== start.origin) continue;
    if (!url.pathname.startsWith(scopePrefix)) continue;
    if (normalized === start.toString()) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    filtered.push({
      url: normalized,
      title: cleanLine(link.title),
      ...(link.description ? { description: cleanLine(link.description) } : {}),
    });
  }

  return filtered;
}

export function renderMergedMarkdown(
  startUrl: string,
  scopePrefix: string,
  pages: readonly HelpCenterPage[],
  exportedAt: string = new Date().toISOString(),
): string {
  const lines: string[] = [
    "# Help Center Export",
    "",
    `- Source: ${startUrl}`,
    `- Scope: ${scopePrefix}`,
    `- Exported: ${exportedAt}`,
    `- Pages: ${pages.length}`,
    "",
    "## Included Pages",
    "",
  ];

  for (const page of pages) {
    lines.push(`- [${page.title}](${page.url})`);
  }

  for (const [index, page] of pages.entries()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## ${index + 1}. ${page.title}`);
    lines.push("");
    lines.push(`Source: ${page.url}`);
    lines.push("");
    lines.push(page.markdown.trim() || "_No visible article body extracted._");
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function exportHelpCenterToMarkdown(
  options: HelpCenterExportOptions,
): Promise<ExportResult> {
  const startUrl = normalizeCrawlUrl(options.startUrl, options.startUrl);
  if (!startUrl) {
    throw new Error(`Invalid start URL: ${options.startUrl}`);
  }

  const scopePrefix = options.scopePrefix ?? deriveScopePrefix(startUrl);
  const maxPages = options.maxPages ?? 25;
  const waitAfterLoadMs = options.waitAfterLoadMs ?? 1200;
  const headless = options.headless ?? false;
  const outputPath = path.resolve(options.outputPath);
  const pages: HelpCenterPage[] = [];
  const queue = [startUrl];
  const visited = new Set<string>();
  let chrome: LaunchedChrome | undefined;
  let client: CdpClient | undefined;

  try {
    ({ chrome, client } = await openChromeSession(headless));

    while (queue.length > 0 && pages.length < maxPages) {
      const currentUrl = queue.shift();
      if (!currentUrl || visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      options.onProgress?.(`Crawling ${pages.length + 1}/${maxPages}: ${currentUrl}`);
      await navigateAndWait(client, currentUrl, waitAfterLoadMs);
      const page = await extractPage(client, currentUrl, scopePrefix);
      pages.push(page);

      for (const link of page.links) {
        if (!visited.has(link.url) && !queue.includes(link.url)) {
          queue.push(link.url);
        }
      }
    }
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Best effort cleanup.
      }
    }
    if (chrome) {
      await chrome.kill();
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const rendered = renderMergedMarkdown(startUrl, scopePrefix, pages);
  writeFileAtomicSync(outputPath, rendered);

  return {
    outputPath,
    pageCount: pages.length,
    pages,
    scopePrefix,
  };
}

async function openChromeSession(headless: boolean): Promise<{
  chrome: LaunchedChrome;
  client: CdpClient;
}> {
  const chrome = await launch({
    chromePath: resolveChromePath(),
    startingUrl: "about:blank",
    chromeFlags: buildChromeFlags(headless),
  });

  const targetId = await resolveTargetId(chrome.port);
  const client = await CDP({ port: chrome.port, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  return { chrome, client };
}

async function navigateAndWait(
  client: CdpClient,
  url: string,
  waitAfterLoadMs: number,
): Promise<void> {
  await client.Page.navigate({ url });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await evaluateJson<{ readyState: string; textLength: number }>(
      client,
      `(() => ({
        readyState: document.readyState,
        textLength: (document.body?.innerText || "").trim().length,
      }))()`,
    );

    if (
      (state.readyState === "interactive" || state.readyState === "complete") &&
      state.textLength > 40
    ) {
      break;
    }

    await sleep(250);
  }

  await evaluateJson(
    client,
    `(() => new Promise((resolve) => {
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(() => {
        window.scrollTo(0, 0);
        resolve(true);
      }, 250);
    }))()`,
  );

  await sleep(waitAfterLoadMs);
}

async function extractPage(
  client: CdpClient,
  currentUrl: string,
  scopePrefix: string,
): Promise<HelpCenterPage> {
  const current = new URL(currentUrl);
  const result = await evaluateJson<BrowserExtractResult>(
    client,
    buildExtractionExpression(currentUrl, current.origin, scopePrefix),
  );

  if (result.blocked) {
    throw new Error(
      `Browser was blocked while loading ${currentUrl}. Try running the exporter in headed mode.`,
    );
  }

  return {
    url: currentUrl,
    title: cleanLine(result.title) || current.hostname,
    kind: result.kind,
    markdown: result.markdown.trim(),
    links: filterScopedLinks(result.links, currentUrl, scopePrefix),
  };
}

function buildChromeFlags(headless: boolean): string[] {
  const flags = [
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ];

  if (headless) {
    flags.push("--headless=new");
  }

  return flags;
}

async function resolveTargetId(port: number): Promise<string> {
  const targets = await CDP.List({ port });
  const pageTarget = targets.find((target) => target.type === "page");
  if (pageTarget?.id) {
    return pageTarget.id;
  }

  const created = await CDP.New({ port });
  if (typeof created === "string") {
    return created;
  }
  if (created && typeof created.id === "string") {
    return created.id;
  }

  throw new Error("Could not create a Chrome page target.");
}

function resolveChromePath(): string {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  try {
    const discovered = getChromePath();
    if (discovered && existsSync(discovered)) {
      return discovered;
    }
  } catch {
    // Fall through to fixed candidates.
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Chrome executable not found. Set CHROME_PATH or install Google Chrome.");
}

async function evaluateJson<T>(client: CdpClient, expression: string): Promise<T> {
  const result = await client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "Runtime.evaluate failed");
  }

  return result.result.value as T;
}

function buildExtractionExpression(
  currentUrl: string,
  origin: string,
  scopePrefix: string,
): string {
  const config = JSON.stringify({ currentUrl, origin, scopePrefix, stopMarkers: STOP_MARKERS });
  return `
(() => {
  const config = ${config};
  const root = document.querySelector("main, [role='main'], article") || document.body;
  const h1 = root.querySelector("h1") || document.querySelector("h1");
  const h1Top = h1 ? h1.getBoundingClientRect().top : Number.NEGATIVE_INFINITY;

  const normalize = (value) =>
    String(value ?? "")
      .replace(/\\u00a0/g, " ")
      .replace(/\\s+/g, " ")
      .trim();

  const cleanLine = (value) => normalize(value).replace(/\\s*\\n\\s*/g, " ");

  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const isBlocked = () => {
    const title = normalize(document.title);
    const bodyText = normalize(document.body?.innerText || "").slice(0, 500);
    return /access denied|forbidden|just a moment|verify you are human|captcha/i.test(
      title + " " + bodyText,
    );
  };

  const normalizeLink = (href) => {
    try {
      const url = new URL(href, location.href);
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";
      ["fbclid", "gclid", "ref", "source"].forEach((key) => url.searchParams.delete(key));
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
      }
      if (/\\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|mov)$/i.test(url.pathname)) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  };

  const inScope = (href) => {
    try {
      const url = new URL(href);
      return url.origin === config.origin && url.pathname.startsWith(config.scopePrefix);
    } catch {
      return false;
    }
  };

  const extractAnchorText = (anchor) => {
    const childTexts = Array.from(
      anchor.querySelectorAll("h2, h3, h4, p, span, strong, em, div"),
    )
      .filter(isVisible)
      .map((node) => cleanLine(node.textContent))
      .filter(Boolean);

    const uniqueTexts = [...new Set(childTexts)];
    const discreteTexts = uniqueTexts.filter(
      (text) =>
        !uniqueTexts.some(
          (other) =>
            other !== text &&
            text.length > other.length + 8 &&
            text.includes(other),
        ),
    );
    const candidates = discreteTexts.length > 0 ? discreteTexts : uniqueTexts;
    const fallback = cleanLine(anchor.textContent);
    const title =
      candidates
        .filter((text) => text.length <= 140)
        .sort((left, right) => left.length - right.length)[0] || fallback;
    const description =
      candidates.find(
        (text) =>
          text !== title &&
          !text.includes(title) &&
          !title.includes(text),
      ) || undefined;
    return { title, description };
  };

  const links = [];
  const seenLinks = new Set();
  for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
    if (!isVisible(anchor)) continue;
    if (anchor.closest("footer")) continue;
    if (anchor.getBoundingClientRect().top < h1Top - 8) continue;

    const normalizedUrl = normalizeLink(anchor.href);
    if (!normalizedUrl || !inScope(normalizedUrl) || normalizedUrl === config.currentUrl) {
      continue;
    }

    const { title, description } = extractAnchorText(anchor);
    if (!title || /^help centre$/i.test(title)) continue;
    if (seenLinks.has(normalizedUrl)) continue;
    seenLinks.add(normalizedUrl);
    links.push({ url: normalizedUrl, title, description });
  }

  const blocks = [];
  let started = h1 ? false : true;
  for (const node of Array.from(root.querySelectorAll(${JSON.stringify(BLOCK_SELECTOR)}))) {
    if (!isVisible(node)) continue;
    if (h1 && !started) {
      started = node === h1;
      if (!started) continue;
    }

    const text = cleanLine(node.textContent);
    if (!text) continue;
    if (config.stopMarkers.includes(text)) break;

    const tag = node.tagName.toLowerCase();
    const anchor = node.closest("a[href]");
    const href = anchor ? anchor.getAttribute("href") || "" : "";
    const samePageLink =
      Boolean(anchor) &&
      (href.startsWith("#") ||
        (() => {
          try {
            const resolved = new URL(anchor.href, location.href);
            return resolved.pathname === location.pathname && resolved.search === location.search;
          } catch {
            return false;
          }
        })());

    blocks.push({
      tag,
      text,
      insideLink: Boolean(anchor),
      samePageLink,
    });
  }

  const articleParagraphs = blocks.filter((block) => block.tag === "p" && !block.insideLink);
  const articleHeadings = blocks.filter((block) => block.tag === "h2" || block.tag === "h3");
  const kind =
    articleParagraphs.length >= 3 || articleHeadings.length >= 2 ? "article" : "listing";

  const lines = [];
  const push = (line = "") => {
    if (line === "" && lines[lines.length - 1] === "") return;
    lines.push(line);
  };

  const title = cleanLine(h1?.textContent || document.title || location.pathname);

  if (kind === "article") {
    for (const block of blocks) {
      if (block.tag === "h1") continue;
      if (block.text === title) continue;
      if (block.insideLink && !block.samePageLink) continue;

      if (block.tag === "h2") push("## " + block.text);
      else if (block.tag === "h3") push("### " + block.text);
      else if (block.tag === "h4") push("#### " + block.text);
      else if (block.tag === "li") push("- " + block.text);
      else if (block.tag === "pre" || block.tag === "blockquote") {
        push("~~~");
        push(block.text);
        push("~~~");
      } else {
        push(block.text);
      }

      push("");
    }
  } else {
    for (const block of blocks) {
      if (block.tag === "h1") continue;
      if (block.insideLink) continue;
      if (block.tag === "p") {
        push(block.text);
        push("");
      }
    }

    if (links.length > 0) {
      push("### Linked Pages");
      push("");
      for (const link of links) {
        const description = link.description && link.description !== link.title
          ? " - " + link.description
          : "";
        push("- [" + link.title + "](" + link.url + ")" + description);
      }
      push("");
    }
  }

  return {
    blocked: isBlocked(),
    links,
    markdown: lines.join("\\n").trim(),
    kind,
    title,
  };
})()`;
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
