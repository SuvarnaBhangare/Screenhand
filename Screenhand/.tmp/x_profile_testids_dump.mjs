import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-profile-testids-dump', version: '1.0.0' }, { capabilities: {} });

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

try {
  await client.connect(transport);
  await call('focus', { app: 'Google Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');
  const tabId = tab.id;

  await call('browser_navigate', { tabId, url: 'https://x.com/screenhand_' });
  await call('browser_wait', { tabId, condition: 'document.body', timeoutMs: 20000 });

  const out = j(await call('browser_js', { tabId, code: `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const all = Array.from(document.querySelectorAll('[data-testid]')).map((el)=>({
      testid: el.getAttribute('data-testid'),
      tag: el.tagName.toLowerCase(),
      text: clean(el.textContent).slice(0,120),
      aria: el.getAttribute('aria-label') || null
    }));
    const uniq = [];
    const seen = new Set();
    for (const x of all) { if (seen.has(x.testid)) continue; seen.add(x.testid); uniq.push(x); }
    const filtered = uniq.filter((x)=>/profile|edit|follow|user|avatar|header|primary|cell/i.test(x.testid||'') || /edit profile|follow/i.test((x.text||'')+' '+(x.aria||'')));
    return {
      url: location.href,
      title: document.title,
      filtered,
      testids: uniq.map((x)=>x.testid).slice(0,500)
    };
  })()` }));

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
