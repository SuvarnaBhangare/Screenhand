import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_update_profile_via_ax_report.json';

const BRAND = {
  name: 'ScreenHand',
  bio: 'Open-source MCP server for AI desktop automation. AI agents can see, click, and type across macOS + Windows. screenhand.com',
  location: 'Global',
  website: 'https://screenhand.com'
};

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-update-profile-via-ax', version: '1.0.0' }, { capabilities: {} });

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
    return {
      windowId: Number(m[1]),
      appName: m[2],
      title: m[3],
      x: Number(m[4]),
      y: Number(m[5]),
      width: Number(m[6]),
      height: Number(m[7]),
      raw: line
    };
  }).filter(Boolean);
}

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    if (!m) return null;
    return { name: m[1], bundleId: m[2], pid: Number(m[3]), raw: line };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), brand: BRAND, steps: [], errors: [] };

try {
  await client.connect(transport);

  report.steps.push({ step: 'launchChrome', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  // Keep tab on X profile page
  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'browserTabs', result: tabsRes });
  if (tabsRes.ok) {
    const lines = tabsRes.text.split('\n');
    const xLine = lines.find((l) => /x\.com|twitter\.com/i.test(l));
    const m = xLine?.match(/^\[([^\]]+)\]/);
    if (m) {
      report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: m[1], url: 'https://x.com/screenhand_' }) });
    }
  }

  await new Promise((r) => setTimeout(r, 1200));

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  if (!winsRes.ok) throw new Error(winsRes.error || 'windows failed');
  const wins = parseWindows(winsRes.text);
  const chromeWin = wins.find((w) => /Google Chrome/i.test(w.appName) && /x|twitter|Usha|screenhand_/i.test(w.title))
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No visible Chrome window found');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'openEditProfile', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 1000));

  const appsRes = await call('apps', {});
  report.steps.push({ step: 'apps', result: appsRes });
  if (!appsRes.ok) throw new Error(appsRes.error || 'apps failed');
  const apps = parseApps(appsRes.text);
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('Chrome pid not found');
  report.chromePid = chrome.pid;

  const trySet = async (title, value) => {
    const r = await call('ui_set_value', { pid: chrome.pid, title, value });
    report.steps.push({ step: `ui_set_value:${title}`, result: r });
    return r.ok;
  };

  const setResults = {
    name: await trySet('Name', BRAND.name),
    bio: await trySet('Bio', BRAND.bio),
    location: await trySet('Location', BRAND.location),
    website: await trySet('Website', BRAND.website),
  };

  // Fallback to OCR click + keyboard for fields not set via AX
  const fallbackSet = async (label, value) => {
    const c1 = await call('click_text', { windowId: chromeWin.windowId, text: label });
    report.steps.push({ step: `fallbackClick:${label}`, result: c1 });
    await call('key', { combo: 'cmd+a' });
    await new Promise((r) => setTimeout(r, 120));
    const typed = await call('type_text', { text: value });
    report.steps.push({ step: `fallbackType:${label}`, result: typed });
  };

  if (!setResults.name) await fallbackSet('Name', BRAND.name);
  if (!setResults.bio) await fallbackSet('Bio', BRAND.bio);
  if (!setResults.location) await fallbackSet('Location', BRAND.location);
  if (!setResults.website) await fallbackSet('Website', BRAND.website);

  const savePress = await call('ui_press', { pid: chrome.pid, title: 'Save' });
  report.steps.push({ step: 'ui_press:Save', result: savePress });
  if (!savePress.ok) {
    report.steps.push({ step: 'fallbackSaveClick', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Save' }) });
  }

  await new Promise((r) => setTimeout(r, 1200));

  const verifyShot = await call('screenshot', { windowId: chromeWin.windowId });
  report.steps.push({ step: 'verifyScreenshot', result: verifyShot });
  report.verify = {
    hasScreenHand: /\bScreenHand\b/i.test(verifyShot.text || ''),
    hasScreenhandSite: /screenhand\.com/i.test(verifyShot.text || ''),
    hasEditProfile: /edit\s+profile/i.test(verifyShot.text || ''),
    snippet: (verifyShot.text || '').slice(0, 2200)
  };

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, verify: report.verify }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
