import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_set_name_via_ui_set_value_report.json';
const NAME = 'ScreenHand';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-set-name-via-ui-set-value', version: '1.0.0' }, { capabilities: {} });

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

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'launch', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabs = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabs });
  if (tabs.ok) {
    const xLine = tabs.text.split('\n').find((l) => /x\.com|twitter\.com/i.test(l));
    const m = xLine?.match(/^\[([^\]]+)\]/);
    if (m) report.steps.push({ step: 'nav', result: await call('browser_navigate', { tabId: m[1], url: 'https://x.com/screenhand_' }) });
  }

  await new Promise((r) => setTimeout(r, 900));

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const chromeWin = wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No Chrome window');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'openEdit', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 900));

  report.steps.push({ step: 'focusNameByClick', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Name' }) });
  await new Promise((r) => setTimeout(r, 200));

  const appsRes = await call('apps', {});
  const apps = parseApps(appsRes.text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('No Chrome pid');
  report.chromePid = chrome.pid;

  const preFind = await call('ui_find', { pid: chrome.pid, title: 'Name' });
  report.steps.push({ step: 'preFindName', result: preFind });

  const set1 = await call('ui_set_value', { pid: chrome.pid, title: 'Name', value: NAME });
  report.steps.push({ step: 'setName', result: set1 });

  const postFind = await call('ui_find', { pid: chrome.pid, title: 'Name' });
  report.steps.push({ step: 'postFindName', result: postFind });

  report.steps.push({ step: 'save', result: await call('ui_press', { pid: chrome.pid, title: 'Save' }) });
  await new Promise((r) => setTimeout(r, 1000));

  const shot = await call('screenshot', { windowId: chromeWin.windowId });
  report.steps.push({ step: 'verify', result: {
    hasScreenHandName: /ScreenHand\s*\(@screenhand_\)|Name\s+ScreenHand/i.test(shot.text || ''),
    snippet: (shot.text || '').slice(0, 2200)
  }});

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, final: report.steps.find((s) => s.step === 'verify')?.result }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
