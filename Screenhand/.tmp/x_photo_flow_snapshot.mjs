import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_photo_flow_snapshot_report.json';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-photo-flow-snapshot', version: '1.0.0' }, { capabilities: {} });
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

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    const width = Number(m[6]);
    const height = Number(m[7]);
    return { windowId: Number(m[1]), appName: m[2], title: m[3], width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabs = parseTabs((await call('browser_tabs', {})).text || '');
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.steps.push({ step: 'navigate', result: await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }) });
  await sleep(900);

  const wins = parseWindows((await call('windows', {})).text || '');
  const win = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No Chrome window');
  report.window = win;

  const s0 = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'shot_before', result: s0 });

  const c1 = await call('click_text', { windowId: win.windowId, text: 'Edit profile' });
  report.steps.push({ step: 'click_edit_profile', result: c1 });
  await sleep(900);
  const s1 = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'shot_after_edit_profile', result: s1 });

  const c2 = await call('click_text', { windowId: win.windowId, text: 'Edit Photo' });
  report.steps.push({ step: 'click_edit_photo', result: c2 });
  await sleep(1100);
  const s2 = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'shot_after_edit_photo', result: s2 });

  const o2 = await call('screenshot', { windowId: win.windowId });
  report.steps.push({ step: 'ocr_after_edit_photo', result: o2 });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, shots: [s0.text, s1.text, s2.text] }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
