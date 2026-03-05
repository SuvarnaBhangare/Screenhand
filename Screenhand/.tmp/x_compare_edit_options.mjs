import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const IDS = ['2029617823178424794', '2029620157203763699'];
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-compare-edit-options', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function probe(tabId, tweetId) {
  const url = `https://x.com/screenhand_/status/${tweetId}`;
  await call('browser_navigate', { tabId, url });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 });
  await sleep(550);

  const out = j(await call('browser_js', {
    tabId,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const link = document.querySelector('a[href*="/status/${tweetId}"]');
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return { ok:false, reason:'no-article', url: location.href };
      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return { ok:false, reason:'no-caret', url: location.href };
      caret.click();

      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { ok:false, reason:'menu-not-open', url: location.href };
      const nodes = Array.from(menu.querySelectorAll('*'));
      const options = Array.from(new Set(nodes.map((n) => clean(n.textContent || '')).filter(Boolean))).slice(0, 40);
      const hasEdit = options.some((x) => /^edit$/i.test(x) || /^edit post$/i.test(x) || /edit post/i.test(x));
      return { ok:true, url: location.href, options, hasEdit };
    })()`
  }));

  return { tweetId, url, ...out };
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  const results = [];
  for (const id of IDS) results.push(await probe(tab.id, id));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
