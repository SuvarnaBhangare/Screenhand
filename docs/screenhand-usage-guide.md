# ScreenHand (sh) Usage Guide for Claude Code

**What this is:** A practical guide for using ScreenHand MCP tools inside Claude Code sessions. Read this before automating any desktop app or browser workflow.

---

## What is ScreenHand?

ScreenHand (`sh`) is an MCP server that gives you **eyes and hands on the desktop**. It's already connected to your Claude Code session as the `sh` MCP server. All tools are prefixed with `mcp__sh__`.

You can:
- Control Chrome tabs (navigate, click, type, extract data)
- Control desktop apps (focus, click, type, screenshot, read UI trees)
- Run multi-step automation jobs
- Save/recall learnings across sessions via memory

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

### Memory Tools (persist learnings)

| Tool | What it does |
|------|-------------|
| `memory_save` | Save a learning for future sessions |
| `memory_recall` | Retrieve past learnings by topic |
| `memory_record_error` | Record an error pattern + fix |
| `memory_record_learning` | Record a discovery |

---

## Core Workflow Pattern

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

## Playbooks

Playbooks are JSON files in `playbooks/` that document **battle-tested selectors, flows, and error patterns** for each platform. They save you from rediscovering what works.

### Available Playbooks

| Platform | File | Key selectors |
|----------|------|---------------|
| Instagram | `playbooks/instagram.json` | `svg[aria-label='Like']`, `textarea[aria-label='Add a comment...']` |
| X/Twitter | `playbooks/x-twitter.json` | `[data-testid='tweet']`, `[data-testid='like']`, `[data-testid='tweetButton']` |
| LinkedIn | `playbooks/linkedin.json` | Various `data-testid` and aria-label selectors |
| Threads | `playbooks/threads.json` | Content-based selectors |
| Reddit | `playbooks/reddit.json` | `[data-testid]` selectors |
| Discord | `playbooks/discord.json` | `[class*='message']` patterns |
| Figma | `playbooks/figma.json` | `[data-testid='Rectangle-tool']`, canvas interactions via CDP |
| Codex Desktop | `playbooks/codex-desktop.json` | ProseMirror + CDP via `--remote-debugging-port=9333` |
| Dev.to | `playbooks/devto.json` | Standard form selectors |
| YouTube | `playbooks/youtube.json` | `[data-testid]` selectors |

### How to use a playbook

1. **Read the playbook** before automating a platform:
   ```
   Read playbooks/instagram.json
   ```
2. **Use the selectors** from the playbook — don't guess
3. **Check the errors section** — it lists what doesn't work and the proven fixes
4. **Check the flows section** — step-by-step instructions for common actions

### Playbook structure

```json
{
  "selectors": { ... },     // CSS selectors that work
  "flows": { ... },         // Step-by-step action recipes
  "errors": [ ... ],        // Known pitfalls + solutions
  "policyNotes": { ... },   // Rate limits, safety rules
  "tool_preferences": { ... } // Which sh tool to use for what
}
```

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
See what tabs are open              → browser_tabs
Go to a URL                         → browser_navigate
Click a button in Chrome            → browser_human_click
Type in a form field                → browser_fill_form
Run JS / extract data               → browser_js
Wait for something to load          → browser_wait
Click in a desktop app              → focus + click
Type in a desktop app               → focus + type_text
Press keyboard shortcut             → focus + key
Take a screenshot                   → screenshot
Read all text on screen             → ocr
Find UI elements in native app      → ui_tree
Open an app                         → launch
Use app menu (File, Edit, etc.)     → menu_click
Remember something for next time    → memory_save
Recall past learnings               → memory_recall
```

---

## File Locations

| What | Where |
|------|-------|
| Playbooks | `playbooks/*.json` |
| MCP server code | `mcp-desktop.ts` |
| Native bridge (macOS) | `native/macos-bridge/` |
| Memory storage | `~/.screenhand/memory/` |
| Job queue | `~/.screenhand/jobs/` |
| Session state | `~/.screenhand/sessions/` |
| This guide | `docs/screenhand-usage-guide.md` |
