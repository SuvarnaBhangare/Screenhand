import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_feature_map_report.json';
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-feature-map', version: '1.0.0' }, { capabilities: {} });

const ROUTES = [
  { key: 'home', url: 'https://x.com/home' },
  { key: 'explore', url: 'https://x.com/explore' },
  { key: 'notifications', url: 'https://x.com/notifications' },
  { key: 'messages', url: 'https://x.com/messages' },
  { key: 'compose', url: 'https://x.com/compose/post' }
];

const report = {
  startedAt: new Date().toISOString(),
  source: 'screenhand-mcp',
  tab: null,
  stealth: null,
  routes: [],
  guide: {
    post: [],
    comment: [],
    like: [],
    repost: [],
    bookmark: [],
    dm: []
  },
  errors: []
};

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '')
  .split('\n')
  .map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  })
  .filter(Boolean);

async function call(name, arguments_ = {}) {
  try {
    const res = await client.callTool({ name, arguments: arguments_ });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function js(tabId, code) {
  const r = await call('browser_js', { tabId, code });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, text: r.text, data: j(r.text) };
}

async function getXTabId() {
  const tabsRes = await call('browser_tabs', {});
  if (!tabsRes.ok) return { ok: false, error: tabsRes.error };
  const tabs = parseTabs(tabsRes.text);
  let xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) {
    const open = await call('browser_open', { url: 'https://x.com/home' });
    if (!open.ok) return { ok: false, error: open.error };
    const m = open.text.match(/Opened:\s*([A-F0-9]+)\s+—/i);
    if (m) return { ok: true, tabId: m[1] };
    const tabs2 = parseTabs((await call('browser_tabs', {})).text || '');
    xTab = tabs2.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  }
  if (!xTab) return { ok: false, error: 'No X tab found/opened' };
  return { ok: true, tabId: xTab.id, url: xTab.url, title: xTab.title };
}

function firstTruthy(...vals) {
  for (const v of vals) if (v) return v;
  return null;
}

try {
  await client.connect(transport);
  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tab = await getXTabId();
  if (!tab.ok) throw new Error(tab.error);
  const tabId = tab.tabId;
  report.tab = { id: tabId, title: tab.title || null, url: tab.url || null };

  const stealth = await call('browser_stealth', { tabId });
  report.stealth = stealth.ok ? stealth.text : stealth.error;

  for (const route of ROUTES) {
    const entry = { key: route.key, url: route.url };
    try {
      entry.navigate = await call('browser_navigate', { tabId, url: route.url });
      entry.wait = await call('browser_wait', {
        tabId,
        condition: 'document.body && document.body.innerText.length > 50',
        timeoutMs: 30000
      });
      const probe = await js(tabId, `(() => {
        const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const exists = (sel) => !!document.querySelector(sel);
        const count = (sel) => document.querySelectorAll(sel).length;
        const body = clean(document.body?.innerText || '');
        const btnTexts = Array.from(document.querySelectorAll('button,[role="button"],a[role="link"]'))
          .map((el) => clean(el.textContent) || clean(el.getAttribute('aria-label')) || '')
          .filter(Boolean)
          .slice(0, 200);

        return {
          url: location.href,
          title: document.title,
          loggedOutLikely: /sign in|log in|create account|join x|sign up/i.test(body) && !/what's happening|for you/i.test(body),
          selectors: {
            nav_home: exists('a[href="/home"]'),
            nav_explore: exists('a[href="/explore"]'),
            nav_notifications: exists('a[href="/notifications"]'),
            nav_messages: exists('a[href="/messages"]'),
            nav_profile: exists('a[href^="/"][role="link"][aria-label*="Profile"], a[href*="/"][data-testid="AppTabBar_Profile_Link"]'),
            post_textarea: exists('[data-testid="tweetTextarea_0"], div[role="textbox"][data-testid="tweetTextarea_0"], div[aria-label*="Post text"], div[aria-label*="Tweet text"]'),
            post_button: exists('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'),
            reply_button: count('[data-testid="reply"]'),
            like_button: count('[data-testid="like"]'),
            unlike_button: count('[data-testid="unlike"]'),
            repost_button: count('[data-testid="retweet"], [data-testid="unretweet"]'),
            bookmark_button: count('[data-testid="bookmark"], [data-testid="removeBookmark"]'),
            dm_new: exists('[data-testid="DM_New_Direct_Message_Button"], a[href="/messages/compose"], [aria-label*="New message"]'),
            dm_search: exists('input[data-testid="searchPeople"], input[placeholder*="Search"], input[aria-label*="Search"]'),
            dm_composer: exists('[data-testid="dmComposerTextInput"], div[role="textbox"][data-testid="dmComposerTextInput"], div[role="textbox"][contenteditable="true"]'),
            dm_send: exists('[data-testid="dmComposerSendButton"], [aria-label="Send"]')
          },
          counts: {
            postsVisible: count('article [data-testid="tweet"]'),
            replyButtons: count('[data-testid="reply"]'),
            likeButtons: count('[data-testid="like"]'),
            repostButtons: count('[data-testid="retweet"]'),
            bookmarkButtons: count('[data-testid="bookmark"]')
          },
          buttonSamples: btnTexts
        };
      })()`);
      entry.probe = probe.ok ? probe.data : { error: probe.error };
    } catch (err) {
      entry.error = String(err?.message || err);
      report.errors.push({ route: route.key, error: entry.error });
    }
    report.routes.push(entry);
  }

  const homeProbe = firstTruthy(
    report.routes.find((r) => r.key === 'home')?.probe,
    report.routes.find((r) => r.key === 'compose')?.probe
  ) || {};

  const composeProbe = report.routes.find((r) => r.key === 'compose')?.probe || {};
  const msgProbe = report.routes.find((r) => r.key === 'messages')?.probe || {};

  report.guide.post = [
    "Navigate to https://x.com/home or https://x.com/compose/post.",
    "Focus composer selector: [data-testid='tweetTextarea_0'] (fallback div[role='textbox'][aria-label*='Post text']).",
    "Type content with browser_fill_form (human-like typing).",
    "Click [data-testid='tweetButtonInline'] (or [data-testid='tweetButton']).",
    "Verify posted by checking new tweet card appears in home timeline/profile."
  ];

  report.guide.comment = [
    "Open target post URL.",
    "Click reply control: [data-testid='reply'].",
    "Fill reply composer [data-testid='tweetTextarea_0'].",
    "Submit via [data-testid='tweetButtonInline'] in reply modal/pane.",
    "Verify reply appears under conversation thread."
  ];

  report.guide.like = [
    "On a tweet card use [data-testid='like'] to like.",
    "Use [data-testid='unlike'] to undo like."
  ];

  report.guide.repost = [
    "On a tweet card click [data-testid='retweet'].",
    "Choose repost/undo from popup; state shows [data-testid='unretweet'] when active."
  ];

  report.guide.bookmark = [
    "Click [data-testid='bookmark'] to save.",
    "Use [data-testid='removeBookmark'] to unsave."
  ];

  report.guide.dm = [
    "Go to https://x.com/messages.",
    "Start new DM with [data-testid='DM_New_Direct_Message_Button'] or /messages/compose.",
    "Find recipient via input[data-testid='searchPeople'].",
    "Type into [data-testid='dmComposerTextInput'] (fallback contenteditable textbox).",
    "Send with [data-testid='dmComposerSendButton']."
  ];

  report.summary = {
    homeSelectors: homeProbe?.selectors || null,
    composeSelectors: composeProbe?.selectors || null,
    messageSelectors: msgProbe?.selectors || null
  };

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    routesChecked: report.routes.length,
    errors: report.errors.length,
    home: report.summary.homeSelectors,
    compose: report.summary.composeSelectors,
    messages: report.summary.messageSelectors
  }, null, 2));
} catch (err) {
  report.errors.push({ step: 'fatal', error: String(err?.message || err) });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
