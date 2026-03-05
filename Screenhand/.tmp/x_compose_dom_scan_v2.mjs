import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-compose-dom-scan-v2', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return t(res);
}

try {
  await client.connect(transport);
  const focus = await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/compose/post' });
  await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 30', timeoutMs: 20000 });

  const scan = j(await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const picks = (sel, n=60) => Array.from(document.querySelectorAll(sel)).filter(vis).slice(0,n).map((el)=>({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        dt: el.getAttribute('data-testid') || null,
        aria: el.getAttribute('aria-label') || null,
        placeholder: el.getAttribute('placeholder') || null,
        ce: el.getAttribute('contenteditable') || null,
        id: el.id || null,
        cls: (el.className || '').toString().slice(0, 120),
        text: clean(el.textContent).slice(0, 90)
      }));

      const allButtons = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(vis).map((el)=>({
        tag: el.tagName.toLowerCase(),
        dt: el.getAttribute('data-testid') || null,
        aria: clean(el.getAttribute('aria-label') || ''),
        text: clean(el.textContent || ''),
        disabled: !!el.disabled,
        ariaDisabled: el.getAttribute('aria-disabled') || null
      }));

      return {
        url: location.href,
        title: document.title,
        textboxes: picks('div[role="textbox"], [contenteditable="true"], textarea, input[type="text"]'),
        postButtons: allButtons.filter((b) => /post|tweet/i.test((b.text||'') + ' ' + (b.aria||''))).slice(0, 30),
        bodySnippet: clean(document.body?.innerText || '').slice(0, 1200)
      };
    })()`
  }));

  console.log(JSON.stringify({ ok: true, focus, tab, scan }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
