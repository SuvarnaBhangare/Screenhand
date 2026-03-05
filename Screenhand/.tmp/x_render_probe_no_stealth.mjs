import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-render-probe-no-stealth', version: '1.0.0' }, { capabilities: {} });

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

  await call('browser_navigate', { tabId, url: 'https://x.com/home' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 25000 });

  const state = j(await call('browser_js', { tabId, code: `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const body = clean(document.body?.innerText || '');
    return {
      url: location.href,
      title: document.title,
      bodyLen: body.length,
      bodySnippet: body.slice(0, 2000),
      tweetCount: document.querySelectorAll('article [data-testid="tweet"]').length,
      composer: !!document.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'),
      replyButtons: document.querySelectorAll('[data-testid="reply"]').length,
      likeButtons: document.querySelectorAll('[data-testid="like"]').length
    };
  })()` }));

  console.log(JSON.stringify(state, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
