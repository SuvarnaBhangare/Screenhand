#!/usr/bin/env npx tsx
/**
 * Observer Daemon — background app-level visual monitor.
 *
 * Captures a single app window via cg.captureWindow (CGWindowListCreateImage).
 * Uses pixel-hash frame diff to skip OCR when nothing changed.
 * Persists state to ~/.screenhand/observer/state.json for the engine to read.
 *
 * Zero overhead on the main execution path — engine reads a JSON file, daemon
 * does the heavy lifting in a separate process.
 *
 * Usage:
 *   npx tsx scripts/observer-daemon.ts --bundleId com.blackmagic-design.DaVinciResolve --windowId 1234
 *   npx tsx scripts/observer-daemon.ts --bundleId com.blackmagic-design.DaVinciResolve --windowId 1234 --interval 2000
 *
 * State files:
 *   ~/.screenhand/observer/state.json    — observer state (latest OCR, popup detection)
 *   ~/.screenhand/observer/observer.pid  — PID of this process
 *   ~/.screenhand/observer/observer.log  — log output
 */

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { BridgeClient } from "../src/native/bridge-client.js";
import { writeObserverState } from "../src/observer/state.js";
import { detectPopup } from "../src/observer/state.js";
import type { ObserverState, ObserverFrame } from "../src/observer/types.js";
import { OBSERVER_DIR, OBSERVER_PID_FILE, OBSERVER_LOG_FILE } from "../src/observer/types.js";

// ── Config from CLI args ──

const args = process.argv.slice(2);
function getArg(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf("--" + name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const BUNDLE_ID = getArg("bundleId");
const WINDOW_ID = Number(getArg("windowId", "0"));
const INTERVAL_MS = Number(getArg("interval", "2000"));

if (!BUNDLE_ID || !WINDOW_ID) {
  process.stderr.write("Usage: observer-daemon.ts --bundleId <id> --windowId <id> [--interval <ms>]\n");
  process.exit(1);
}

// ── Logging ──

fs.mkdirSync(OBSERVER_DIR, { recursive: true });

const logStream = fs.createWriteStream(OBSERVER_LOG_FILE, { flags: "a" });
let daemonized = false;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logStream.write(line + "\n");
  if (!daemonized) process.stderr.write(line + "\n");
}

// ── Bridge setup ──

const scriptDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const projectRoot = scriptDir.includes("/dist/")
  ? path.resolve(scriptDir, "../..")
  : path.resolve(scriptDir, "..");
const bridgePath = process.platform === "win32"
  ? path.resolve(projectRoot, "native/windows-bridge/bin/Release/net8.0-windows/windows-bridge.exe")
  : path.resolve(projectRoot, "native/macos-bridge/.build/release/macos-bridge");

const bridge = new BridgeClient(bridgePath);
let bridgeReady = false;

async function ensureBridge(): Promise<void> {
  if (!bridgeReady) {
    await bridge.start();
    bridgeReady = true;
  }
}

// ── Frame diff via file hash ──

let lastFrameHash: string | null = null;

function hashFile(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(data).digest("hex");
}

// ── State ──

let stopped = false;
let framesCaptured = 0;
let framesChanged = 0;
let ocrRuns = 0;
let lastFrame: ObserverFrame | null = null;
let lastPopup: import("../src/observer/types.js").DetectedPopup | null = null;
let lastError: string | null = null;
const startedAt = new Date().toISOString();

function buildState(): ObserverState {
  return {
    pid: process.pid,
    running: !stopped,
    startedAt,
    bundleId: BUNDLE_ID!,
    windowId: WINDOW_ID,
    intervalMs: INTERVAL_MS,
    framesCaptured,
    framesChanged,
    ocrRuns,
    lastFrame,
    popup: lastPopup,
    lastError,
  };
}

function persistState(): void {
  try {
    writeObserverState(buildState());
  } catch {
    // Non-fatal
  }
}

// ── Capture loop ──

async function captureFrame(): Promise<void> {
  await ensureBridge();

  // 1. Capture window (app-level, not full screen)
  let shot: { path: string; width: number; height: number };
  try {
    shot = await bridge.call<{ path: string; width: number; height: number }>(
      "cg.captureWindow",
      { windowId: WINDOW_ID },
    );
  } catch (err) {
    lastError = `Capture failed: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  framesCaptured++;

  // 2. Frame diff — hash the image file, skip OCR if identical
  const currentHash = hashFile(shot.path);
  const pixelsChanged = currentHash !== lastFrameHash;
  lastFrameHash = currentHash;

  if (!pixelsChanged) {
    // Frame identical — update timestamp only, skip expensive OCR
    if (lastFrame) {
      lastFrame.capturedAt = new Date().toISOString();
      lastFrame.changed = false;
    }
    return;
  }

  framesChanged++;

  // 3. OCR only on changed frames
  let ocrText = "";
  try {
    const ocr = await bridge.call<{ text: string }>("vision.ocr", {
      imagePath: shot.path,
    });
    ocrText = ocr.text;
    ocrRuns++;
  } catch (err) {
    lastError = `OCR failed: ${err instanceof Error ? err.message : String(err)}`;
    ocrText = lastFrame?.ocrText ?? "";
  }

  // 4. Update frame
  lastFrame = {
    capturedAt: new Date().toISOString(),
    ocrText,
    changed: true,
  };

  // 5. Popup detection on the new OCR text
  lastPopup = detectPopup(ocrText);
  if (lastPopup) {
    log(`Popup detected: "${lastPopup.pattern}" → ${lastPopup.dismissAction}`);
  }

  lastError = null;

  // Clean up temp screenshot
  try { fs.unlinkSync(shot.path); } catch { /* ignore */ }
}

// ── Main loop ──

async function main() {
  // Enforce single daemon
  try {
    const existingPid = fs.readFileSync(OBSERVER_PID_FILE, "utf-8").trim();
    const pid = Number(existingPid);
    if (!Number.isNaN(pid) && pid !== process.pid) {
      try {
        process.kill(pid, 0); // Check if alive
        log(`Another observer daemon already running (pid=${pid}). Aborting.`);
        process.exit(1);
      } catch {
        // Stale PID — safe to continue
      }
    }
  } catch {
    // No PID file — first run
  }

  fs.writeFileSync(OBSERVER_PID_FILE, String(process.pid));
  daemonized = true;

  log(`Observer daemon started (pid=${process.pid})`);
  log(`Watching: bundleId=${BUNDLE_ID} windowId=${WINDOW_ID} interval=${INTERVAL_MS}ms`);

  persistState();

  while (!stopped) {
    try {
      await captureFrame();
      persistState();
    } catch (err) {
      lastError = `Frame error: ${err instanceof Error ? err.message : String(err)}`;
      log(lastError);
    }
    await sleep(INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Graceful shutdown ──

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  if (stopped) return;
  stopped = true;
  log("Shutting down...");
  persistState();
  try { fs.unlinkSync(OBSERVER_PID_FILE); } catch { /* ignore */ }
  try { await bridge.stop(); } catch { /* ignore */ }
  logStream.end();
  process.exit(0);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
