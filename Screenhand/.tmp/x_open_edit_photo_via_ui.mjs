import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-open-edit-photo-via-ui', version: '1.0.0' }, { capabilities: {} });
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
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  }).filter(Boolean);
}

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    return m ? { name: m[1], bundleId: m[2], pid: Number(m[3]) } : null;
  }).filter(Boolean);
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });

  const tabs = parseTabs((await call('browser_tabs', {})).text || '');
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' });
  await sleep(1000);

  const apps = parseApps((await call('apps', {})).text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome');
  if (!chrome) throw new Error('Chrome pid not found');

  const p1 = await call('ui_press', { pid: chrome.pid, title: 'Edit profile' });
  await sleep(900);
  const p2 = await call('ui_press', { pid: chrome.pid, title: 'Edit Photo' });
  await sleep(900);

  const shot = await call('screenshot', {});
  const shotFile = await call('screenshot_file', {});

  console.log(JSON.stringify({
    pressEditProfile: p1,
    pressEditPhoto: p2,
    screenshotSnippet: (shot.text || '').slice(0, 2500),
    screenshotFile: shotFile.text || null
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
