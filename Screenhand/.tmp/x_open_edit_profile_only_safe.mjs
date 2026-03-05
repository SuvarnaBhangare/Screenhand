import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-open-edit-profile-only-safe', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3], raw: line } : null;
  }).filter(Boolean);
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    const width = Number(m[6]); const height = Number(m[7]);
    return { windowId: Number(m[1]), appName: m[2], title: m[3], width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

try {
  await client.connect(transport);
  const launch = await call('launch', { bundleId: 'com.google.Chrome' });
  const focus = await call('focus', { bundleId: 'com.google.Chrome' });

  const tabsRes = await call('browser_tabs', {});
  const tabs = parseTabs(tabsRes.text || '');
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');

  const nav = await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' });
  await sleep(1000);

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const win = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No main Chrome window');

  const edit = await call('click_text', { windowId: win.windowId, text: 'Edit profile' });
  await sleep(900);
  const shot = await call('screenshot_file', { windowId: win.windowId });

  console.log(JSON.stringify({ ok: true, launch, focus, nav, edit, screenshot: shot, window: win }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
