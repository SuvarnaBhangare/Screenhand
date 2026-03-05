import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029620157203763699';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-edit-probe-controls', version: '1.0.0' }, { capabilities: {} });
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

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  await call('browser_navigate', { tabId: tab.id, url: URL });
  await sleep(1400);

  const scan = j(await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

      const buttons = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(vis).map((el) => ({
        tag: el.tagName.toLowerCase(),
        dt: el.getAttribute('data-testid') || null,
        aria: clean(el.getAttribute('aria-label') || ''),
        text: clean(el.textContent || ''),
        role: el.getAttribute('role') || null,
        href: el.getAttribute('href') || null
      }));

      const interesting = buttons.filter((b) => {
        const bag = String((b.dt || '') + ' ' + (b.aria || '') + ' ' + (b.text || '')).toLowerCase();
        return bag.includes('caret') || bag.includes('more') || bag.includes('edit') || bag.includes('save') || bag.includes('update') || bag.includes('post') || bag.includes('tweet');
      }).slice(0, 120);

      const text = clean(document.body?.innerText || '');

      return {
        url: location.href,
        title: document.title,
        buttonCount: buttons.length,
        interesting,
        hasEditText: /edit post|edit/i.test(text),
        snippet: text.slice(0, 1800)
      };
    })()`
  }));

  console.log(JSON.stringify({ ok: true, scan }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
