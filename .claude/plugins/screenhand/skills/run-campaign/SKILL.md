---
name: run-campaign
description: >
  Run a multi-platform marketing campaign. Post adapted content across multiple social media
  platforms in sequence or parallel. Use when: "post to all platforms", "run a campaign",
  "cross-post", "distribute content", "publish everywhere", "marketing blast",
  "schedule posts across", "multi-platform post".
disable-model-invocation: true
allowed-tools:
  - mcp__sh__job_create
  - mcp__sh__job_create_chain
  - mcp__sh__job_list
  - mcp__sh__job_status
  - mcp__sh__job_run
  - mcp__sh__job_run_all
  - mcp__sh__worker_start
  - mcp__sh__worker_status
  - mcp__sh__orchestrator_start
  - mcp__sh__orchestrator_stop
  - mcp__sh__orchestrator_submit
  - mcp__sh__orchestrator_status
  - mcp__sh__platform_guide
  - mcp__sh__memory_recall
  - mcp__sh__memory_save
  - mcp__sh__memory_query_patterns
---

# Multi-Platform Campaign Execution

You are running a marketing campaign across multiple social media platforms using ScreenHand's job system and orchestrator.

## Intelligence Wrapper

Every tool call returns automatic hints. The server auto-loads platform references when navigating to social media URLs. Watch for `[HINT]`, `[WARNING]`, and `[STRATEGY]` lines in responses — they contain selectors and known issues.

## Available Playbooks

These are real executable playbooks for each platform. Use the exact `playbookId` values:

| Platform | `playbookId` | Reference Name |
|----------|-------------|---------------|
| X/Twitter | `x-twitter` | `x-twitter` |
| LinkedIn | `linkedin` | `linkedin` |
| Instagram | `instagram` | `instagram` |
| Reddit | `reddit` | `reddit` |
| Threads | `threads` | `threads` |
| YouTube | `youtube` | `youtube` |
| Discord | `discord` | `discord` |

## Step 1: Content Preparation

Ask the user for:
- **Core message**: The main content to post
- **Target platforms**: Which platforms (default: X, LinkedIn, Threads)
- **Media**: Any images or videos to attach
- **Timing**: Sequential (one after another) or parallel (all at once)

## Step 2: Content Adaptation

Adapt the core message for each platform's format and culture:

| Platform | Max Length | Tone | Notes |
|----------|-----------|------|-------|
| X/Twitter | 280 chars | Concise, punchy | Hashtags at end, thread for long content |
| LinkedIn | 3000 chars | Professional, insight-driven | Line breaks for readability, no hashtag spam |
| Reddit | Title 300 + Body unlimited | Community-native, no self-promo feel | Needs subreddit. Ask user which one. |
| Threads | 500 chars | Casual, conversational | Emojis OK, no links (use bio) |
| Instagram | 2200 chars caption | Visual-first, hashtags in comments | Requires image/video |
| Discord | 2000 chars | Casual, community | Needs server + channel IDs |
| YouTube | Comment: 10000 | Informative | For community posts or comments |

Present the adapted versions to the user for approval before posting.

## Step 3A: Parallel Execution (3+ platforms, recommended)

Use the orchestrator for true parallelism — each platform runs in its own browser tab:

```
1. orchestrator_start(webSlots=4, nativeSlots=1)
2. For each platform:
   orchestrator_submit(
     task="Post on {platform}: {adapted_content}",
     mode="web",
     bundleId="com.google.Chrome"
   )
3. Monitor: orchestrator_status() — poll every 30 seconds
4. When all complete: orchestrator_stop()
```

## Step 3B: Sequential Execution (2 platforms or fallback)

Use job chains when order matters or orchestrator isn't needed:

```
1. job_create_chain(jobs=[
     { task: "Post on X/Twitter", playbookId: "x-twitter", vars: { POST_TEXT: "{twitter_adapted_text}" } },
     { task: "Post on LinkedIn", playbookId: "linkedin", vars: { POST_TEXT: "{linkedin_adapted_text}" } },
     { task: "Post on Threads", playbookId: "threads", vars: { POST_TEXT: "{threads_adapted_text}" } }
   ])
2. job_run_all() — processes the chain in order, passing data between jobs
```

## Step 3C: Background Execution

For fire-and-forget campaigns:

```
1. Create jobs (chain or individual)
2. worker_start() — spawns background daemon
3. Worker processes queue automatically
4. Check later: worker_status()
```

## Step 4: Monitoring & Reporting

During execution, track progress:
- `job_list(state="running")` — see what's active
- `job_status(jobId)` — detailed step-by-step progress
- `orchestrator_status()` — if using parallel mode

## Step 5: Campaign Summary

After all posts complete, produce a report:

```
Campaign Report
===============
Platforms: X, LinkedIn, Threads
Status: 3/3 completed
Results:
  - X: Posted successfully (tweet visible)
  - LinkedIn: Posted successfully
  - Threads: Posted successfully
Errors: None
Time: 2m 34s total
```

Call `memory_save(task="campaign: {summary}")` to persist the strategy.

## Error Recovery

- **One platform fails**: Other platforms continue. Failed job transitions to `failed` state.
- **Rate limit on one platform**: Skip it, complete others, retry later with `job_transition(jobId, "queued")`.
- **Login required**: Pause campaign, ask user to log in, resume with `job_resume`.
- **All platforms fail**: Check `memory_errors(tool="browser_navigate")` for patterns.

## Rate Limit Reference

- X: ~50 posts/day, ~2400 per 24h API
- LinkedIn: ~150 connection requests/week, posts ~25/day
- Instagram: ~100 follows/hour, ~10 posts/day
- Reddit: ~1 post per 10 min per subreddit
- Discord: ~5 messages per 5 seconds per channel
- Threads: Conservative — treat like Instagram

$ARGUMENTS
