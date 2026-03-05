import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-name-field-discovery', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    return { windowId: Number(m[1]), appName: m[2], title: m[3], raw: line };
  }).filter(Boolean);
}

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    if (!m) return null;
    return { name: m[1], bundleId: m[2], pid: Number(m[3]), raw: line };
  }).filter(Boolean);
}

try {
  await client.connect(transport);
  await call('launch', { bundleId: 'com.google.Chrome' });
  await call('focus', { bundleId: 'com.google.Chrome' });
  await new Promise((r) => setTimeout(r, 1000));

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const chromeWin = wins.find((w) => /Google Chrome/i.test(w.appName) && /x|screenhand_|Usha|twitter/i.test(w.title))
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No Chrome window');

  await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' });
  await new Promise((r) => setTimeout(r, 900));

  const appsRes = await call('apps', {});
  const apps = parseApps(appsRes.text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('Chrome PID not found');

  const candidates = ['Name', 'Display name', 'Your name', 'Usha', 'screenhand_', 'Bio', 'Location', 'Website', 'Save'];
  const finds = [];
  for (const q of candidates) {
    const r = await call('ui_find', { pid: chrome.pid, title: q });
    finds.push({ query: q, ok: r.ok, text: r.ok ? r.text : r.error });
  }

  const tree = await call('ui_tree', { pid: chrome.pid, maxDepth: 7 });
  const treeText = tree.ok ? tree.text : String(tree.error || '');
  const lines = treeText.split('\n');
  const interesting = lines.filter((ln) => /Name|Display|Bio|Location|Website|AXTextField|AXTextArea|AXButton "Save"|Usha|screenhand_|Edit profile/i.test(ln)).slice(0, 400);

  console.log(JSON.stringify({
    chromeWindow: chromeWin,
    chromePid: chrome.pid,
    finds,
    interestingCount: interesting.length,
    interesting
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
