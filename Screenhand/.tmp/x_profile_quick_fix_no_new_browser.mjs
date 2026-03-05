import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_quick_fix_no_new_browser_report.json';

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
const client = new Client({ name: 'x-profile-quick-fix-no-new-browser', version: '1.0.0' }, { capabilities: {} });

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
    const width = Number(m[6]);
    const height = Number(m[7]);
    return {
      windowId: Number(m[1]), appName: m[2], title: m[3],
      x: Number(m[4]), y: Number(m[5]), width, height, area: width * height, raw: line
    };
  }).filter(Boolean);
}

function parseApps(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^(.*?)\s+\(([^)]+)\)\s+pid=(\d+)(?:\s+←\s+active)?$/);
    return m ? { name: m[1], bundleId: m[2], pid: Number(m[3]), raw: line } : null;
  }).filter(Boolean);
}

function center(bounds) {
  return {
    x: Math.round((bounds?.x ?? 0) + Math.max(20, (bounds?.width ?? 40) / 2)),
    y: Math.round((bounds?.y ?? 0) + Math.max(14, (bounds?.height ?? 28) / 2))
  };
}

const report = { startedAt: new Date().toISOString(), brand: BRAND, steps: [], errors: [] };

try {
  await client.connect(transport);

  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'browser_tabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'browser_tabs failed');

  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found. Keep X open in existing Chrome and retry.');
  report.xTab = xTab;

  report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }) });
  report.steps.push({ step: 'waitProfile', result: await call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 40', timeoutMs: 20000 }) });

  await new Promise((r) => setTimeout(r, 700));

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  if (!winsRes.ok) throw new Error(winsRes.error || 'windows failed');
  const wins = parseWindows(winsRes.text);
  const chromeWin = wins
    .filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400)
    .sort((a, b) => b.area - a.area)[0];
  if (!chromeWin) throw new Error('Main Chrome window not found');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'openEditProfile', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 1000));

  const appsRes = await call('apps', {});
  report.steps.push({ step: 'apps', result: appsRes });
  if (!appsRes.ok) throw new Error(appsRes.error || 'apps failed');
  const apps = parseApps(appsRes.text);
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('Chrome PID not found');
  report.chromePid = chrome.pid;

  const findField = async (label) => {
    const r = await call('ui_find', { pid: chrome.pid, title: label });
    report.steps.push({ step: `find:${label}`, result: r });
    if (!r.ok) return null;
    const parsed = j(r.text);
    return parsed && parsed.title ? parsed : null;
  };

  const setByTyping = async (label, value) => {
    const field = await findField(label);
    if (!field?.bounds) return { ok: false, reason: 'field-not-found-or-no-bounds' };

    const p = center(field.bounds);
    const c = await call('click', { x: p.x, y: p.y });
    report.steps.push({ step: `clickField:${label}`, result: c });
    await new Promise((r) => setTimeout(r, 120));

    const sel = await call('key', { combo: 'cmd+a' });
    report.steps.push({ step: `selectAll:${label}`, result: sel });
    await new Promise((r) => setTimeout(r, 120));

    const typ = await call('type_text', { text: value });
    report.steps.push({ step: `type:${label}`, result: typ });
    await new Promise((r) => setTimeout(r, 180));

    const ver = await call('ui_find', { pid: chrome.pid, title: label });
    report.steps.push({ step: `verify:${label}`, result: ver });
    const parsed = ver.ok ? j(ver.text) : null;
    const v = (parsed?.value ?? '').toString().toLowerCase();
    return { ok: v.includes(value.toLowerCase().slice(0, 12)), value: parsed?.value || null };
  };

  const setName = await setByTyping('Name', BRAND.name);
  const setBio = await setByTyping('Bio', BRAND.bio);
  const setLocation = await setByTyping('Location', BRAND.location);

  // Website often has bad bounds in AX; do direct set_value first, then best-effort typing
  const webField = await findField('Website');
  let setWebsite = { ok: false, value: null };
  if (webField?.title) {
    const sv = await call('ui_set_value', { pid: chrome.pid, title: webField.title, value: BRAND.website });
    report.steps.push({ step: 'setValue:Website', result: sv });
    const wv = await call('ui_find', { pid: chrome.pid, title: 'Website' });
    report.steps.push({ step: 'verify:Website', result: wv });
    const parsed = wv.ok ? j(wv.text) : null;
    const v = (parsed?.value ?? '').toString().toLowerCase();
    setWebsite = { ok: v.includes('screenhand.com'), value: parsed?.value || null };
  }

  report.setStatus = { name: setName, bio: setBio, location: setLocation, website: setWebsite };

  const save = await call('click_text', { windowId: chromeWin.windowId, text: 'Save' });
  report.steps.push({ step: 'saveClick', result: save });
  await new Promise((r) => setTimeout(r, 2500));

  // If modal still open, try one more save click
  const postSaveShot = await call('screenshot', { windowId: chromeWin.windowId });
  report.steps.push({ step: 'postSaveShot', result: postSaveShot });
  const postText = postSaveShot.text || '';
  const modalOpen = /Edit your photo with Imagine|\bBio\b\s+\d+\s*\/\s*160|\bName\b\s+\d+\s*\/\s*50/.test(postText);
  report.modalStillOpen = modalOpen;
  if (modalOpen) {
    const save2 = await call('click_text', { windowId: chromeWin.windowId, text: 'Save' });
    report.steps.push({ step: 'saveClickRetry', result: save2 });
    await new Promise((r) => setTimeout(r, 2500));
  }

  report.steps.push({ step: 'navigateProfileFinal', result: await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }) });
  await new Promise((r) => setTimeout(r, 1200));

  const finalShot = await call('screenshot', { windowId: chromeWin.windowId });
  const finalText = finalShot.text || '';
  report.final = {
    hasName: /ScreenHand\s*@screenhand_/i.test(finalText) || /@screenhand_\s*\n\s*ScreenHand/i.test(finalText),
    hasBio: /open-source mcp server|screenhand\.com|desktop automation/i.test(finalText.toLowerCase()),
    hasLocation: /\bGlobal\b/i.test(finalText),
    snippet: finalText.slice(0, 2800)
  };
  report.steps.push({ step: 'finalVerify', result: report.final });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, final: report.final, setStatus: report.setStatus, modalStillOpen: report.modalStillOpen }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
