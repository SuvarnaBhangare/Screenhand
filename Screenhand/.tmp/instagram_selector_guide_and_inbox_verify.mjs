import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_selector_guide_and_inbox_verify_report.json';
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client(
  { name: 'ig-selector-guide-inbox-verify', version: '1.0.0' },
  { capabilities: {} }
);

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '')
  .split('\n')
  .map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  })
  .filter(Boolean);

const report = {
  startedAt: new Date().toISOString(),
  selectorGuide: {
    navigation: {
      home: "a[href='/']",
      reels: "a[href='/reels/']",
      messages: "a[href='/direct/inbox/']",
      explore: "a[href='/explore/']",
      notifications: "a[href='/notifications/'], a[href='/accounts/activity/']",
      create: "svg[aria-label='New post'] (click parent)"
    },
    inbox: {
      searchInput: "input[name='searchInput'], input[placeholder*='Search']",
      newMessage: "a[href='/direct/new/'], [aria-label='New message'], button[aria-label='New message']",
      threadLinks: "a[href*='/direct/t/']",
      composer: "div[contenteditable='true'][role='textbox'][aria-label*='Message'], div[contenteditable='true'][role='textbox'], textarea[placeholder*='Message']",
      sendButton: "button,[role='button'] (text=/^Send$/i)",
      expandFromMiniChat: "button,[role='button'] (text=/^Expand$/i)"
    },
    profileDM: {
      profileMessageButton: "main header button,[role='button'] (text=/^Message$/i)",
      openThreadAfterMessage: "URL starts with /direct/t/"
    }
  },
  run: {
    stealthInjected: false,
    inboxUrl: null,
    selectorPresence: null,
    threadSummary: null,
    dmVerification: {
      checkedThreads: 0,
      codexHits: []
    }
  },
  errors: []
};

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

async function getInstagramTabId() {
  const tabsRes = await call('browser_tabs', {});
  if (!tabsRes.ok) return { ok: false, error: tabsRes.error };
  const tabs = parseTabs(tabsRes.text);
  let ig = tabs.find((x) => /instagram\.com/i.test(x.url));
  if (!ig) {
    const open = await call('browser_open', { url: 'https://www.instagram.com/' });
    if (!open.ok) return { ok: false, error: open.error };
    const m = open.text.match(/Opened:\s*([A-F0-9]+)\s+—/i);
    if (m) return { ok: true, tabId: m[1] };
    const tabs2 = parseTabs((await call('browser_tabs', {})).text || '');
    ig = tabs2.find((x) => /instagram\.com/i.test(x.url));
  }
  if (!ig) return { ok: false, error: 'No Instagram tab found' };
  return { ok: true, tabId: ig.id };
}

try {
  await client.connect(transport);

  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tabRes = await getInstagramTabId();
  if (!tabRes.ok) throw new Error(tabRes.error);
  const tabId = tabRes.tabId;

  // Required by user: stealth first
  const stealth = await call('browser_stealth', { tabId });
  report.run.stealthInjected = stealth.ok;
  report.run.stealthText = stealth.ok ? stealth.text : stealth.error;

  await call('browser_navigate', { tabId, url: 'https://www.instagram.com/direct/inbox/' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 });

  const inboxState = await js(tabId, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const has = (sel) => !!document.querySelector(sel);
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const threadLinks = all('a[href*="/direct/t/"]').map((a) => a.href || a.getAttribute('href') || '').filter(Boolean);
    const threadItems = all('a[href*="/direct/t/"]').slice(0, 25).map((a) => {
      const txt = clean(a.innerText || a.textContent || '');
      return { href: a.href || a.getAttribute('href') || '', preview: txt.slice(0, 180) };
    });
    const body = clean(document.body?.innerText || '');
    return {
      url: location.href,
      title: document.title,
      selectors: {
        nav_home: has("a[href='/']"),
        nav_reels: has("a[href='/reels/']"),
        nav_messages: has("a[href='/direct/inbox/']"),
        nav_explore: has("a[href='/explore/']"),
        dm_search_input: has("input[name='searchInput'], input[placeholder*='Search']"),
        dm_new_message: has("a[href='/direct/new/'], [aria-label='New message'], button[aria-label='New message']"),
        dm_composer: has("div[contenteditable='true'][role='textbox'][aria-label*='Message'], div[contenteditable='true'][role='textbox'], textarea[placeholder*='Message']"),
        dm_send_button: all('button,[role=\"button\"]').some((el) => /^send$/i.test(clean(el.textContent) || clean(el.getAttribute('aria-label')) || '')),
      },
      threadCount: threadLinks.length,
      threadItems,
      hasRateLimitText: /please wait a few minutes|try again later|temporarily blocked/i.test(body)
    };
  })()`);

  if (inboxState.ok && inboxState.data) {
    report.run.inboxUrl = inboxState.data.url;
    report.run.selectorPresence = inboxState.data.selectors;
    report.run.threadSummary = {
      threadCount: inboxState.data.threadCount,
      threadItems: inboxState.data.threadItems
    };
    if (inboxState.data.hasRateLimitText) {
      report.run.rateLimitSignal = true;
    }
  }

  const threadLinks = (inboxState.data?.threadItems || [])
    .map((x) => x.href)
    .filter(Boolean)
    .slice(0, 12);

  for (const url of threadLinks) {
    await call('browser_navigate', { tabId, url });
    await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 25000 });

    const v = await js(tabId, `(() => {
      const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      const lower = text.toLowerCase();
      const hasCodex = lower.includes('codex');
      const hasScreenhand = lower.includes('screenhand');
      let snippet = null;
      const i = Math.max(lower.indexOf('codex'), lower.indexOf('screenhand'));
      if (i >= 0) snippet = text.slice(Math.max(0, i - 80), i + 240);
      return {
        url: location.href,
        hasCodex,
        hasScreenhand,
        snippet
      };
    })()`);

    report.run.dmVerification.checkedThreads += 1;
    if (v.ok && v.data && (v.data.hasCodex || v.data.hasScreenhand)) {
      report.run.dmVerification.codexHits.push(v.data);
    }
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    stealthInjected: report.run.stealthInjected,
    inboxUrl: report.run.inboxUrl,
    checkedThreads: report.run.dmVerification.checkedThreads,
    codexHits: report.run.dmVerification.codexHits.length
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
