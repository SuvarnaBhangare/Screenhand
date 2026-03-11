# ScreenHand (sh) Usage Guide for Claude Code

**What this is:** A practical guide for using ScreenHand MCP tools inside Claude Code sessions. Read this before automating any desktop app or browser workflow.

---

## What is ScreenHand?

ScreenHand (`sh`) is an MCP server that gives you **eyes and hands on the desktop**. It's already connected to your Claude Code session as the `sh` MCP server. All tools are prefixed with `mcp__sh__`.

You can:
- Control Chrome tabs (navigate, click, type, extract data)
- Control desktop apps (focus, click, type, screenshot, read UI trees)
- Run multi-step automation jobs with playbook-driven execution
- Persist learnings across sessions — tools auto-inject playbook knowledge

---

## The Golden Rule: Preflight → Playbook → Execute → Learn

Every automation should follow this loop. **Don't skip steps 1-2.**

```
Step 1: PREFLIGHT — Is this automatable?
  → playbook_preflight(url, task)
  → Get go/yellow/red rating BEFORE investing time

Step 2: CHECK PLAYBOOK — Has someone done this before?
  → platform_guide(platform, section="all")
  → If playbook has executable steps → use job_create(playbookId=...)
  → If playbook has flows/selectors → use them as your guide
  → If no playbook → proceed manually, tool will learn as you go

Step 3: EXECUTE — Do the work
  → Tools AUTO-INJECT playbook hints (errors, selectors, job suggestions)
  → You'll see ⚠/💡/📋 hints in tool responses — READ AND FOLLOW THEM
  → Don't ignore hints — they prevent known failures

Step 4: LEARN — Knowledge auto-saves
  → Working selectors and error patterns auto-collect in memory
  → On session_release → learnings merge into playbook for next time
  → Call export_playbook(platform, domain) to save a full playbook
```

**The system gets smarter every session.** What you discover today helps every future session on that platform.

---

## STOP — Read This First (Common Mistakes)

### Mistake #1: Using session_start + navigate for browser automation

**WRONG:**
```
session_start(profile: "figma") → ax_session_figma_123
navigate(sessionId: "ax_session_figma_123", url: "https://figma.com")
→ ERROR: "Session not found"
```

**RIGHT:**
```
browser_tabs → get tab IDs (no session needed!)
browser_navigate(url: "https://figma.com", tabId: "ABC123")
browser_human_click(selector: "button", tabId: "ABC123")
```

**Why:** `session_start` creates an Accessibility adapter session (`ax_session_*`) for native desktop apps. It is NOT for browsers. Browser tools (`browser_*`) connect to Chrome via CDP directly — they don't need sessions. Sessions also get lost when the MCP server restarts between tool calls, causing "Session not found" errors.

**Rule:** For anything in Chrome (websites, web apps, Figma, etc.) → use `browser_*` tools. For native desktop apps (Finder, Codex, etc.) → use `focus` + `click`/`key`/`type_text`. You almost never need `session_start`.

### Mistake #2: Using native tools (click, key, type_text) for browser pages

These tools send OS-level events to the **frontmost app**. But Claude Code runs in VS Code/Terminal, which steals focus when it outputs text. So by the time `type_text` fires, VS Code is in front — not Chrome.

**Solution:** Use CDP browser tools (`browser_fill_form`, `browser_human_click`, `browser_js`) — they work regardless of which app is in front.

### Mistake #3: Not calling browser_tabs first

Tab IDs change when the MCP server restarts. Always call `browser_tabs` at the start of any browser workflow to get fresh IDs.

### Mistake #4: Ignoring playbook hints in tool responses

After every tool call, check the response for hint lines starting with ⚠, 💡, or 📋. These are **auto-injected from playbook knowledge** — known errors, preferred selectors, and job suggestions. Ignoring them means you'll repeat known failures.

```
⚠ Known issue (devpost): reCAPTCHA cannot be automated → poll manually
💡 Preferred selector (x-twitter): compose.tweet_box: [data-testid="tweetTextarea_0"]
📋 Playbook "twitter" has 12 steps (85% success). Use job_create(playbookId="twitter")
```

**Rule:** If you see a 📋 hint suggesting a playbook with executable steps, **use job_create** instead of manually clicking through.

### Mistake #5: Manually repeating what a playbook already knows

Before automating any platform, check if a playbook exists:
```
platform_guide(platform="twitter")  → see errors, selectors, flows
playbook_preflight(url="https://x.com", task="post tweet")  → feasibility check
```

If the playbook has steps → `job_create(task="...", playbookId="twitter")`. Don't re-do it manually.

### Mistake #6: Not calling session_release when done

Always call `session_release` when finished. This flushes learned selectors and error patterns back into the playbook so they're available next time.

---

## Tool Categories (The Ones You'll Actually Use)

### Browser Tools (90% of your work)

These control Chrome via CDP (Chrome DevTools Protocol). They work **in the background** — Chrome doesn't need to be the frontmost app.

| Tool | What it does | When to use |
|------|-------------|-------------|
| `browser_tabs` | List all open Chrome tabs with IDs | **Always call first** to get tab IDs |
| `browser_navigate` | Open a URL in a tab | Navigation to any page |
| `browser_js` | Run JavaScript in a tab | Extract data, check state, manipulate DOM |
| `browser_human_click` | Click an element (realistic mouse events) | Click buttons, links, UI elements |
| `browser_fill_form` | Type text with human-like delays | Fill inputs, search boxes, textareas |
| `browser_dom` | Query DOM elements | Find elements by CSS selector |
| `browser_wait` | Wait for a JS condition to be true | Wait for page load, element to appear |
| `browser_click` | Click by CSS selector (CDP mouse) | Alternative to human_click |
| `browser_stealth` | Apply anti-detection measures | Before automating sites that detect bots |
| `browser_open` | Open a new Chrome tab | When you need a fresh tab |

### Desktop Tools (for native apps)

| Tool | What it does | When to use |
|------|-------------|-------------|
| `focus` | Bring an app to front | Before using keyboard/click tools |
| `screenshot` | Take screenshot + OCR | See what's on screen |
| `click` | Click at screen coordinates (x, y) | Native app buttons |
| `key` | Press keyboard shortcuts | Cmd+C, Enter, Escape, etc. |
| `type_text` | Type text string | Type into focused field |
| `apps` | List running applications | Find app bundle IDs |
| `windows` | List open windows | Find window positions |
| `ui_tree` | Read accessibility tree | Discover UI elements |
| `ocr` | Extract text from screen region | Read text without screenshots |
| `menu_click` | Click app menu items | File > New, Edit > Copy, etc. |
| `launch` | Launch an application | Open apps by name or bundle ID |
| `applescript` | Run AppleScript | macOS-specific automation |

### Playbook & Intelligence Tools (use FIRST)

| Tool | What it does | When to use |
|------|-------------|-------------|
| `playbook_preflight` | Quick feasibility check — scans for captchas, WebGL, shadow DOM, React quirks | **Before starting** any new platform automation |
| `platform_guide` | Get playbook knowledge — selectors, flows, errors, detection | **Before starting** — check what's already known |
| `export_playbook` | Save session learnings as a reusable playbook | **After finishing** a successful automation |

### Job Tools (auto-execute playbooks)

| Tool | What it does | When to use |
|------|-------------|-------------|
| `job_create` | Create a job, optionally with a playbookId for auto-execution | When a playbook with steps exists — **preferred over manual execution** |
| `job_run` | Execute a pending job | After job_create |
| `job_status` | Check job progress | Monitor running jobs |
| `job_list` | List all jobs | See what's queued |

### Memory Tools (persist learnings)

| Tool | What it does |
|------|-------------|
| `memory_save` | Save a learning for future sessions |
| `memory_recall` | Retrieve past learnings by topic |
| `memory_record_error` | Record an error pattern + fix |
| `memory_record_learning` | Record a discovery |

---

## Core Workflow Pattern

### Starting a New Platform (first time)

```
1. playbook_preflight(url, task)    → Check if it's automatable (go/yellow/red)
2. platform_guide(platform)         → Load known selectors, flows, errors
3. browser_tabs                     → Get tab IDs
4. browser_navigate                 → Go to the page
5. ... do the work using playbook selectors ...
6. export_playbook(platform, domain) → Save what you learned
7. session_release                   → Flush learnings into playbook
```

### Returning to a Known Platform (playbook exists)

```
1. job_create(task="...", playbookId="twitter")  → Auto-execute via playbook
2. job_run(jobId)                                → Run it
3. job_status(jobId)                             → Check result
```

If the playbook doesn't have executable steps (only flows/selectors), fall back to manual with playbook guidance.

### Every Browser Automation (manual path)

Every browser automation follows this pattern:

```
1. browser_tabs          → Get tab IDs
2. browser_navigate      → Go to the right page
3. browser_wait          → Wait for page to load
4. browser_js            → Extract data / check state
5. browser_human_click   → Interact with elements
6. browser_fill_form     → Type into inputs
7. browser_js            → Verify result
```

### Example: Like a post on Instagram

```
1. browser_tabs → find Instagram tab ID
2. browser_navigate → https://www.instagram.com/someuser/
3. browser_wait → "document.querySelector('article')" (wait for post to load)
4. browser_human_click → "svg[aria-label='Like']" (click Like button)
5. browser_js → verify "svg[aria-label='Unlike']" exists (confirmed liked)
```

### Example: Post a tweet on X

```
1. browser_tabs → find X tab ID
2. browser_human_click → "[data-testid='SideNav_NewTweet_Button']" (compose)
3. browser_wait → "[data-testid='tweetTextarea_0']" visible
4. browser_fill_form → type tweet text into the textbox
5. browser_human_click → "[data-testid='tweetButton']" (post)
```

---

## Critical Rules

### 1. Always get tab IDs first

```
browser_tabs → returns list of tabs with IDs
```
Pass the `tabId` parameter to all browser tools. Tab IDs change when the MCP server restarts, so **always call browser_tabs at the start** of any browser workflow.

### 2. Use the right click tool for the right situation

| Situation | Tool | Why |
|-----------|------|-----|
| Standard buttons, links | `browser_human_click` | Realistic mouse events, works on most elements |
| Dropdowns, menus that don't respond | JS dispatch | Some React apps need `mousedown+mouseup+click` sequence |
| Desktop app buttons | `click` (x, y coordinates) | Native OS-level click |
| WebGL canvas (Figma, etc.) | `browser_human_click` | CDP Input events work, DOM events don't |

**JS dispatch pattern** (for stubborn React elements like X/Twitter retweet button):
```javascript
const el = document.querySelector('[data-testid="retweet"]');
el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
```

### 3. Use the right typing tool for the right input

| Input type | Tool | Why |
|-----------|------|-----|
| Standard `<input>` | `browser_fill_form` | CDP key events, human-like delays |
| React controlled textarea (X DMs) | Native value setter via `browser_js` | React ignores CDP key events |
| ProseMirror/contenteditable (Codex) | `execCommand('insertText')` via `browser_js` | Only method ProseMirror accepts |
| Desktop app text fields | `type_text` | OS-level typing |

**Native value setter pattern** (for React textareas):
```javascript
const textarea = document.querySelector('textarea');
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
setter.call(textarea, 'your text here');
textarea.dispatchEvent(new Event('input', { bubbles: true }));
```

**execCommand pattern** (for contenteditable/ProseMirror):
```javascript
document.querySelector('.ProseMirror').focus();
document.execCommand('insertText', false, 'your text here');
```

### 4. Respect rate limits

Every platform has rate limits. Going too fast = account suspension.

| Platform | Guideline |
|----------|-----------|
| Instagram | 20-30 actions/hour, 3-5s between actions |
| X/Twitter | ~8 actions/hour, stricter on follows |
| LinkedIn | ~6 actions/hour |
| Reddit | ~4 actions/hour |

Add random delays (3-10s) between actions. Use `browser_stealth` before interacting with sites that detect automation.

### 5. VS Code steals focus

When Claude Code outputs text in VS Code terminal, VS Code becomes the frontmost app. This breaks `type_text`, `key`, `click` (native tools) because they target the frontmost app.

**Solution:** Use CDP browser tools (`browser_js`, `browser_human_click`, `browser_fill_form`) for browser automation — they work regardless of which app is in front. Only use native tools (`click`, `key`, `type_text`) when you specifically need desktop app control, and call `focus` immediately before.

---

## Two Knowledge Systems: Memory vs Playbooks

ScreenHand has **two separate knowledge systems** that serve different purposes. Understanding when to use each is critical.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  MEMORY (reference knowledge)          PLAYBOOK (automation recipe) │
│  ─────────────────────────             ───────────────────────────  │
│  "What happened & what I learned"      "How to do this task"        │
│                                                                     │
│  Stores:                               Stores:                      │
│  • Past action logs                    • Executable steps[]         │
│  • Error patterns + fixes              • CSS selectors by area      │
│  • Successful strategies               • Named flows with guards    │
│  • Session-specific learnings          • Known errors + solutions   │
│                                        • Detection expressions      │
│  Lives in: ~/.screenhand/memory/       • Platform URLs              │
│  Accessed via: memory_* tools                                       │
│  Auto-injected: YES (error hints)      Lives in: playbooks/*.json   │
│                                        Accessed via: platform_guide │
│  Best for:                                       + auto-injection   │
│  • "Has this tool failed before?"                                   │
│  • "What strategy worked last time?"   Best for:                    │
│  • Recording new discoveries           • "Run this task hands-free" │
│  • Guiding manual execution            • "What selectors work here?"│
│                                        • "What errors will I hit?"  │
│                                        • Repeatable automation      │
└─────────────────────────────────────────────────────────────────────┘
```

### Memory = Reference (guides you while you work manually)

Memory is the **diary**. It records what happened, what worked, what failed. Use it when:
- You're doing something **new** and want to check past experience
- You want to **save a discovery** for future sessions
- You hit an error and want to check if there's a **known fix**

Memory tools:
```
memory_recall(query="figma canvas click")     → "CDP Input.dispatchMouseEvent works, DOM clicks don't"
memory_record_error(tool, error, resolution)  → saves for future auto-warning
memory_record_learning(scope, pattern, fix)   → saves a verified pattern
memory_save(task, steps)                      → saves a successful strategy
```

Memory is **auto-injected** into tool responses via the wrapper — you'll see `⚡ Memory:` hints when a tool has failed before or matches a known strategy. You don't need to call `memory_recall` every time.

### Playbook = Executable (runs the task for you)

A playbook is the **recipe**. It contains everything needed to automate a platform. A playbook can be:

**1. Reference-only** (most current playbooks) — has `selectors{}`, `flows{}`, `errors[]` but NO `steps[]`:
```json
{
  "id": "figma",
  "selectors": { "toolbar": { "rectangle": "[data-testid='Rectangle-tool']" } },
  "flows": { "create_file": { "steps": ["Click new file button", "Wait for canvas"] } },
  "errors": [{ "error": "DOM clicks don't work on canvas", "solution": "Use CDP Input.dispatchMouseEvent" }]
}
```
→ You still do the work manually, but the playbook **tells you which selectors to use, what errors to expect, and how to fix them**. The ContextTracker auto-injects this as ⚠ and 💡 hints.

**2. Executable** — has a top-level `steps[]` array with machine-runnable actions:
```json
{
  "id": "canva-smoke-test",
  "steps": [
    { "action": "navigate", "url": "https://canva.com", "description": "Open Canva" },
    { "action": "press", "target": "[data-testid='create-button']", "description": "Click Create" },
    { "action": "wait", "ms": 2000, "description": "Wait for editor" }
  ]
}
```
→ This can run **hands-free** via `job_create(task="...", playbookId="canva-smoke-test")` + `job_run`. No manual work needed.

**3. Both** — has reference metadata AND executable steps. Best of both worlds: auto-runs the steps, and if a step fails, the AI recovery system uses the selectors/errors/flows to figure out what went wrong.

### The lifecycle: Reference → Executable

Playbooks start as reference and can evolve into executable:

```
Session 1: No playbook exists
  → You automate manually
  → export_playbook() saves URLs, selectors, errors as REFERENCE playbook
  → session_release() flushes auto-discovered selectors

Session 2: Reference playbook exists
  → ContextTracker auto-injects hints (⚠ errors, 💡 selectors)
  → You work faster because you know what works
  → PlaybookRunner (via jobs) can use AI-guided mode with playbook as context

Session 3+: After enough successful runs
  → PlaybookRunner auto-saves successful AI step sequences as executable steps[]
  → Playbook becomes EXECUTABLE
  → job_create(playbookId=...) runs it fully automated
```

### Directory Structure

```
references/          ← Curated knowledge (selectors, flows, errors, detection)
  figma.json           Team-built, auto-injected by ContextTracker + memory seeds
  x-twitter.json       Read via platform_guide() or auto-hints
  instagram.json       ...
  ...

playbooks/           ← Executable only (steps[] with action objects)
  x-twitter.json       Runnable via job_create(playbookId="x-twitter")
  instagram.json       Stripped to just: id, steps, metadata
  ...
```

### Available References (curated knowledge)

| Platform | File | Contents |
|----------|------|----------|
| Figma | `references/figma.json` | Selectors, flows, detection, errors (131 successes) |
| X/Twitter | `references/x-twitter.json` | Selectors, flows, errors, policy notes |
| Instagram | `references/instagram.json` | Selectors, flows, errors, policy notes |
| LinkedIn | `references/linkedin.json` | Selectors, flows, errors |
| Threads | `references/threads.json` | Selectors, flows, errors |
| Reddit | `references/reddit.json` | Selectors, flows, errors |
| Discord | `references/discord.json` | Selectors, flows, errors |
| Devpost | `references/devpost.json` | Flows, detection, errors (captcha notes) |
| Dev.to | `references/devto.json` | Selectors, flows, errors |
| YouTube | `references/youtube.json` | Selectors, flows, errors |
| n8n | `references/n8n.json` | Selectors, flows, errors |
| Codex Desktop | `references/codex-desktop.json` | Architecture, CDP, selectors |
| DaVinci Resolve | `references/davinci-resolve-*.json` | Menu maps, shortcuts |
| Canva | `references/canva-smoke-test.json` | Selectors with test results |
| X (legacy) | `references/x_v1.json`, `references/twitter.json` | Older X reference data |

### Available Executable Playbooks

| Platform | File | Steps |
|----------|------|-------|
| X/Twitter | `playbooks/x-twitter.json` | 7 steps (navigate, extract, scroll) |
| Instagram | `playbooks/instagram.json` | 7 steps |
| LinkedIn | `playbooks/linkedin.json` | 6 steps |
| Threads | `playbooks/threads.json` | 7 steps |
| Reddit | `playbooks/reddit.json` | 6 steps |
| Discord | `playbooks/discord.json` | 4 steps |
| Dev.to | `playbooks/devto.json` | 6 steps |
| YouTube | `playbooks/youtube.json` | 7 steps |
| n8n | `playbooks/n8n.json` | 4 steps |
| X change avatar | `playbooks/x_change_avatar.json` | Custom steps |

### How to use each type

**Reference playbook (no steps[]):**
```
1. platform_guide(platform="figma")           → Read selectors, flows, errors
2. Use the selectors from flows in your browser_* calls
3. Follow the flow steps as your manual guide
4. Check errors[] before trying something the playbook warns about
   (or just read the ⚠ hints auto-injected into tool responses)
```

**Executable playbook (has steps[]):**
```
1. job_create(task="Smoke test Canva", playbookId="canva-smoke-test")
2. job_run(jobId)                             → Runs all steps automatically
3. job_status(jobId)                          → Check if it succeeded
   If a step fails → AI recovery kicks in → patches playbook for next time
```

### When to use platform_guide vs rely on auto-injection

| Situation | What to do |
|-----------|-----------|
| Starting automation on a platform | Call `platform_guide(platform)` once to see the full picture |
| Mid-execution | Just read the ⚠/💡/📋 hints in tool responses — they're auto-injected |
| Hit an error | Check `platform_guide(platform, section="errors")` for known solutions |
| Want to see all selectors | `platform_guide(platform, section="selectors")` |
| Want to see step-by-step flows | `platform_guide(platform, section="flows")` |

### Playbook JSON structure

```json
{
  "id": "platform-name",
  "name": "Human readable name",
  "platform": "platform",
  "version": "1.0.0",
  "successCount": 0,
  "failCount": 0,

  "steps": [ ... ],          // EXECUTABLE: machine-runnable PlaybookStep objects
                              // Actions: navigate, press, type_into, extract, key_combo, scroll, wait, screenshot

  "selectors": {             // REFERENCE: CSS selectors grouped by UI area
    "toolbar": { "search": "[data-testid='search']", "menu": "[aria-label='Menu']" },
    "editor": { "canvas": "canvas.main", "save": "[data-testid='save']" }
  },

  "flows": {                 // REFERENCE: human-readable step sequences with guards
    "login": {
      "steps": ["Navigate to /login", "Fill email field", "Fill password", "Click submit"],
      "guards": ["Must not be already logged in"],
      "why": "Why this flow works this way"
    }
  },

  "errors": [                // REFERENCE: known pitfalls (auto-injected as ⚠ hints!)
    {
      "error": "el.click() doesn't work on canvas",
      "context": "Figma editor WebGL canvas",
      "solution": "Use CDP Input.dispatchMouseEvent via browser_human_click",
      "severity": "high"
    }
  ],

  "detection": {             // REFERENCE: JS expressions to check page state
    "is_logged_in": "!!document.querySelector('[data-testid=\"home\"]')",
    "is_editor": "!!document.querySelector('canvas')"
  },

  "urls": {                  // REFERENCE: named URLs for the platform
    "home": "https://platform.com",
    "editor": "https://platform.com/editor/{id}"
  },

  "policyNotes": {           // REFERENCE: rate limits, safety rules
    "rate_limits": ["Max 8 posts/hour", "3-5s delay between actions"]
  }
}
```

### Creating & Improving Playbooks

**Automatic improvement (every session, zero effort):**
- ContextTracker collects tool outcomes in-memory during execution
- On `session_release` (or every 50 tool calls), it flushes:
  - Selectors that worked 2+ times → added to `selectors.auto_discovered`
  - Error patterns seen 2+ times → added to `errors[]`
- PlaybookRunner (via jobs) saves successful AI step sequences as `steps[]`
- One atomic disk write — no performance cost during execution

**Manual export (when you want to save a full playbook):**
```
export_playbook(platform="twitter", domain="x.com", description="Twitter automation")
```
Pulls URLs, selectors, errors, and strategies from memory → saves to `references/twitter.json`.

**Converting reference → executable:**
To add executable steps to a reference playbook, either:
1. Use `job_create` without a playbookId — PlaybookRunner uses AI mode, and on success auto-saves the step sequence as a new playbook
2. Manually add a `steps[]` array to the playbook JSON following the PlaybookStep format

---

## Common Patterns

### Extract data from a page

```javascript
// browser_js — extract all post texts
(() => {
  const posts = document.querySelectorAll('article');
  return Array.from(posts).map(p => ({
    user: p.querySelector('header a')?.textContent,
    text: p.querySelector('[data-testid="tweetText"]')?.textContent
  }));
})()
```

### Wait for navigation

```javascript
// browser_wait — wait for URL change
window.location.href.includes('/design/')
```

### Check if logged in

```javascript
// browser_js — platform-specific checks
!!document.querySelector('[data-testid="AppTabBar_Home_Link"]')  // X/Twitter
!!document.querySelector('svg[aria-label="Home"]')                // Instagram
```

### Handle dialogs/modals

```javascript
// browser_js — find and click confirmation buttons
const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
if (confirm) confirm.click();
```

### Search on a platform

For most platforms, **direct URL navigation** is more reliable than typing in search boxes:
```
browser_navigate → https://x.com/search?q=your+query&src=typed_query
browser_navigate → https://www.instagram.com/explore/search/keyword/
```

---

## Desktop App Automation

For native macOS/Windows apps (not browser):

```
1. apps            → list running apps, find bundle ID
2. focus           → bring the app to front (REQUIRED before native interactions)
3. ui_tree         → discover all UI elements and their roles
4. screenshot/ocr  → see what's on screen
5. click/key       → interact via coordinates or keyboard
6. menu_click      → use app menus (e.g., "File/New Thread")
```

### Electron Apps (Codex, VS Code, Slack, etc.)

Electron apps are special — they're web apps in a Chromium shell. You can use **both** native tools AND CDP:

1. Launch with `--remote-debugging-port=XXXX` to enable CDP
2. Use `browser_tabs` / `browser_js` / `browser_human_click` for web content
3. Use `menu_click` for native menus
4. See `playbooks/codex-desktop.json` for the proven Codex approach

---

## Debugging Tips

| Problem | Solution |
|---------|----------|
| Element not found | Use `browser_dom` to check if selector exists. Try `browser_js` with `document.querySelector()` |
| Click doesn't work | Try `browser_human_click` first. If that fails, try JS dispatch (mousedown+mouseup+click). Check if element is inside an iframe. |
| Typed text disappears | The input might be React-controlled. Use native value setter pattern (see above). |
| Page looks different than expected | Take a `screenshot` or use `browser_js` to read `document.title` and `window.location.href` |
| Tab ID invalid | Call `browser_tabs` again — IDs change on MCP server restart |
| Native click hits wrong spot | Use `screenshot` to verify coordinates. Screen coordinates differ from browser viewport coordinates. |
| Timeout errors | The native bridge can timeout under heavy load. Use browser tools (CDP) as fallback — they're faster and more reliable. |

---

## Quick Reference: Tool Selection

```
Need to...                          → Use this tool
─────────────────────────────────────────────────────
BEFORE STARTING (do these first!)
  Check if a site is automatable    → playbook_preflight(url, task)
  See what's known about a platform → platform_guide(platform)
  Auto-run a known playbook         → job_create(task, playbookId) + job_run

BROWSER AUTOMATION
  See what tabs are open            → browser_tabs
  Go to a URL                       → browser_navigate
  Click a button in Chrome          → browser_human_click
  Type in a form field              → browser_fill_form
  Run JS / extract data             → browser_js
  Wait for something to load        → browser_wait

DESKTOP AUTOMATION
  Click in a desktop app            → focus + click
  Type in a desktop app             → focus + type_text
  Press keyboard shortcut           → focus + key
  Take a screenshot                 → screenshot
  Read all text on screen           → ocr
  Find UI elements in native app    → ui_tree
  Open an app                       → launch
  Use app menu (File, Edit, etc.)   → menu_click

AFTER FINISHING (do these last!)
  Save session as playbook          → export_playbook(platform, domain)
  Release session + flush learnings → session_release(sessionId)
  Remember something specific       → memory_save / memory_record_learning
  Recall past learnings             → memory_recall
```

---

## How the Auto-Learning Loop Works

```
┌──────────────────────────────────────────────────────────────┐
│  You call browser_navigate("https://x.com")                 │
│    → ContextTracker detects domain: "x.com"                  │
│    → Matches playbook: "x-twitter"                           │
│    → Caches errors, selectors, flows (one-time, ~0ms)        │
│                                                              │
│  You call browser_human_click(selector: "button.tweet")      │
│    → ContextTracker checks: any known errors for click + x.com? │
│    → Injects: "⚠ el.click() fails on React — use human_click" │
│    → Tool executes normally                                   │
│    → Records outcome: {tool, selector, success, domain}       │
│                                                              │
│  ... 48 more tool calls, all collecting outcomes ...          │
│                                                              │
│  You call session_release(sessionId)                         │
│    → Flush: selectors that worked 2+ times → playbook        │
│    → Flush: errors seen 2+ times → playbook                  │
│    → One atomic disk write to playbooks/x-twitter.json        │
│                                                              │
│  NEXT SESSION on x.com:                                      │
│    → Playbook is richer — more selectors, more known errors   │
│    → Hints are more accurate                                  │
│    → If steps[] exist → job_create auto-executes it           │
└──────────────────────────────────────────────────────────────┘
```

**Cost of auto-learning:** Zero extra latency, zero LLM calls, zero disk I/O during execution. All in-memory map lookups and array pushes. Only one disk write on session end.

---

## File Locations

| What | Where |
|------|-------|
| Reference knowledge | `references/*.json` — selectors, flows, errors, detection |
| Executable playbooks | `playbooks/*.json` — steps[] only, runnable via job_create |
| Context tracker | `src/context-tracker.ts` |
| Playbook seeds | `src/memory/playbook-seeds.ts` — loads references into memory |
| MCP server code | `mcp-desktop.ts` |
| Native bridge (macOS) | `native/macos-bridge/` |
| Memory storage | `~/.screenhand/memory/` |
| Job queue | `~/.screenhand/jobs/` |
| Session locks | `~/.screenhand/locks/` |
| This guide | `docs/screenhand-usage-guide.md` |
