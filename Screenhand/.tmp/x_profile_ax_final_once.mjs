import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_ax_final_once_report.json';
const BRAND = {
  name: 'ScreenHand',
  bio: 'Open-source MCP server for AI desktop automation. AI agents can see, click, and type across macOS + Windows. screenhand.com',
  location: 'Global',
  website: 'https://screenhand.com'
};

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-profile-ax-final-once', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

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

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    return m ? { name: m[1], bundleId: m[2], pid: Number(m[3]), raw: line } : null;
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), brand: BRAND, steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'tabs failed');
  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found');
  report.xTab = xTab;

  report.steps.push({ step: 'navProfile', result: await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }) });
  await new Promise((r) => setTimeout(r, 700));

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  if (!winsRes.ok) throw new Error(winsRes.error || 'windows failed');
  const win = parseWindows(winsRes.text).filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('Main Chrome window not found');
  report.chromeWindow = win;

  report.steps.push({ step: 'openEdit', result: await call('click_text', { windowId: win.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 900));

  const appsRes = await call('apps', {});
  report.steps.push({ step: 'apps', result: appsRes });
  if (!appsRes.ok) throw new Error(appsRes.error || 'apps failed');
  const chrome = parseApps(appsRes.text).find((a) => a.bundleId === 'com.google.Chrome');
  if (!chrome) throw new Error('Chrome pid not found');
  report.chromePid = chrome.pid;

  const find = async (label) => {
    const r = await call('ui_find', { pid: chrome.pid, title: label });
    report.steps.push({ step: `find:${label}`, result: r });
    return r.ok ? j(r.text) : null;
  };

  const n = await find('Name');
  const b = await find('Bio');
  const l = await find('Location');
  const w = await find('Website');

  if (n?.title) report.steps.push({ step: 'set:Name', result: await call('ui_set_value', { pid: chrome.pid, title: n.title, value: BRAND.name }) });
  if (b?.title) report.steps.push({ step: 'set:Bio', result: await call('ui_set_value', { pid: chrome.pid, title: b.title, value: BRAND.bio }) });
  if (l?.title) report.steps.push({ step: 'set:Location', result: await call('ui_set_value', { pid: chrome.pid, title: l.title, value: BRAND.location }) });
  if (w?.title) report.steps.push({ step: 'set:Website', result: await call('ui_set_value', { pid: chrome.pid, title: w.title, value: BRAND.website }) });

  report.steps.push({ step: 'verify:Name', result: await call('ui_find', { pid: chrome.pid, title: 'Name' }) });
  report.steps.push({ step: 'verify:Bio', result: await call('ui_find', { pid: chrome.pid, title: 'Bio' }) });
  report.steps.push({ step: 'verify:Location', result: await call('ui_find', { pid: chrome.pid, title: 'Location' }) });
  report.steps.push({ step: 'verify:Website', result: await call('ui_find', { pid: chrome.pid, title: 'Website' }) });

  const saveNode = await find('Save');
  if (saveNode?.bounds) {
    const x = Math.round(saveNode.bounds.x + saveNode.bounds.width / 2);
    const y = Math.round(saveNode.bounds.y + saveNode.bounds.height / 2);
    report.steps.push({ step: 'saveClickByBounds', result: await call('click', { x, y }) });
  } else {
    report.steps.push({ step: 'saveClickText', result: await call('click_text', { windowId: win.windowId, text: 'Save' }) });
  }

  await new Promise((r) => setTimeout(r, 2500));

  const after = await call('screenshot', { windowId: win.windowId });
  report.afterSave = {
    modalStillOpen: /Edit your photo with Imagine|\bBio\b\s+\d+\s*\/\s*160|\bName\b\s+\d+\s*\/\s*50/.test(after.text || ''),
    hasScreenHandInModalOrPage: /ScreenHand/i.test(after.text || ''),
    snippet: (after.text || '').slice(0, 2800)
  };
  report.steps.push({ step: 'afterSaveShot', result: report.afterSave });

  report.steps.push({ step: 'navProfileFinal', result: await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }) });
  await new Promise((r) => setTimeout(r, 1000));
  const pub = await call('screenshot', { windowId: win.windowId });
  const text = pub.text || '';
  report.final = {
    hasName: /ScreenHand\s*@screenhand_/i.test(text) || /@screenhand_\s*\n\s*ScreenHand/i.test(text),
    hasBio: /open-source mcp server|screenhand\.com|desktop automation/i.test(text.toLowerCase()),
    hasLocation: /\bGlobal\b/i.test(text),
    snippet: text.slice(0, 2800)
  };
  report.steps.push({ step: 'publicVerify', result: report.final });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, afterSave: report.afterSave, final: report.final }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
