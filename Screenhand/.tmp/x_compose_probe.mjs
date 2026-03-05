import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_compose_probe_report.json';
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-compose-probe', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, arguments_ = {}) {
  const r = await client.callTool({ name, arguments: arguments_ });
  return t(r);
}

async function js(tabId, code) {
  return j(await call('browser_js', { tabId, code }));
}

const report = { startedAt: new Date().toISOString() };

try {
  await client.connect(transport);
  await call('focus', { app: 'Google Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');

  const tabId = xTab.id;
  await call('browser_navigate', { tabId, url: 'https://x.com/home' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 20000 });

  report.before = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    return {
      url: location.href,
      title: document.title,
      postButtons: Array.from(document.querySelectorAll('button,[role="button"],a')).map(el=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).filter(x=>/^post$/i.test(x)||/^tweet$/i.test(x)).slice(0,20)
    };
  })()`);

  report.openCompose = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const btn = Array.from(document.querySelectorAll('button,[role="button"],a')).find(el => /^post$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||'') || /^tweet$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
    if (!btn) return { ok:false, reason:'post-button-not-found' };
    btn.click();
    return { ok:true };
  })()`);

  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 12000 });

  report.after = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const exists=(sel)=>!!document.querySelector(sel);
    return {
      url: location.href,
      title: document.title,
      selectors: {
        composer_data_testid: exists('[data-testid="tweetTextarea_0"]'),
        composer_textbox_role: exists('div[role="textbox"][contenteditable="true"]'),
        post_button_inline: exists('[data-testid="tweetButtonInline"]'),
        post_button_generic: exists('[data-testid="tweetButton"]'),
        media_button: exists('[data-testid="fileInput"]') || exists('input[type="file"]'),
        close_compose: exists('[aria-label="Close"]')
      },
      replyButtons: document.querySelectorAll('[data-testid="reply"]').length,
      likeButtons: document.querySelectorAll('[data-testid="like"]').length,
      repostButtons: document.querySelectorAll('[data-testid="retweet"]').length,
      bookmarkButtons: document.querySelectorAll('[data-testid="bookmark"]').length,
      snippet: clean(document.body?.innerText || '').slice(0, 1200)
    };
  })()`);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, openCompose: report.openCompose, after: report.after }, null, 2));
} catch (err) {
  report.error = String(err?.message || err);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: report.error }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
