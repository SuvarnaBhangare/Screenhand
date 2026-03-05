import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_set_bio_only_safe_report.json';
const BIO = 'Open-source MCP server for AI desktop automation. AI agents can see, click, and type across macOS + Windows. screenhand.com';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-set-bio-only-safe', version: '1.0.0' }, { capabilities: {} });
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

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    return { windowId: Number(m[1]), appName: m[2], title: m[3], width: Number(m[6]), height: Number(m[7]), area: Number(m[6]) * Number(m[7]), raw: line };
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
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  const xLine = tabsRes.ok ? tabsRes.text.split('\n').find((l) => /x\.com|twitter\.com/i.test(l)) : null;
  const tabId = xLine?.match(/^\[([^\]]+)\]/)?.[1];
  if (tabId) report.steps.push({ step: 'navProfile', result: await call('browser_navigate', { tabId, url: 'https://x.com/screenhand_' }) });

  await new Promise((r) => setTimeout(r, 700));

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const chromeWin = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 500 && w.height > 300).sort((a, b) => b.area - a.area)[0]
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No Chrome window');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'openEdit', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 900));

  const appsRes = await call('apps', {});
  const apps = parseApps(appsRes.text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('No Chrome pid');

  const bioFind = await call('ui_find', { pid: chrome.pid, title: 'Bio' });
  report.steps.push({ step: 'findBio', result: bioFind });
  const bioObj = bioFind.ok ? j(bioFind.text) : null;
  const bioTitle = bioObj?.title || 'Bio';

  report.steps.push({ step: 'setBio', result: await call('ui_set_value', { pid: chrome.pid, title: bioTitle, value: BIO }) });
  const bioVerify = await call('ui_find', { pid: chrome.pid, title: 'Bio' });
  report.steps.push({ step: 'verifyBioInModal', result: bioVerify });

  report.steps.push({ step: 'save', result: await call('ui_press', { pid: chrome.pid, title: 'Save' }) });
  await new Promise((r) => setTimeout(r, 2500));

  // Navigate again to force refreshed public profile
  if (tabId) report.steps.push({ step: 'navProfileAfterSave', result: await call('browser_navigate', { tabId, url: 'https://x.com/screenhand_' }) });
  await new Promise((r) => setTimeout(r, 1000));

  const shot = await call('screenshot', { windowId: chromeWin.windowId });
  const text = shot.text || '';
  report.final = {
    hasName: /ScreenHand\s*@screenhand_/i.test(text) || /@screenhand_\s*\n\s*ScreenHand/i.test(text),
    hasBio: /open-source mcp server|screenhand\.com/i.test(text.toLowerCase()),
    snippet: text.slice(0, 2800)
  };
  report.steps.push({ step: 'publicVerify', result: report.final });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, final: report.final }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
