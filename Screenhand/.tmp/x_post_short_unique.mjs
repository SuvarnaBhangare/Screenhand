import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const POST_TEXT = `ScreenHand helps AI agents automate real Mac workflows: OCR vision, native app control, Chrome automation, and AppleScript via MCP. Try it: https://screenhand.com #AIAgents #MCP #macOS`;
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-post-short-unique', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  }).filter(Boolean);
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    return { windowId: Number(m[1]), appName: m[2], title: m[3], area: Number(m[6]) * Number(m[7]) };
  }).filter(Boolean);
}

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

try {
  await client.connect(transport);
  const log = { postText: POST_TEXT, steps: [] };
  const push = (step, result) => log.steps.push({ step, result });

  const f = await call('focus', { bundleId: 'com.google.Chrome' }); push('focus', f);
  const tabsRes = await call('browser_tabs', {}); push('tabs', tabsRes);
  const tab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  push('navCompose', await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/compose/post' }));
  await sleep(900);

  const winsRes = await call('windows', {}); push('windows', winsRes);
  const wins = parseWindows(winsRes.text || '').filter((w) => /Google Chrome/i.test(w.appName));
  const win = wins.find((w) => /x|twitter|home\s*\/\s*x|compose/i.test(w.title || '')) || wins.sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No Chrome window');
  push('window', win);

  push('clickCompose1', await call('click_text', { windowId: win.windowId, text: "What's happening" }));
  await sleep(200);
  push('selectAll', await call('key', { combo: 'cmd+a' }));
  push('clear', await call('key', { combo: 'backspace' }));
  await sleep(180);
  const typeRes = await call('type_text', { text: POST_TEXT }); push('type', typeRes);
  await sleep(250);
  push('submit', await call('key', { combo: 'cmd+enter' }));
  await sleep(2600);

  push('navProfile', await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/screenhand_' }));
  await sleep(900);
  const latest = await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/status/"]')).map(a => a.getAttribute('href')).filter(Boolean);
      const own = links.find(h => h.startsWith('/screenhand_/status/'));
      return { href: own || null, url: own ? 'https://x.com' + own : null, page: location.href };
    })()`
  });
  push('latest', latest);

  console.log(JSON.stringify({ ok: true, log, latest: latest.ok ? j(latest.text || '') : null }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
