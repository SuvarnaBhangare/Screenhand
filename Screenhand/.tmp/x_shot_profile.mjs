import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-shot-profile', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
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
    return { windowId: Number(m[1]), appName: m[2], title: m[3], w: Number(m[6]), h: Number(m[7]) };
  }).filter(Boolean);
}

async function call(name, args = {}) { const res = await client.callTool({ name, arguments: args }); return t(res); }

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: tab.id, url: URL });
  await sleep(1200);
  const wins = parseWindows(await call('windows', {}));
  const win = wins.find((w) => /Google Chrome/i.test(w.appName) && /home\s*\/\s*x|x\.com|screenhand/i.test(w.title || ''))
    || wins.find((w) => /Google Chrome/i.test(w.appName) && !/about:blank/i.test(w.title || ''));
  if (!win) throw new Error('No Chrome profile window');
  const shot = await call('screenshot', { windowId: win.windowId });
  console.log(JSON.stringify({ ok: true, window: win, shot: shot.slice(0, 3200) }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
