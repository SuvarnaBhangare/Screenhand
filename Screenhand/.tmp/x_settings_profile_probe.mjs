import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_settings_profile_probe_report.json';
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-settings-profile-probe', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, arguments_ = {}) {
  const res = await client.callTool({ name, arguments: arguments_ });
  return t(res);
}

async function js(tabId, code) {
  return j(await call('browser_js', { tabId, code }));
}

const report = { startedAt: new Date().toISOString() };

try {
  await client.connect(transport);
  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab found');
  const tabId = tab.id;
  report.tab = tab;

  await call('browser_stealth', { tabId });
  await call('browser_navigate', { tabId, url: 'https://x.com/settings/profile' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 25000 });

  report.state = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const visible = (el) => !!(el && el.offsetParent !== null);
    const body = clean(document.body?.innerText || '');
    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]'))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        aria: el.getAttribute('aria-label') || null,
        dataTestid: el.getAttribute('data-testid') || null,
        visible: visible(el),
        value: (el.tagName.toLowerCase() === 'div' ? clean(el.textContent) : (el.value || '')).slice(0, 180)
      }))
      .filter((f) => f.visible)
      .slice(0, 80);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .map((el) => ({
        text: clean(el.textContent)||clean(el.getAttribute('aria-label'))||null,
        dataTestid: el.getAttribute('data-testid') || null
      }))
      .filter((b)=>b.text)
      .slice(0, 120);
    return {
      url: location.href,
      title: document.title,
      loginGate: /sign in|log in|create account|join x/i.test(body),
      bodySnippet: body.slice(0, 1200),
      fields,
      buttons
    };
  })()`);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, url: report.state?.url, fieldCount: report.state?.fields?.length || 0, loginGate: report.state?.loginGate }, null, 2));
} catch (err) {
  report.error = String(err?.message || err);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: report.error }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
