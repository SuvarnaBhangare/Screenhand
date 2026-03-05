import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-profile-photo-options-probe', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);

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
    const width = Number(m[6]);
    const height = Number(m[7]);
    return { windowId: Number(m[1]), appName: m[2], title: m[3], width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    return m ? { name: m[1], bundleId: m[2], pid: Number(m[3]), raw: line } : null;
  }).filter(Boolean);
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });

  const tabs = parseTabs((await call('browser_tabs', {})).text || '');
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' });

  const wins = parseWindows((await call('windows', {})).text || '');
  const win = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No Chrome window');

  await call('click_text', { windowId: win.windowId, text: 'Edit profile' });
  await new Promise((r) => setTimeout(r, 900));
  await call('click_text', { windowId: win.windowId, text: 'Edit Photo' });
  await new Promise((r) => setTimeout(r, 900));

  const apps = parseApps((await call('apps', {})).text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome');
  if (!chrome) throw new Error('No Chrome pid');

  const tree = await call('ui_tree', { pid: chrome.pid, maxDepth: 8 });
  const lines = (tree.text || '').split('\n');
  const interesting = lines.filter((ln) => /photo|upload|choose|imagine|update profile|camera|file|save|done|apply|edit/i.test(ln)).slice(0, 500);

  const shot = await call('screenshot', { windowId: win.windowId });
  const shotFile = await call('screenshot_file', { windowId: win.windowId });

  console.log(JSON.stringify({
    win,
    chromePid: chrome.pid,
    tabUrl: xTab.url,
    interestingCount: interesting.length,
    interesting,
    screenshot: shot.text?.slice(0, 2500) || null,
    screenshotFile: shotFile.text || null
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
