import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_codex_outreach_100_report.json';
const OWN_HANDLE = 'screenhand_';
const TARGET_REACH = Number(process.env.TARGET_REACH || 100);
const MAX_SCROLLS = Number(process.env.MAX_SCROLLS || 240);
const MAX_CANDIDATES_TO_REVIEW = Number(process.env.MAX_CANDIDATES_TO_REVIEW || 260);
const MAX_DM_ATTEMPTS = Number(process.env.MAX_DM_ATTEMPTS || 140);

const KEYWORDS = [
  'ai', 'artificial intelligence', 'automation', 'agent', 'mcp',
  'developer', 'dev', 'saas', 'startup', 'founder', 'tech',
  'product', 'growth', 'buildinpublic', 'coding', 'software'
];

const MESSAGE_TEMPLATE = (username) => [
  `Hey @${username}, I'm Codex helping @screenhand_ with Instagram outreach using the ScreenHand automation tool.`,
  'We are building ScreenHand: AI agents that can see, click, type and automate desktop workflows via MCP.',
  'Your profile looks relevant to AI/automation. Open to a quick feedback exchange or collaboration?'
].join('\n\n');

const COMMENT_TEMPLATES = [
  'Codex here from @screenhand_ using ScreenHand automation workflows. Great post.',
  "I'm Codex, testing ScreenHand outreach automation. Solid content here.",
  'Codex + ScreenHand checking in. Love this AI/automation post.'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'ig-codex-outreach-100', version: '1.0.0' }, { capabilities: {} });

const report = {
  startedAt: new Date().toISOString(),
  targetReach: TARGET_REACH,
  harvestedCandidates: [],
  scoredTargets: [],
  actions: {
    scrolled: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    dmAttempts: 0,
    dmsSent: 0
  },
  dmLogs: [],
  commentLogs: [],
  blockers: [],
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
    const txt = t(res);
    return { ok: true, text: txt, raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function js(tabId, code) {
  const r = await call('browser_js', { tabId, code });
  if (!r.ok) return { ok: false, error: r.error };
  const data = j(r.text);
  if (!data && /^JS Error:/.test(r.text || '')) return { ok: false, error: r.text };
  return { ok: true, text: r.text, data };
}

async function goto(tabId, url, timeoutMs = 25000) {
  const nav = await call('browser_navigate', { tabId, url });
  const wait = await call('browser_wait', {
    tabId,
    condition: 'document.readyState === "complete" || document.readyState === "interactive"',
    timeoutMs
  });
  return { nav, wait };
}

async function getInstagramTab() {
  const tabsRes = await call('browser_tabs', {});
  if (!tabsRes.ok) return { ok: false, error: tabsRes.error };
  const tabs = parseTabs(tabsRes.text);
  let ig = tabs.find((x) => /instagram\.com/i.test(x.url));
  if (!ig) {
    const openRes = await call('browser_open', { url: 'https://www.instagram.com/' });
    if (!openRes.ok) return { ok: false, error: openRes.error };
    const m = openRes.text.match(/Opened:\s*([A-F0-9]+)\s+—/i);
    if (m) return { ok: true, tabId: m[1] };
    const tabsRes2 = await call('browser_tabs', {});
    const tabs2 = parseTabs(tabsRes2.text);
    ig = tabs2.find((x) => /instagram\.com/i.test(x.url));
  }
  if (!ig) return { ok: false, error: 'No Instagram tab found/opened' };
  return { ok: true, tabId: ig.id };
}

async function collectCandidates(tabId) {
  const candidates = new Set();
  const staticRoutes = new Set([
    'accounts', 'about', 'api', 'blog', 'challenge', 'developer', 'direct',
    'explore', 'legal', 'locations', 'p', 'reels', 'stories', 'tv'
  ]);

  for (let i = 0; i < MAX_SCROLLS; i += 1) {
    const res = await js(tabId, `(() => {
      const bad = new Set(${JSON.stringify(Array.from(staticRoutes))});
      const isUser = (h) => {
        if (!h || !h.startsWith('/')) return null;
        const clean = h.split('?')[0].split('#')[0];
        const parts = clean.split('/').filter(Boolean);
        if (parts.length !== 1) return null;
        const u = parts[0];
        if (!/^[a-z0-9._]+$/i.test(u)) return null;
        if (bad.has(u.toLowerCase())) return null;
        return u;
      };
      const users = [];
      for (const a of Array.from(document.querySelectorAll('article a[href^="/"], main a[href^="/"]'))) {
        const u = isUser(a.getAttribute('href') || '');
        if (u) users.push(u);
      }
      return Array.from(new Set(users));
    })()`);

    if (res.ok && Array.isArray(res.data)) {
      for (const u of res.data) {
        if (u && u.toLowerCase() !== OWN_HANDLE.toLowerCase()) candidates.add(u);
      }
    }

    if (i % 8 === 0) {
      const like = await js(tabId, `(() => {
        const like = document.querySelector('svg[aria-label="Like"], [aria-label="Like"]');
        if (!like) return { acted: false };
        const btn = like.closest('button,[role="button"]') || like;
        btn.click();
        return { acted: true };
      })()`);
      if (like.ok && like.data?.acted) report.actions.likes += 1;
    }

    await js(tabId, `(() => { window.scrollBy({ top: ${rand(520, 980)}, left: 0, behavior: 'smooth' }); return true; })()`);
    report.actions.scrolled += 1;
    await sleep(rand(650, 1250));

    if (candidates.size >= MAX_CANDIDATES_TO_REVIEW) break;
  }

  return Array.from(candidates).slice(0, MAX_CANDIDATES_TO_REVIEW);
}

async function scoreProfile(tabId, username) {
  await goto(tabId, `https://www.instagram.com/${username}/`);
  await sleep(rand(800, 1300));

  const probe = await js(tabId, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const body = clean(document.body?.innerText || '');
    const header = document.querySelector('main header') || document.querySelector('header');
    const headerText = clean(header?.innerText || '');
    const hasMessage = Array.from(document.querySelectorAll('main header button, main header [role="button"], main section header button, main section header [role="button"]'))
      .some((el) => /^message$/i.test(clean(el.textContent) || clean(el.getAttribute('aria-label')) || ''));
    const isPrivate = /this account is private/i.test(body);
    return { body, headerText, hasMessage, isPrivate };
  })()`);

  if (!probe.ok || !probe.data) return { username, score: 0, hasMessage: false, isPrivate: false };

  const hay = `${probe.data.body || ''} ${probe.data.headerText || ''}`.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) {
    if (hay.includes(kw.toLowerCase())) score += 1;
  }
  return {
    username,
    score,
    hasMessage: !!probe.data.hasMessage,
    isPrivate: !!probe.data.isPrivate
  };
}

async function commentOnCurrentProfile(tabId, username) {
  const r = await js(tabId, `(() => {
    const firstPost = document.querySelector('a[href*="/p/"]');
    if (!firstPost) return { ok: false, reason: 'no-post' };
    firstPost.click();
    return { ok: true };
  })()`);
  if (!r.ok || !r.data?.ok) return { ok: false, reason: r.data?.reason || 'open-post-failed' };
  await sleep(rand(1200, 1700));

  const openComment = await js(tabId, `(() => {
    const icon = document.querySelector('svg[aria-label="Comment"], [aria-label="Comment"]');
    if (!icon) return { ok: false, reason: 'comment-icon-missing' };
    (icon.closest('button,[role="button"]') || icon).click();
    return { ok: true };
  })()`);
  if (!openComment.ok || !openComment.data?.ok) return { ok: false, reason: openComment.data?.reason || 'comment-open-failed' };
  await sleep(rand(700, 1100));

  const comment = COMMENT_TEMPLATES[report.actions.comments % COMMENT_TEMPLATES.length];
  const fill = await call('browser_fill_form', {
    tabId,
    selector: 'textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], textarea',
    text: comment,
    clear: false,
    delayMs: 28
  });

  if (!fill.ok || /Element not found|Input not found/i.test(fill.text || '')) {
    await js(tabId, `(() => {
      const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]');
      if (!box) return { ok: false };
      box.focus();
      return { ok: true };
    })()`);
    await call('browser_fill_form', {
      tabId,
      selector: 'div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]',
      text: comment,
      clear: false,
      delayMs: 28
    });
  }

  await js(tabId, `(() => {
    const clean = (s) => (s || '').trim();
    const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((el) => /^post$/i.test(clean(el.textContent) || clean(el.getAttribute('aria-label')) || ''));
    if (btn) { btn.click(); return { ok: true, mode: 'button' }; }
    const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], textarea');
    if (box) {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
      box.dispatchEvent(ev);
      return { ok: true, mode: 'enter' };
    }
    return { ok: false };
  })()`);
  report.actions.comments += 1;
  report.commentLogs.push({ username, comment, status: 'sent' });
  await sleep(rand(800, 1200));

  await js(tabId, `(() => {
    const close = document.querySelector('[aria-label="Close"], svg[aria-label="Close"]');
    if (close) (close.closest('button,[role="button"]') || close).click();
    return true;
  })()`);
  return { ok: true };
}

async function sendDm(tabId, username) {
  await goto(tabId, `https://www.instagram.com/${username}/`);
  await sleep(rand(1300, 2000));

  const clickMessage = await js(tabId, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const el = Array.from(document.querySelectorAll('main header button, main header [role="button"], main section header button, main section header [role="button"]'))
      .find((x) => /^message$/i.test(clean(x.textContent) || clean(x.getAttribute('aria-label')) || clean(x.getAttribute('title')) || ''));
    if (!el) return { ok: false, reason: 'message-button-missing' };
    el.click();
    return { ok: true };
  })()`);
  if (!clickMessage.ok || !clickMessage.data?.ok) {
    return { sent: false, reason: clickMessage.data?.reason || 'message-click-failed' };
  }
  await sleep(rand(1900, 2800));

  await js(tabId, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const ex = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .find((x) => /^expand$/i.test(clean(x.textContent) || clean(x.getAttribute('aria-label')) || clean(x.getAttribute('title')) || ''));
    if (ex) ex.click();
    const nn = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .find((x) => /^not now$/i.test(clean(x.textContent) || clean(x.getAttribute('aria-label')) || ''));
    if (nn) nn.click();
    return { expanded: !!ex };
  })()`);
  await sleep(rand(1300, 2000));

  const composerProbe = await js(tabId, `(() => {
    const sels = [
      'div[contenteditable="true"][role="textbox"][aria-label*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[role="textbox"][contenteditable="true"]',
      'textarea[placeholder*="Message"]',
      'textarea'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      return { ok: true, selector: s };
    }
    return { ok: false, reason: 'composer-missing' };
  })()`);

  if (!composerProbe.ok || !composerProbe.data?.ok) {
    return { sent: false, reason: composerProbe.data?.reason || 'composer-missing' };
  }

  const message = MESSAGE_TEMPLATE(username);
  const fill = await call('browser_fill_form', {
    tabId,
    selector: composerProbe.data.selector,
    text: message,
    clear: false,
    delayMs: 24
  });
  if (!fill.ok) return { sent: false, reason: 'fill-failed' };

  const send = await js(tabId, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const btn = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .find((x) => /^send$/i.test(clean(x.textContent) || clean(x.getAttribute('aria-label')) || ''));
    if (btn) { btn.click(); return { ok: true, mode: 'button' }; }
    const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], textarea');
    if (box) {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
      box.dispatchEvent(ev);
      return { ok: true, mode: 'enter' };
    }
    return { ok: false, reason: 'send-control-missing' };
  })()`);
  if (!send.ok || !send.data?.ok) return { sent: false, reason: send.data?.reason || 'send-failed' };
  await sleep(rand(900, 1400));

  const rate = await js(tabId, `(() => {
    const txt = (document.body?.innerText || '').toLowerCase();
    return {
      rateLimited: /please wait a few minutes|try again later|restricted|temporarily blocked/.test(txt)
    };
  })()`);
  if (rate.ok && rate.data?.rateLimited) return { sent: false, reason: 'rate-limited' };

  return { sent: true, message };
}

try {
  await client.connect(transport);
  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tab = await getInstagramTab();
  if (!tab.ok) throw new Error(tab.error);
  const tabId = tab.tabId;

  await call('browser_stealth', { tabId });
  await goto(tabId, 'https://www.instagram.com/');
  await sleep(1400);

  const candidates = await collectCandidates(tabId);
  report.harvestedCandidates = candidates;

  const scored = [];
  for (const username of candidates) {
    if (scored.length >= TARGET_REACH + 40) break;
    const s = await scoreProfile(tabId, username);
    if (s.hasMessage && !s.isPrivate && s.score > 0) scored.push(s);
    await sleep(rand(300, 700));
  }

  scored.sort((a, b) => b.score - a.score);
  const targets = scored.slice(0, Math.max(TARGET_REACH, 20));
  report.scoredTargets = targets;

  let attempts = 0;
  for (const target of targets) {
    if (report.actions.dmsSent >= TARGET_REACH) break;
    if (attempts >= MAX_DM_ATTEMPTS) break;
    attempts += 1;
    report.actions.dmAttempts += 1;

    if (report.actions.comments < 10 && attempts % 5 === 0) {
      try { await commentOnCurrentProfile(tabId, target.username); } catch {}
    }

    const dm = await sendDm(tabId, target.username);
    if (dm.sent) {
      report.actions.dmsSent += 1;
      report.dmLogs.push({ username: target.username, status: 'sent', score: target.score });
    } else {
      report.dmLogs.push({ username: target.username, status: 'skipped', reason: dm.reason, score: target.score });
      if (dm.reason === 'rate-limited') {
        report.blockers.push('rate-limited');
        break;
      }
    }
    await sleep(rand(900, 1600));
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    harvested: report.harvestedCandidates.length,
    qualified: report.scoredTargets.length,
    dmAttempts: report.actions.dmAttempts,
    dmsSent: report.actions.dmsSent,
    blockers: report.blockers
  }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
