# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

ScreenHand is an MCP server that gives AI agents native desktop control on macOS and Windows. TypeScript MCP layer on top of native accessibility bridges (Swift/C#) communicating via JSON-RPC over stdio. 82 MCP tools spanning desktop automation, browser control, anti-detection, memory, supervisor, jobs, playbooks, and codex monitoring.

## Commands

```bash
npm run dev          # Run MCP server in dev mode (tsx mcp-desktop.ts)
npm run build        # Compile TypeScript -> dist/
npm run check        # Type-check without emitting (tsc --noEmit, covers src/ + both entry points)
npm test             # Run all tests (vitest, 202 tests, 15s timeout)
npm run test:watch   # Watch mode
npm test -- --grep "pattern"  # Run specific test by name
npm run build:native          # Build Swift accessibility bridge (macOS)
npm run build:native:windows  # Build .NET accessibility bridge (Windows)
npm run agent        # Run the agent CLI (tsx src/agent/cli.ts)
```

## Architecture

```
MCP Client (Codex, Cursor, etc.)
  | stdio (Model Context Protocol)
mcp-desktop.ts — Main MCP server, 82 tools (39 server.tool + 43 originalTool), Zod validation
  |
  +-- AutomationRuntimeService (src/runtime/service.ts)
  |     +-- SessionManager — session lifecycle + resilient re-attach
  |     +-- Executor — press/typeInto with locate→act→verify pipeline
  |     +-- AppAdapter interface — pluggable backends
  |
  +-- Native Bridge (src/native/bridge-client.ts)
  |     Spawns platform binary, JSON-RPC over stdio
  |     +-- macOS: native/macos-bridge/ (Swift)
  |     +-- Windows: native/windows-bridge/ (C# .NET 8)
  |
  +-- CDP Chrome (src/runtime/cdp-chrome-adapter.ts)
  |     Chrome DevTools Protocol for browser automation
  |
  +-- Session Supervisor (src/supervisor/) — lease management, stall detection, recovery
  +-- Job System (src/jobs/) — persistent multi-step jobs, worker daemon
  +-- Playbook Engine (src/playbook/) — reusable automation sequences
  +-- Memory Service (src/memory/) — JSONL learning, recall, error patterns
  +-- Logging (src/logging/) — timeline logger, action telemetry
```

## Key Entry Points

- **`mcp-desktop.ts`** — Main MCP server. Production entry point. 82 tools. Hardcodes AccessibilityAdapter.
- **`mcp-bridge.ts`** — Bridge-only MCP server (17 low-level native tools).
- **`src/mcp-entry.ts`** — Modular MCP server, supports adapter selection via env vars. Smaller tool subset.
- **`src/index.ts`** — Library entry point. Exports `createRuntimeApp()` and all adapters.
- **`src/agent/cli.ts`** — Standalone agent CLI with planning loop.

## MCP Tool Groups (mcp-desktop.ts)

Tools are registered two ways: `server.tool()` (39 direct) and `originalTool()` (43 via wrapper that adds memory/telemetry). Both are exposed as MCP tools.

- **Desktop**: `apps`, `windows`, `focus`, `launch`, `screenshot`, `screenshot_file`, `ocr`, `ui_tree`, `ui_find`, `ui_press`, `ui_set_value`, `menu_click`, `click`, `click_text`, `type_text`, `key`, `drag`, `scroll`, `applescript`
- **Browser**: `browser_tabs`, `browser_open`, `browser_navigate`, `browser_js`, `browser_dom`, `browser_click`, `browser_type`, `browser_wait`, `browser_page_info`, `browser_stealth`, `browser_fill_form`, `browser_human_click`
- **Fallback execution**: `click_with_fallback`, `type_with_fallback`, `scroll_with_fallback`, `select_with_fallback`, `read_with_fallback`, `locate_with_fallback`, `execution_plan`, `wait_for_state`
- **Supervisor**: `session_claim`, `session_heartbeat`, `session_release`, `supervisor_status`, `supervisor_start`, `supervisor_stop`, `supervisor_pause`, `supervisor_resume`, `supervisor_install`, `supervisor_uninstall`, `recovery_queue_add`, `recovery_queue_list`
- **Jobs**: `job_create`, `job_list`, `job_status`, `job_run`, `job_run_all`, `job_dequeue`, `job_step_done`, `job_step_fail`, `job_transition`, `job_resume`, `job_remove`, `worker_start`, `worker_status`, `worker_stop`
- **Memory**: `memory_save`, `memory_recall`, `memory_snapshot`, `memory_stats`, `memory_clear`, `memory_errors`, `memory_query_patterns`, `memory_record_error`, `memory_record_learning`
- **Playbook**: `export_playbook`, `platform_guide`
- **Codex monitor**: `codex_monitor_start`, `codex_monitor_status`, `codex_monitor_add_task`, `codex_monitor_tasks`, `codex_monitor_assign_now`, `codex_monitor_stop`

## Critical Patterns

- **Session resilience**: MCP servers restart between tool calls, losing in-memory state. `SessionManager.requireSessionResilent()` auto-recreates sessions by re-attaching with the same session ID. All `AutomationRuntimeService` methods use this — never use `requireSession()` directly.
- **reuseSessionId**: All adapters accept `attach(profile, reuseSessionId?)` to restore a session with the same ID after restart. Session ID prefixes: `ax_session_` (accessibility), `cdp_session_` (CDP), `as_session_` (AppleScript), `vision_session_` (vision).
- **Two tool registration patterns**: `server.tool()` for direct tools, `originalTool()` for tools that go through the memory/telemetry wrapper. Both produce MCP tools.
- **Fallback chains**: Composite adapter routes browsers → CDP, native apps → AX.
- **Budget-aware execution**: Default 800ms locate, 200ms act, 2000ms verify, 1 retry (see `src/config.ts`).
- **Supervisor daemon**: `scripts/supervisor-daemon.ts` runs as detached background process. Supports `--dry-run`, `--poll`, `--stall` flags. Can be installed as launchd service on macOS.
- **Worker daemon**: `scripts/worker-daemon.ts` background job processor. Dequeues and executes jobs independently of MCP client.
- **Atomic writes**: All filesystem state (`writeFileAtomicSync` in `src/util/atomic-write.ts`) uses write-to-tmp + rename pattern to prevent corruption.

## Adapter System

All adapters implement `AppAdapter` (src/runtime/app-adapter.ts):
- **AccessibilityAdapter** — macOS AX API via native Swift bridge. Default in mcp-desktop.ts.
- **CdpChromeAdapter** — Chrome DevTools Protocol. Launches Chrome, manages profiles.
- **CompositeAdapter** — Routes to AX or CDP per app. Needs `SCREENHAND_ADAPTER=composite`.
- **AppleScriptAdapter** — Scriptable macOS apps (Finder, Safari, Mail, etc.).
- **VisionAdapter** — OCR-based fallback via native bridge.
- **PlaceholderAppAdapter** — Stubs for testing.

## Environment Variables

- `SCREENHAND_ADAPTER` — Used by `mcp-entry.ts` and `agent/cli.ts`: `accessibility` (default), `composite`, `cdp`, `placeholder`
- `SCREENHAND_HEADLESS` — Set `"1"` for headless Chrome (mcp-entry.ts)
- `AUTOMATOR_ADAPTER` / `AUTOMATOR_HEADLESS` — Legacy aliases in `src/index.ts`
- `ANTHROPIC_API_KEY` — Optional, enables Codex-powered background research on errors

## Native Bridge Protocol

Both macOS (Swift) and Windows (C#) bridges use identical JSON-RPC over stdio. BridgeClient handles spawning, request/response mapping, and reconnection. Method timeouts: app.launch=30s, vision.ocr=20s, default=10s.

## TypeScript Config

- Target: ES2022, Module: NodeNext, strict mode
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled
- `tsconfig.json` — build config (emits to dist/), includes scripts/
- `tsconfig.check.json` — check-only config, includes mcp-bridge.ts
- Tests: vitest 3.2.4, config in vitest.config.ts, 14 test files in tests/

## License

AGPL-3.0-only — Copyright (C) 2025 Clazro Technology Private Limited
