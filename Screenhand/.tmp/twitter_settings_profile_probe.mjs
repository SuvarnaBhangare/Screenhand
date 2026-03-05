import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'twitter-settings-profile-probe', version: '1.0.0' }, { capabilities: {} });

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
  if (!tab) throw new Error('No X/Twitter tab');
  const tabId = tab.id;

  await call('browser_navigate', { tabId, url: 'https://twitter.com/settings/profile' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 });

  const out = j(await call('browser_js', { tabId, code: `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const body = clean(document.body?.innerText || '');
    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]')).map((el)=>({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null,
      dataTestid: el.getAttribute('data-testid') || null,
      visible: !!(el.offsetParent !== null)
    })).filter((f)=>f.visible).slice(0,120);
    return {
      url: location.href,
      title: document.title,
      bodyLen: body.length,
      bodySnippet: body.slice(0, 1500),
      loginGate: /sign in|log in|create account|join x/i.test(body),
      fieldCount: fields.length,
      fields
    };
  })()` }));

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
