# ScreenHand 2-Hour Threads Campaign

## Platform: threads.net (Meta Threads)
## Playbook: playbooks/threads.json
## Goal: Build awareness + community around ScreenHand in AI automation space

---

## RATE LIMITS (from playbook)
- Likes: 60/hr, 150/day → we'll do ~30/hr (safe)
- Replies: 20/hr, 60/day → we'll do ~6/hr (safe)
- Reposts: 20/hr → we'll do ~4/hr (safe)
- Follows: 20/hr, 100/day → we'll do ~8/hr (safe)
- Posts: 3/hr (organic cadence)
- Random delays: 2-5s between actions

---

## POSTS TO PUBLISH (6 posts, staggered across 2 hours)

### Post 1 — The Problem (0:00)
```
AI agents can think. They can code. They can reason.

But they can't click a button.

That's the gap ScreenHand fills — an MCP server giving any AI agent native desktop control on macOS + Windows.

No API keys. No cloud. No fixed scripts. 82 tools. One protocol.

The AI has a brain. ScreenHand gives it hands.
```

### Post 2 — Contrarian (0:20)
```
If your automation breaks when a button moves 10 pixels, you don't have automation. You have a time bomb.

ScreenHand doesn't rely on fixed selectors. It uses fallback chains:

Accessibility API → CDP → Vision → AppleScript

If one fails, it adapts. It also remembers what worked — gets faster every run.

Not a fixed script. An adaptive system.
```

### Post 3 — Stack Multiplier (0:40)
```
The AI stack nobody's talking about:

Claude Code → thinks + codes
Figma MCP → design tokens
ScreenHand → opens the browser, verifies pixels, clicks deploy

What takes 45 min manually takes 3 min with this stack.

Works with GPT 5.4, OpenClaw, Cursor, any MCP client. Switch your AI model, keep your automation layer.
```

### Post 4 — Security (1:00)
```
Every cloud automation tool has the same problem — your credentials pass through someone else's server.

ScreenHand runs locally. On your machine.
No cloud relay.
No API keys to leak.
No third-party credential storage.

AGPL licensed. You own it completely.

Your data stays yours.
```

### Post 5 — Builder Empathy (1:20)
```
Building AI agents? Here's what nobody tells you:

The hardest part isn't the reasoning. It's the last mile — actually executing actions in real software.

We built ScreenHand because we hit this wall ourselves. 82 MCP tools later, our agents can control any app on the desktop.

What are you building? Drop it below.
```

### Post 6 — Demo Hook (1:40)
```
What ScreenHand does in one MCP call:

→ browser_human_click — clicks like a real human, anti-detection built in
→ memory_recall — remembers patterns from previous runs
→ execution_plan — plans multi-step workflows with fallbacks
→ export_playbook — saves learned flows for autonomous replay

Not scripts. Not recordings. Adaptive execution.

Open source. Link in bio.
```

---

## REPLY TEMPLATES (for engaging with relevant posts)

### AI Agents / Automation
```
R1: This is exactly why we built ScreenHand — the execution layer is the missing piece. Agents can reason but need OS-level control to do real work. We use accessibility APIs + CDP, not screenshots.

R2: Interesting take. One thing we've learned building ScreenHand — the fallback chain matters more than any single method. AX fails? Try CDP. CDP fails? Vision. Resilience over precision.

R3: Have you tried giving your agent actual desktop control? We built an MCP server (ScreenHand) that lets Claude/GPT control any app natively. Changed how we think about automation.
```

### MCP / Developer Tools
```
R4: MCP is the right protocol for this. We built ScreenHand as an MCP server — 82 tools for desktop + browser control. Any MCP client can drive it. The ecosystem composability is what makes it powerful.

R5: This is the beauty of MCP — composability. We built ScreenHand (desktop control) as an MCP server so it stacks with tools like yours naturally. Brain + hands.
```

### Selenium / Playwright / Automation Frustrations
```
R6: Felt this pain. Selector-based automation is fundamentally brittle. We switched to accessibility-tree-first with ScreenHand — the OS exposes elements semantically, not positionally. Way more resilient.

R7: The maintenance tax on automation scripts is brutal. We built fallback chains (AX → CDP → Vision → AppleScript) specifically because no single method is reliable enough alone.
```

### No API / Privacy
```
R8: This is why we went API-free with ScreenHand. No API keys = no rate limits, no platform approval needed. Controls the actual UI like a human. Your credentials never leave your machine.

R9: API dependency is a single point of failure. ScreenHand uses native OS accessibility — no platform API needed. The app doesn't know it's being automated.
```

### Claude Code / Cursor / Figma
```
R10: Claude Code + ScreenHand is a wild combo. Claude thinks and codes, ScreenHand handles everything outside the IDE — browser testing, deployment UIs, form filling, visual verification.

R11: We use this stack daily. Cursor for code, ScreenHand for the execution layer. The agent never leaves flow — zero manual context switching.

R12: Figma MCP gives you design tokens. But who verifies the build matches? ScreenHand opens the browser, screenshots the result, compares pixels. Design review on autopilot.
```

### General / Community Building
```
R13: Love seeing more builders in this space. We're working on something similar with ScreenHand — happy to share what we've learned about desktop automation if it helps.

R14: The difference with ScreenHand vs traditional automation: it adapts. Memory system records patterns, fallback chains handle UI changes, playbooks export learned flows for autonomous replay.

R15: Great question. We've been deep in this — built ScreenHand to bridge the gap between AI reasoning and real-world execution. Would love to hear your approach too.
```

---

## DM TEMPLATES (warm outreach — only to people who engaged first)

### DM1 — After they liked/replied to your post
```
Hey! Noticed you engaged with my post about ScreenHand. Are you building AI agents or working on automation? Would love to hear what stack you're using — always learning from other builders.
```

### DM2 — After they posted about MCP/agents
```
Hey, saw your post about [topic]. Really resonated — we've been building ScreenHand (MCP server for desktop control) and hit the same challenges. Curious what you're working on?
```

### DM3 — Active community member
```
Hey! Keep seeing your posts about [AI/automation/MCP] — solid insights. We're building ScreenHand, an open-source MCP server for desktop control. Would love your take on it if you have a sec.
```

### DM4 — Developer with automation frustrations
```
Saw your thread about [Selenium/API/automation] struggles. We built ScreenHand for exactly this — no API keys, self-learning, fallback chains. Happy to share how we solved [their problem] if useful.
```

### DM5 — Potential collaborator
```
Hey! Your work on [their project] is solid. We built ScreenHand (desktop control MCP server) and I think there could be a natural integration. Open to a quick chat?
```

---

## SEARCH QUERIES (for finding engagement targets)

```
AI agents
MCP server
desktop automation
browser automation
Claude Code
Cursor AI
Selenium alternative
no-code automation
Figma to code
AI tools
open source AI
automation framework
AI developer tools
building in public AI
```

---

## TARGET COMMUNITIES & ACCOUNTS

### Topics to search + engage
- AI agents, AI automation, MCP ecosystem
- Claude Code, Anthropic, Cursor, Windsurf
- Figma-to-code, design-to-code
- DevTools, developer productivity
- Open source AI tools
- Indie hackers building AI products
- No-code/low-code builders
- Browser automation, web scraping
- Desktop productivity tools

### Engagement priority
1. People posting about MCP or AI agents (highest relevance)
2. Claude Code / Cursor users sharing workflows
3. Developers frustrated with Selenium/Playwright/APIs
4. Figma-to-code community
5. General AI/automation enthusiasts

---

## 2-HOUR ENGAGEMENT CADENCE

### Selectors reference (from threads.json playbook)
- Create post: `svg[aria-label='Create']` → `div[role='textbox']` → Post button
- Like: `svg[aria-label='Like']` → verify `svg[aria-label='Unlike']`
- Reply: `svg[aria-label='Reply']` → `div[role='textbox']` → Post button
- Repost: `svg[aria-label='Repost']` → `RepostRepost` menu item
- Search: navigate to `threads.com/search` → `input[placeholder='Search']`
- Follow: profile page → `div[role='button']` with text 'Follow'

### Minute-by-minute schedule

```
0:00  — Post 1 (Problem Statement) via create_post flow
0:03  — Search "AI agents" → like 3 relevant posts
0:08  — Reply to 1 post (R1 template)
0:10  — Reply to 1 post (R4 template)
0:13  — Like 3 posts from feed
0:17  — Follow 2 relevant profiles
0:20  — Post 2 (Contrarian)
0:24  — Search "MCP server" → like 3 posts
0:28  — Reply to 1 post (R5 template)
0:30  — Reply to 1 post (R6 template)
0:33  — Like 3 posts + Repost 1 relevant post
0:37  — Follow 2 profiles
0:40  — Post 3 (Stack Multiplier)
0:43  — Search "Claude Code" → like 3 posts
0:47  — Reply to 1 post (R10 template)
0:50  — Reply to 1 post (R12 template)
0:53  — Like 3 posts from feed
0:55  — Follow 2 profiles
0:57  — DM1 to someone who engaged with Post 1
1:00  — Post 4 (Security)
1:03  — Search "desktop automation" → like 3 posts
1:07  — Reply to 1 post (R8 template)
1:10  — Reply to 1 post (R2 template)
1:13  — Like 3 posts + Repost 1
1:17  — Follow 2 profiles
1:20  — Post 5 (Builder Empathy)
1:23  — Search "browser automation" → like 3 posts
1:27  — Reply to 1 post (R7 template)
1:30  — Reply to 1 post (R13 template)
1:33  — Like 3 posts
1:37  — Follow 2 profiles
1:40  — Post 6 (Demo Hook)
1:43  — Search "Figma to code" → like 3 posts
1:47  — Reply to 1 post (R14 template)
1:50  — Reply to 1 post (R3 template)
1:53  — Like 3 posts + Repost 1
1:55  — DM2 to relevant community member
1:57  — Follow 2 profiles
2:00  — Reply to comments on own posts, wrap up
```

### Totals over 2 hours
- Posts: 6
- Likes: ~54 (within 60/hr limit)
- Replies: ~14 (within 20/hr limit)
- Reposts: 3 (within 20/hr limit)
- Follows: ~14 (within 20/hr limit)
- DMs: 2 (warm outreach only)

### Safety rules
- browser_stealth before first interaction
- browser_human_click for all Like/Repost/Follow actions
- browser_fill_form with 60-100ms delay for all typing
- 2-5s random delay between every action
- 30-90s gap between action clusters
- If rate limited → pause 15 minutes, resume

---

## AUTOMATION FLOW (ScreenHand execution)

### For each "Post" action:
```
1. browser_human_click → svg[aria-label='Create']
2. browser_wait → 1.5s for dialog
3. browser_fill_form → div[role='textbox'], text=POST_CONTENT, delayMs=70
4. browser_js → click Post button
5. browser_wait → 1s for publish
```

### For each "Search + Like" action:
```
1. browser_navigate → threads.com/search
2. browser_wait → 1s
3. browser_fill_form → input[placeholder='Search'], text=QUERY, delayMs=100
4. browser_wait → 2s for results
5. browser_js → extract posts from feed
6. browser_human_click → svg[aria-label='Like'] on post 1
7. Wait 3-5s
8. browser_human_click → svg[aria-label='Like'] on post 2
9. Wait 2-4s
10. browser_human_click → svg[aria-label='Like'] on post 3
```

### For each "Reply" action:
```
1. browser_human_click → svg[aria-label='Reply'] on target post
2. browser_wait → 1.5s for dialog
3. browser_fill_form → div[role='textbox'], text=REPLY_TEMPLATE, delayMs=80
4. browser_js → click Post button
5. browser_wait → 1s
```

### For each "Follow" action:
```
1. browser_js → extract username from post link
2. browser_navigate → threads.com/@{username}
3. browser_wait → 2s
4. browser_js → find and click Follow button
5. browser_wait → 1s
6. browser_navigate → back to feed/search
```

---

## CRON/LOOP SETUP

Run with: `/loop 5m` to keep campaign alive across 2 hours.

Each loop iteration:
1. Check elapsed time from campaign start
2. Look up next scheduled actions from the cadence
3. Execute 2-3 actions per iteration
4. Log results to threads_campaign_log.txt
5. If 2 hours elapsed → stop

If rate limited → pause 15 min → resume from where stopped.
