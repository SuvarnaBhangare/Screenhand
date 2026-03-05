import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const id = process.argv[2];
const url = `https://x.com/screenhand_/status/${id}`;

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-probe-first-caret', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  }).filter(Boolean);
}

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return t(res);
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: tab.id, url });
  await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 40', timeoutMs: 30000 });

  const out = j(await call('browser_js', {
    tabId: tab.id,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const carets = Array.from(document.querySelectorAll('[data-testid="caret"], button[aria-label="More"]'));
      const beforeCount = carets.length;
      if (carets[0]) carets[0].click();
      const start = Date.now();
      function scan() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - start < 2000) return setTimeout(scan, 120);
          return resolve({ ok:false, beforeCount, reason:'menu-not-open', url: location.href, snippet: clean(document.body?.innerText || '').slice(0, 300) });
        }
        const options = Array.from(new Set(Array.from(menu.querySelectorAll('*')).map((n)=>clean(n.textContent||'')).filter(Boolean))).slice(0,30);
        const hasEdit = options.some((x)=>/^edit$/i.test(x) || /edit post/i.test(x));
        const hasDelete = options.some((x)=>/^delete$/i.test(x) || /delete/i.test(x));
        resolve({ ok:true, beforeCount, hasEdit, hasDelete, options, url: location.href });
      }
      scan();
    }))()`
  }));

  console.log(JSON.stringify({ ok: true, id, out }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, id, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
