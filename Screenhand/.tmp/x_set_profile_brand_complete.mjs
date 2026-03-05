import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_set_profile_brand_complete_report.json';

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
const client = new Client({ name: 'x-set-profile-brand-complete', version: '1.0.0' }, { capabilities: {} });

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
    return {
      windowId: Number(m[1]), appName: m[2], title: m[3],
      x: Number(m[4]), y: Number(m[5]), width: Number(m[6]), height: Number(m[7]),
      area: Number(m[6]) * Number(m[7]), raw: line
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

  report.steps.push({ step: 'launch', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (tabsRes.ok) {
    const xLine = tabsRes.text.split('\n').find((l) => /x\.com|twitter\.com/i.test(l));
    const m = xLine?.match(/^\[([^\]]+)\]/);
    if (m) {
      report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: m[1], url: 'https://x.com/screenhand_' }) });
    }
  }

  await new Promise((r) => setTimeout(r, 900));

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const chromeWin = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 500 && w.height > 300).sort((a, b) => b.area - a.area)[0]
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No visible Chrome window found');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'openEdit', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 900));

  const appsRes = await call('apps', {});
  const apps = parseApps(appsRes.text || '');
  const chrome = apps.find((a) => a.bundleId === 'com.google.Chrome') || apps.find((a) => /Google Chrome/i.test(a.name));
  if (!chrome) throw new Error('Chrome PID not found');
  report.chromePid = chrome.pid;

  const findField = async (query) => {
    const r = await call('ui_find', { pid: chrome.pid, title: query });
    report.steps.push({ step: `find:${query}`, result: r });
    if (!r.ok) return null;
    const parsed = j(r.text);
    if (!parsed || !parsed.title) return null;
    return parsed;
  };

  const nameField = await findField('Name');
  const bioField = await findField('Bio');
  const locField = await findField('Location');
  const webField = await findField('Website');

  const setByResolvedTitle = async (label, field, value) => {
    if (!field?.title) {
      report.steps.push({ step: `set:${label}`, result: { ok: false, error: 'field-not-found' } });
      return false;
    }
    const set = await call('ui_set_value', { pid: chrome.pid, title: field.title, value });
    report.steps.push({ step: `set:${label}`, result: set });
    const verify = await call('ui_find', { pid: chrome.pid, title: label });
    report.steps.push({ step: `verifyField:${label}`, result: verify });
    const parsed = verify.ok ? j(verify.text) : null;
    const actual = (parsed?.value ?? '').toString().toLowerCase();
    return actual.includes(value.toLowerCase().slice(0, 20));
  };

  const setStatus = {
    name: await setByResolvedTitle('Name', nameField, BRAND.name),
    bio: await setByResolvedTitle('Bio', bioField, BRAND.bio),
    location: await setByResolvedTitle('Location', locField, BRAND.location),
    website: await setByResolvedTitle('Website', webField, BRAND.website)
  };
  report.setStatus = setStatus;

  // Save
  const saveR = await call('ui_press', { pid: chrome.pid, title: 'Save' });
  report.steps.push({ step: 'save', result: saveR });
  if (!saveR.ok) report.steps.push({ step: 'fallbackSave', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Save' }) });

  await new Promise((r) => setTimeout(r, 1200));

  // Ensure modal dismissed then read public profile
  report.steps.push({ step: 'dismissModalMaybe', result: await call('key', { combo: 'escape' }) });
  await new Promise((r) => setTimeout(r, 300));

  const shot = await call('screenshot', { windowId: chromeWin.windowId });
  const text = shot.text || '';
  report.publicVerify = {
    hasNameScreenHand: /ScreenHand\s*@screenhand_/i.test(text) || /@screenhand_\s*\n\s*ScreenHand/i.test(text),
    hasBioKeyword: /open-source mcp server|screenhand\.com/i.test(text.toLowerCase()),
    hasLocationGlobal: /Location\s+Global/i.test(text),
    snippet: text.slice(0, 2600)
  };
  report.steps.push({ step: 'publicVerify', result: report.publicVerify });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, setStatus, publicVerify: report.publicVerify }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
