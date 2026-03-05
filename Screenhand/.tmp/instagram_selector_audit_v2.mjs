import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_selector_audit_v2.json';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'instagram-selector-audit-v2', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l) => { const m = l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m ? { id: m[1], title: m[2], url: m[3] } : null; }).filter(Boolean);

async function evalJS(tabId, code) {
  const raw = text(await client.callTool({ name: 'browser_js', arguments: { tabId, code } }));
  const parsed = parse(raw);
  return parsed ?? { raw };
}

const routes = [
  { key: 'home', url: 'https://www.instagram.com/' },
  { key: 'reels', url: 'https://www.instagram.com/reels/' },
  { key: 'messages', url: 'https://www.instagram.com/direct/inbox/' },
  { key: 'edit_profile', url: 'https://www.instagram.com/accounts/edit/' },
  { key: 'notifications', url: 'https://www.instagram.com/notifications/' },
];

const selectorAuditCode = `(() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const safeQ = (s) => { try { return document.querySelector(s); } catch { return null; } };
  const safeQA = (s) => { try { return Array.from(document.querySelectorAll(s)); } catch { return []; } };
  const firstByText = (sel, regex) => {
    const re = new RegExp(regex, 'i');
    return safeQA(sel).find((el) => re.test(clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'))));
  };
  const present = (s) => !!safeQ(s);
  const count = (s) => safeQA(s).length;

  const candidates = {
    nav_home: 'a[href="/"]',
    nav_reels: 'a[href="/reels/"]',
    nav_messages: 'a[href="/direct/inbox/"]',
    nav_explore: 'a[href="/explore/"]',
    nav_notifications: 'a[href="/notifications/"], a[href="/accounts/activity/"]',
    nav_create: 'a[href="/create/"]',
    dm_search: 'input[name="searchInput"], input[placeholder="Search"], input[aria-label="Search input"]',
    dm_new_message: 'a[href="/direct/new/"], [aria-label="New message"], button[aria-label="New message"]',
    settings_website: 'input[placeholder="Website"]',
    settings_bio: 'textarea#pepBio, textarea[placeholder="Bio"]',
    settings_submit: 'button[type="submit"], button',
    action_like: 'svg[aria-label="Like"], [aria-label="Like"]',
    action_comment: 'svg[aria-label="Comment"], [aria-label="Comment"]',
    action_share: 'svg[aria-label="Share"], [aria-label="Share"], [aria-label="Send"]',
    action_save: 'svg[aria-label="Save"], [aria-label="Save"]',
    comment_input: 'textarea[aria-label="Add a comment…"], textarea[placeholder*="comment"], form textarea',
    post_input_file: 'input[type="file"]',
  };

  const out = {};
  for (const [k, sel] of Object.entries(candidates)) {
    out[k] = { selector: sel, present: present(sel), count: count(sel) };
  }

  const followByAria = safeQ('[aria-label="Follow"], button[aria-label*="Follow"]');
  const followByText = firstByText('button,[role="button"]', '^follow$');
  out.action_follow = {
    selector: followByAria ? '[aria-label="Follow"], button[aria-label*="Follow"]' : 'button,[role="button"] (text=/^Follow$/i)',
    present: !!(followByAria || followByText),
    count: followByAria ? safeQA('[aria-label="Follow"], button[aria-label*="Follow"]').length : safeQA('button,[role="button"]').filter((el) => /^follow$/i.test(clean(el.textContent) || '')).length,
  };

  const submitBtn = safeQA('button').find((b) => /^submit$/i.test(clean(b.textContent)));
  out.settings_submit_exact = {
    selector: submitBtn ? 'button (text=/^Submit$/i)' : 'button[type="submit"]',
    present: !!submitBtn || present('button[type="submit"]'),
    count: submitBtn ? 1 : count('button[type="submit"]'),
  };

  const createEntryByText = firstByText('a,button,[role="button"]', 'new post|create');
  out.create_entry_text = {
    selector: createEntryByText ? 'a,button,[role="button"] (text=/new post|create/i)' : 'a[href="/create/"]',
    present: !!createEntryByText || present('a[href="/create/"]'),
    count: createEntryByText ? 1 : count('a[href="/create/"]'),
  };

  out.meta = {
    title: document.title,
    url: location.href,
    pathname: location.pathname,
    language: document.documentElement.lang || null,
  };

  return out;
})()`;

const data = {
  generatedAt: new Date().toISOString(),
  routes: [],
};

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name: 'browser_tabs', arguments: {} })));
  const ig = tabs.find((t) => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  const tabId = ig.id;

  await client.callTool({ name: 'browser_stealth', arguments: { tabId } });

  for (const r of routes) {
    const row = { key: r.key, target: r.url };
    row.navigate = text(await client.callTool({ name: 'browser_navigate', arguments: { tabId, url: r.url } }));
    row.wait = text(await client.callTool({ name: 'browser_wait', arguments: { tabId, condition: 'document.readyState === "complete" || document.readyState === "interactive"', timeoutMs: 12000 } }));
    row.audit = await evalJS(tabId, selectorAuditCode);
    data.routes.push(row);
  }

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`Saved: ${OUT}`);
  console.log(`Routes audited: ${data.routes.length}`);
} catch (e) {
  console.error('AUDIT_FAILED:', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
