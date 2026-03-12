---
name: edit-video
description: >
  Edit video in DaVinci Resolve. Color grade footage, edit timelines, add transitions,
  render projects, apply LUTs, add nodes, navigate pages. Use when: "color grade",
  "edit timeline", "render in DaVinci", "add node", "apply LUT", "cut footage",
  "DaVinci Resolve", "video editing", "color correction", "deliver", "fairlight audio".
disable-model-invocation: true
allowed-tools:
  - mcp__sh__platform_guide
  - mcp__sh__apps
  - mcp__sh__windows
  - mcp__sh__focus
  - mcp__sh__launch
  - mcp__sh__menu_click
  - mcp__sh__key
  - mcp__sh__screenshot
  - mcp__sh__screenshot_file
  - mcp__sh__ui_tree
  - mcp__sh__ui_find
  - mcp__sh__ui_press
  - mcp__sh__click
  - mcp__sh__type_text
  - mcp__sh__drag
  - mcp__sh__scroll
  - mcp__sh__observer_start
  - mcp__sh__observer_status
  - mcp__sh__observer_stop
  - mcp__sh__job_create
  - mcp__sh__job_run
  - mcp__sh__job_status
  - mcp__sh__memory_recall
  - mcp__sh__memory_save
  - mcp__sh__memory_query_patterns
---

# DaVinci Resolve Video Editing

You are controlling DaVinci Resolve via ScreenHand. DaVinci is a keyboard-first application — many operations are faster via shortcuts than UI clicking.

## Intelligence Wrapper

Every tool call returns automatic hints. Watch for:
- **`[HINT]`** — menu paths, keyboard shortcuts from the DaVinci reference files
- **`[WARNING]`** — this tool/action has failed before in DaVinci, includes the fix
- **`[STRATEGY]`** — next step suggestion based on past successful DaVinci workflows

The server auto-loads the DaVinci reference when it detects the `bundleId` change via `focus()`.

## Available References & Playbooks

**References** (curated knowledge — use with `platform_guide`):
- `davinci-resolve-keyboard` — all keyboard shortcuts
- `davinci-resolve-menu-map` — full menu structure with paths
- `davinci-resolve-menus-batch1` through `batch4` — detailed menu trees

**Executable Playbooks** (use with `job_create(playbookId=...)`):
- `davinci-color-grade` — full color grading workflow
- `davinci-edit-timeline` — timeline editing workflow
- `davinci-render` — render/export workflow

To run a playbook as a job:
```
job_create(task="Color grade the timeline", playbookId="davinci-color-grade")
job_run(jobId="{id}")
```

## Setup

1. **Load platform knowledge** (MANDATORY):
   - `platform_guide(platform="davinci-resolve-keyboard")` — all keyboard shortcuts
   - `platform_guide(platform="davinci-resolve-menu-map")` — full menu structure with paths
   - `memory_query_patterns(scope="davinci")` — verified patterns from past sessions

2. **Launch & focus**:
   - Bundle ID: `com.blackmagic-design.DaVinciResolveLite` (free) or `com.blackmagic-design.DaVinciResolve` (studio)
   - `launch(bundleId)` if not running, then `focus(bundleId)`

3. **Start observer** (recommended for multi-step workflows):
   - `observer_start(bundleId, windowId)` — enables popup detection (save dialogs, render prompts)
   - Check `observer_status()` if you suspect a popup blocked an action

## Page Navigation

DaVinci has 7 pages. Switch via `menu_click`:

| Page | Menu Path | Shortcut |
|------|-----------|----------|
| Media | `Workspace/Switch to Page/Media` | `shift+2` |
| Cut | `Workspace/Switch to Page/Cut` | `shift+3` |
| Edit | `Workspace/Switch to Page/Edit` | `shift+4` |
| Fusion | `Workspace/Switch to Page/Fusion` | `shift+5` |
| Color | `Workspace/Switch to Page/Color` | `shift+6` |
| Fairlight | `Workspace/Switch to Page/Fairlight` | `shift+7` |
| Deliver | `Workspace/Switch to Page/Deliver` | `shift+8` |

**Always use `key` with the shortcut** — it's faster and more reliable than `menu_click` for page switching.

## Core Keyboard Shortcuts

Reference `platform_guide` output, but the most critical:

### Playback
- `space` — Play/Stop
- `j` / `k` / `l` — Reverse / Stop / Forward
- `left` / `right` — Previous/next frame

### Edit Page
- `b` — Blade tool (cut at playhead)
- `a` — Selection tool
- `cmd+z` — Undo
- `cmd+shift+z` — Redo
- `cmd+s` — Save project
- `backspace` — Delete selected clip
- `shift+backspace` — Ripple delete

### Color Page
- `opt+s` — Add serial node
- `opt+p` — Add parallel node
- `shift+h` — Highlight mode
- `cmd+d` — Bypass all grades (toggle)
- `ctrl+shift+w` — Grab still

### Deliver Page
- Use `menu_click` to set render format
- `cmd+shift+r` — Add to render queue
- Start render via `menu_click("Deliver/Start Render")`

## Common Workflows

### Color Grading
1. Switch to Color page: `key("shift+6")`
2. Verify with `screenshot_file`
3. Add serial node: `key("opt+s")`
4. Apply auto color: `menu_click("Color/Auto Color")`
5. Adjust: use node graph (coordinate clicks on the color wheels)
6. Grab still: `key("ctrl+shift+w")`

### Timeline Editing
1. Switch to Edit page: `key("shift+4")`
2. Import media: `menu_click("File/Import/Media...")`
3. Drag clips to timeline: use `drag(fromX, fromY, toX, toY)` from media pool to timeline
4. Blade cut: position playhead, press `key("b")` then click on clip
5. Delete clip: select it, press `key("backspace")`

### Rendering
1. Switch to Deliver: `key("shift+8")`
2. Set output location: `menu_click("Deliver/Render Settings...")`
3. Select format (H.264, ProRes, etc.) via the render settings panel
4. Add to queue: `key("cmd+shift+r")`
5. Start render: `menu_click("Deliver/Start Render")`
6. Monitor: `observer_status()` for popup detection during render

## Verification

After every significant action:
- Take `screenshot_file` to confirm the UI state changed
- Especially important after page switches, node creation, render start

## DaVinci-Specific Challenges

- **Limited AX tree**: DaVinci's timeline and color wheels are custom-drawn — AX tree may not expose individual clips or nodes. Use `screenshot` + coordinate-based `click` for these.
- **Save dialogs during render**: The observer daemon detects these. Check `observer_status()` if an action seems to hang.
- **Multiple windows**: DaVinci can open floating windows (scopes, inspector). Use `windows` to identify the correct one.

## Saving

After completing the task:
- `key("cmd+s")` — save the project
- `memory_save(task="davinci: {description}")` to persist the workflow

$ARGUMENTS
