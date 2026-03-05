import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/screenhand_google_bing_index_submit_report.json';
const SITE = 'https://screenhand.com';
const SITEMAP = `${SITE}/sitemap.xml`;

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});

const client = new Client(
  { name: 'screenhand-google-bing-index-submit', version: '1.0.0' },
  { capabilities: {} }
);

const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};
const parseTabs = (t) => (t || '')
  .split('\n')
  .map((l) => {
    const m = l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  })
  .filter(Boolean);

const report = {
  startedAt: new Date().toISOString(),
  site: SITE,
  sitemap: SITEMAP,
  liveChecks: {},
  google: {},
  bing: {},
  errors: []
};

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: text(res), raw: res };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function js(code, args = {}) {
  const res = await call('browser_js', { ...args, code });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, text: res.text, data: parse(res.text) ?? null };
}

async function goto(url) {
  const nav = await call('browser_navigate', { url });
  const wait = await call('browser_wait', {
    condition: 'document.readyState === "complete"',
    timeoutMs: 30000
  });
  return { nav, wait };
}

try {
  await client.connect(transport);

  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });
  await call('browser_stealth', {});

  // 1) Quick browser/live check pages
  report.liveChecks.home = await goto(SITE);
  report.liveChecks.robots = await goto(`${SITE}/robots.txt`);
  report.liveChecks.robotsState = await js(`(() => ({
    url: location.href,
    title: document.title,
    bodySample: (document.body?.innerText || '').slice(0, 500),
    is404Like: /404|not found/i.test(document.title + ' ' + (document.body?.innerText || ''))
  }))()`);

  report.liveChecks.sitemap = await goto(SITEMAP);
  report.liveChecks.sitemapState = await js(`(() => ({
    url: location.href,
    title: document.title,
    bodySample: (document.body?.innerText || '').slice(0, 500),
    isXmlLike: /urlset|sitemap/i.test(document.documentElement?.outerHTML || '')
  }))()`);

  // 2) Google Search Console: try opening site-specific sitemap page and submit
  report.google.open = await goto('https://search.google.com/search-console/sitemaps?resource_id=sc-domain:screenhand.com');
  report.google.stateBefore = await js(`(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const body = clean(document.body?.innerText || '');
    const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
      type: el.type || null,
      name: el.name || null,
      id: el.id || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null
    })).slice(0, 20);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
      .map((el) => clean(el.textContent) || clean(el.getAttribute('aria-label')) || '')
      .filter(Boolean).slice(0, 30);
    return {
      url: location.href,
      title: document.title,
      needsLogin: /sign in|log in|choose an account/i.test(body),
      hasPropertyError: /property|verify|ownership|permission|access/i.test(body),
      inputs,
      buttons
    };
  })()`);

  report.google.submitAttempt = await js(`(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const candidates = [
      'input[type="text"]',
      'input[type="url"]',
      'input[placeholder*="sitemap" i]',
      'input[aria-label*="sitemap" i]'
    ];
    let input = null;
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && !el.disabled) { input = el; break; }
    }
    if (!input) return { ok: false, reason: 'sitemap-input-not-found' };

    const val = ${JSON.stringify(SITEMAP)};
    input.focus();
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
    const submit = btns.find((b) => /submit|add|send/i.test(clean(b.textContent) || clean(b.getAttribute('aria-label')) || ''));
    if (!submit) return { ok: false, reason: 'submit-button-not-found', filled: true, value: input.value };

    submit.click();
    return { ok: true, clicked: true, value: input.value, buttonText: clean(submit.textContent) || clean(submit.getAttribute('aria-label')) };
  })()`);

  report.google.stateAfter = await js(`(() => {
    const body = (document.body?.innerText || '').slice(0, 1800);
    return {
      url: location.href,
      title: document.title,
      bodySample: body,
      successHint: /submitted|success|received|added/i.test(body)
    };
  })()`);

  // 3) Bing Webmaster: open sitemap page and submit
  report.bing.open = await goto('https://www.bing.com/webmasters/sitemaps?siteUrl=https%3A%2F%2Fscreenhand.com');
  report.bing.stateBefore = await js(`(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const body = clean(document.body?.innerText || '');
    const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
      type: el.type || null,
      name: el.name || null,
      id: el.id || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null
    })).slice(0, 25);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
      .map((el) => clean(el.textContent) || clean(el.getAttribute('aria-label')) || '')
      .filter(Boolean).slice(0, 40);
    return {
      url: location.href,
      title: document.title,
      needsLogin: /sign in|log in|microsoft account/i.test(body),
      hasPropertyError: /add a site|verify|ownership|permission|access/i.test(body),
      inputs,
      buttons
    };
  })()`);

  report.bing.submitAttempt = await js(`(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const candidates = [
      'input[type="url"]',
      'input[type="text"]',
      'input[placeholder*="sitemap" i]',
      'input[aria-label*="sitemap" i]',
      'input[name*="sitemap" i]'
    ];
    let input = null;
    for (const sel of candidates) {
      const all = Array.from(document.querySelectorAll(sel));
      const pick = all.find((el) => !el.disabled && el.offsetParent !== null);
      if (pick) { input = pick; break; }
    }
    if (!input) return { ok: false, reason: 'sitemap-input-not-found' };

    const val = ${JSON.stringify(SITEMAP)};
    input.focus();
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
    const submit = btns.find((b) => /submit|add|send/i.test(clean(b.textContent) || clean(b.getAttribute('aria-label')) || ''));
    if (!submit) return { ok: false, reason: 'submit-button-not-found', filled: true, value: input.value };

    submit.click();
    return { ok: true, clicked: true, value: input.value, buttonText: clean(submit.textContent) || clean(submit.getAttribute('aria-label')) };
  })()`);

  report.bing.stateAfter = await js(`(() => {
    const body = (document.body?.innerText || '').slice(0, 1800);
    return {
      url: location.href,
      title: document.title,
      bodySample: body,
      successHint: /submitted|success|received|added/i.test(body)
    };
  })()`);

  // 4) Snapshot browser tabs for user visibility
  const tabs = await call('browser_tabs', {});
  report.browserTabs = tabs.ok ? parseTabs(tabs.text) : { error: tabs.error };

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) {
  report.errors.push(String(e?.message || e));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
