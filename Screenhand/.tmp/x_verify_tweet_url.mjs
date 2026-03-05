import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029617823178424794';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-verify-tweet-url', version: '1.0.0' }, { capabilities: {} });
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
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: tab.id, url: URL });
  await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 20000 });

  const post = j(await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const lines = txt.split(' ').slice(0, 220).join(' ');
      return { url: location.href, title: document.title, snippet: lines };
    })()`
  }));

  console.log(JSON.stringify({ ok: true, post }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
