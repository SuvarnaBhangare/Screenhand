# ScreenHand Tool Verification Status

Last updated: 2026-03-08 (full stress test)

Legend:
- VERIFIED = tested and confirmed working in real automation sessions
- PARTIAL = works but with known limitations
- BROKEN = tested and failed / unreliable
- UNTESTED = not yet tested in live sessions
- N/A = not applicable to current test environment

---

## Desktop Tools (19 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `apps` | VERIFIED | Lists running apps with bundle IDs, 1ms response |
| 2 | `windows` | VERIFIED | Lists visible windows with positions/sizes, 36ms |
| 3 | `focus` | VERIFIED | Focused TextEdit, Chrome from VS Code — reliable |
| 4 | `launch` | VERIFIED | Launched TextEdit, returned pid |
| 5 | `screenshot` | VERIFIED | Full screen capture with OCR text extraction, returns PNG path |
| 6 | `screenshot_file` | VERIFIED | Returns PNG file path only (no OCR) |
| 7 | `ocr` | VERIFIED | Returns element positions with text, 89 elements found on full screen |
| 8 | `ui_tree` | VERIFIED | Returns AXApplication tree with menu bar items, depth 3 |
| 9 | `ui_find` | BROKEN | Returns wrong elements — matched "System Information" instead of target "Format" in TextEdit. Partial match logic unreliable |
| 10 | `ui_press` | BROKEN | AX action 'AXPress' failed with code -25206 on menu items. Use `menu_click` instead |
| 11 | `ui_set_value` | BROKEN | Cannot focus element for value set, code -25205. AX element targeting fails |
| 12 | `menu_click` | VERIFIED | Clicked Edit/Select All in TextEdit — reliable alternative to ui_press |
| 13 | `click` | VERIFIED | Clicked at screen coordinates — works |
| 14 | `click_text` | VERIFIED | OCR + click: found "Testing click_text tool" and clicked at (209, 174). Needs valid windowId |
| 15 | `type_text` | VERIFIED | Typed "Hello ScreenHand stress test!" into TextEdit |
| 16 | `key` | VERIFIED | Cmd+A (select all), Cmd+C (copy), Cmd+N (new), Escape — all worked |
| 17 | `drag` | VERIFIED | Dragged from (800,400) to (900,500) |
| 18 | `scroll` | VERIFIED | Scrolled at position with deltaY |
| 19 | `applescript` | VERIFIED | `tell application "Finder" to get name of startup disk` returned "Macintosh HD" |

## Browser Tools (12 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 20 | `browser_tabs` | VERIFIED | Lists all open Chrome tabs with IDs |
| 21 | `browser_open` | VERIFIED | Opens URL in new tab, returns tab ID |
| 22 | `browser_navigate` | VERIFIED | Navigated to HN, X, LinkedIn, Reddit — all worked |
| 23 | `browser_js` | VERIFIED | Heavy use — execCommand, shadow DOM access, click dispatch, DOM queries. Core workhorse tool |
| 24 | `browser_dom` | VERIFIED | CSS selector queries on HN, LinkedIn, Reddit. Returns elements with rects |
| 25 | `browser_click` | VERIFIED | Clicked HN submit button, X post button. CDP mouse events |
| 26 | `browser_type` | PARTIAL | Works for Reddit Lexical editor but content doesn't persist across modal interactions. Does NOT work for X draft.js |
| 27 | `browser_wait` | VERIFIED | Waited for LinkedIn modal editor to load with 8s timeout — condition met |
| 28 | `browser_page_info` | VERIFIED | Retrieved title, URL, full text content for all platforms |
| 29 | `browser_stealth` | UNTESTED | Anti-detection patches |
| 30 | `browser_fill_form` | VERIFIED | Human-like typing on HN (title, URL, text fields). Works on standard inputs |
| 31 | `browser_human_click` | UNTESTED | Realistic mouse events with anti-detection |

## Fallback Execution Tools (8 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 32 | `execution_plan` | VERIFIED | Shows fallback chain with timing: click (AX→CDP→coords), type (AX→CDP) |
| 33 | `click_with_fallback` | VERIFIED | Clicked "Untitled" via AX in 30ms |
| 34 | `type_with_fallback` | PARTIAL | Failed to find "text area" by label — all methods exhausted. Works if target label matches exactly |
| 35 | `read_with_fallback` | VERIFIED | Read full AX tree via fallback chain in 70ms |
| 36 | `locate_with_fallback` | VERIFIED | Located "Untitled" via AX in 28ms |
| 37 | `select_with_fallback` | VERIFIED | Selected "Format → Plain Text" via AX in 383ms |
| 38 | `scroll_with_fallback` | VERIFIED | Scrolled down 200px, fell back from AX to CDP, 23ms |
| 39 | `wait_for_state` | VERIFIED | "Untitled" text_appears detected after 865ms |

## Supervisor Tools (12 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 40 | `session_claim` | VERIFIED | Claimed exclusive lease on TextEdit window 1004, returned session ID |
| 41 | `session_heartbeat` | VERIFIED | Heartbeat OK on active lease |
| 42 | `session_release` | VERIFIED | Released lease successfully |
| 43 | `supervisor_status` | VERIFIED | Returns daemon state, active sessions from lock files |
| 44 | `supervisor_start` | VERIFIED | Started daemon pid=18842, dry-run mode, poll=10s |
| 45 | `supervisor_stop` | VERIFIED | Stopped daemon by pid |
| 46 | `supervisor_pause` | VERIFIED | Paused automation, 0 sessions notified |
| 47 | `supervisor_resume` | VERIFIED | Resumed, cleared pause escalations |
| 48 | `supervisor_install` | UNTESTED | Modifies launchd — skipped for safety |
| 49 | `supervisor_uninstall` | UNTESTED | Modifies launchd — skipped for safety |
| 50 | `recovery_queue_add` | VERIFIED | Queued nudge recovery for test session |
| 51 | `recovery_queue_list` | VERIFIED | Listed 52 recovery actions with status history |

## Job System Tools (14 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 52 | `job_create` | VERIFIED | Created 3-step job with tags and priority |
| 53 | `job_status` | VERIFIED | Showed step progress, resume point, retry count |
| 54 | `job_list` | VERIFIED | Listed 3 jobs with state summary counts |
| 55 | `job_transition` | VERIFIED | Transitioned job to failed state with reason |
| 56 | `job_step_done` | VERIFIED | Marked step 0 done, advanced resume pointer |
| 57 | `job_step_fail` | VERIFIED | Marked step 1 failed with error message |
| 58 | `job_resume` | VERIFIED | Returned next pending step (step 0, navigate) |
| 59 | `job_dequeue` | VERIFIED | Popped highest-priority queued job, transitioned to running |
| 60 | `job_remove` | VERIFIED | Removed job entirely |
| 61 | `job_run` | VERIFIED | Correctly reported no queued jobs |
| 62 | `job_run_all` | VERIFIED | Correctly reported no queued jobs (maxJobs=1) |
| 63 | `worker_start` | VERIFIED | Started daemon pid=18711, poll=5s, maxJobs=1 |
| 64 | `worker_stop` | VERIFIED | Sent SIGTERM to daemon |
| 65 | `worker_status` | VERIFIED | Returned daemon state, jobs processed, disk log path |

## Memory Tools (9 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 66 | `memory_save` | VERIFIED | Saved strategy with 31 steps and auto-extracted tags |
| 67 | `memory_recall` | VERIFIED | Recalled twitter posting strategies with relevance scores |
| 68 | `memory_snapshot` | VERIFIED | Session info, health metrics (98.7% success), known blockers, policy |
| 69 | `memory_stats` | VERIFIED | 832 actions, 41 strategies, 9 error patterns, top tools breakdown |
| 70 | `memory_clear` | UNTESTED | Skipped — didn't want to wipe real data |
| 71 | `memory_errors` | VERIFIED | Queried error patterns for browser_type (none found) |
| 72 | `memory_query_patterns` | VERIFIED | Queried CDP patterns for chrome scope (none matched) |
| 73 | `memory_record_error` | VERIFIED | Recorded ui_press AX error with fix |
| 74 | `memory_record_learning` | VERIFIED | Recorded ui_find failure pattern with confidence=0.9 |

## Playbook Tools (2 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 75 | `platform_guide` | VERIFIED | Returned full devpost guide: URLs, flows, selectors, 8 errors with solutions |
| 76 | `export_playbook` | VERIFIED | Generated twitter playbook from session memory: 12 URLs, 6 strategies |

## Codex Monitor Tools (6 tools)

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 77 | `codex_monitor_start` | UNTESTED | Would start daemon and OCR polling — skipped for safety |
| 78 | `codex_monitor_status` | VERIFIED | Returned daemon state, terminal status, task queue |
| 79 | `codex_monitor_add_task` | VERIFIED | Queued task with priority, queue size=3 |
| 80 | `codex_monitor_tasks` | VERIFIED | Listed 2 queued tasks with IDs, priority, timestamps |
| 81 | `codex_monitor_assign_now` | UNTESTED | Would type into VS Code terminal — skipped for safety |
| 82 | `codex_monitor_stop` | VERIFIED | Handled gracefully when no daemon running |

---

## Summary

| Category | Total | Verified | Partial | Broken | Untested |
|----------|-------|----------|---------|--------|----------|
| Desktop | 19 | 13 | 0 | 3 | 0 |
| Browser | 12 | 9 | 1 | 0 | 2 |
| Fallback | 8 | 6 | 1 | 0 | 0 |
| Supervisor | 12 | 10 | 0 | 0 | 2 |
| Jobs | 14 | 14 | 0 | 0 | 0 |
| Memory | 9 | 8 | 0 | 0 | 1 |
| Playbook | 2 | 2 | 0 | 0 | 0 |
| Codex Monitor | 6 | 4 | 0 | 0 | 2 |
| **TOTAL** | **82** | **66** | **2** | **3** | **7** |

**82.9% verified (66 working + 2 partial), 3.7% broken (3 tools), 8.5% untested (7 tools)**

### Broken Tools (need fixing)

1. **`ui_find`** — Partial match logic returns wrong elements (e.g., "System Information" for query "Format")
2. **`ui_press`** — AX action 'AXPress' fails with code -25206 on menu items
3. **`ui_set_value`** — Cannot focus element for value set, code -25205

All 3 broken tools are AX element-targeting tools. Workarounds: use `menu_click` for menus, `click_text` or `click` for visual elements, `type_text` for text input.

### Untested Tools (skipped for safety)

1. **`browser_stealth`** — Anti-detection patches (needs active CDP session)
2. **`browser_human_click`** — Realistic mouse events (needs active CDP session)
3. **`supervisor_install`** — Modifies launchd system service
4. **`supervisor_uninstall`** — Modifies launchd system service
5. **`memory_clear`** — Would wipe real learned data
6. **`codex_monitor_start`** — Would start OCR polling daemon
7. **`codex_monitor_assign_now`** — Would type into VS Code terminal

---

## Platform-Specific Findings

### X/Twitter
- `browser_js` + `execCommand('insertText')` = ONLY reliable text input method
- `browser_fill_form` / `browser_type` = DO NOT WORK with draft.js editor
- Hashtags trigger autocomplete that blocks Post button
- Must blur textbox before clicking Post
- Full page reload needed to clear stale draft.js state

### LinkedIn
- `browser_js` + `execCommand('insertText')` = works perfectly
- `browser_wait` = essential for async modal loading (2-5s)
- Must target correct "Start a post" button (not video/photo)
- Post button is `.share-box-footer__primary-btn` inside modal
- Success verified by "Post successful" toast

### Reddit
- Shadow DOM everywhere (2-3 levels deep for some elements)
- Lexical richText editor is UNRELIABLE — loses content on modal interactions
- Markdown mode is the ONLY reliable approach for post body
- Native value setter required for shadow DOM textareas
- Post button hidden in `r-post-form-submit-button` shadow root
- Flair selection requires shadow root navigation
- `old.reddit.com` is a viable fallback with standard HTML forms

### Hacker News
- `browser_fill_form` works perfectly on standard HTML inputs
- `browser_click` works for form submission
- Account karma restrictions are server-side (not a tool issue)

### TextEdit (Desktop testing)
- `menu_click` is the reliable way to interact with menus (not ui_press)
- `click_text` needs a valid windowId from `windows` tool
- `type_text` and `key` work reliably for text input
- `ui_find`, `ui_press`, `ui_set_value` all have AX element targeting issues
