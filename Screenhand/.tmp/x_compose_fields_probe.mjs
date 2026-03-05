import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-compose-fields-probe', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);
async function call(name, args = {}) { const r = await client.callTool({ name, arguments: args }); return t(r); }

try {
  await client.connect(transport);
  await call('focus', { app: 'Google Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/home' });
  await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 25000 });

  const out = j(await call('browser_js', { tabId: tab.id, code: `(() => {
    const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const pick = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      role: el.getAttribute('role') || null,
      testid: el.getAttribute('data-testid') || null,
      aria: el.getAttribute('aria-label') || null,
      placeholder: el.getAttribute('placeholder') || null,
      contenteditable: el.getAttribute('contenteditable') || null,
      className: (el.className || '').toString().slice(0, 140),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    });

    const fields = [
      ...Array.from(document.querySelectorAll('div[role="textbox"], [contenteditable="true"], textarea, input[type="text"]'))
    ].filter(vis).slice(0, 50).map(pick);

    const postBtns = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .filter(vis)
      .map((el) => ({
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        aria: (el.getAttribute('aria-label') || '').slice(0, 80),
        testid: el.getAttribute('data-testid') || null,
        tag: el.tagName.toLowerCase()
      }))
      .filter((x) => /post|tweet/i.test(x.text) || /post|tweet/i.test(x.aria))
      .slice(0, 20);

    return {
      url: location.href,
      title: document.title,
      fields,
      postBtns,
      snippet: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1400)
    };
  })()` }));

  console.log(JSON.stringify({ ok: true, out }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
