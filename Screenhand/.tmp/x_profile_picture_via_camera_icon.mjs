import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_picture_via_camera_icon_report.json';
const PROFILE_URL = 'https://x.com/screenhand_';
const IMAGE_PATH = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets/screenhand-profile-1080.png';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-profile-picture-via-camera-icon', version: '1.0.0' }, { capabilities: {} });
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
    return m ? { id: m[1], title: m[2], url: m[3], raw: line } : null;
  }).filter(Boolean);
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    const width = Number(m[6]); const height = Number(m[7]);
    return { windowId: Number(m[1]), appName: m[2], title: m[3], x: Number(m[4]), y: Number(m[5]), width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), image: IMAGE_PATH, steps: [], errors: [] };

try {
  await client.connect(transport);

  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'tabs failed');
  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');

  report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(900);

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  if (!winsRes.ok) throw new Error(winsRes.error || 'windows failed');
  const win = parseWindows(winsRes.text).filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('Main Chrome window not found');
  report.window = win;

  report.steps.push({ step: 'clickEditProfile', result: await call('click_text', { windowId: win.windowId, text: 'Edit profile' }) });
  await sleep(1000);

  // Candidate coordinates for avatar camera icon inside edit modal (window-relative)
  const candidates = [
    { dx: 362, dy: 357 },
    { dx: 355, dy: 352 },
    { dx: 370, dy: 365 },
    { dx: 550, dy: 258 } // banner camera fallback
  ];

  for (const c of candidates) {
    const x = win.x + c.dx;
    const y = win.y + c.dy;
    report.steps.push({ step: `clickCameraCandidate:${c.dx},${c.dy}`, result: await call('click', { x, y }) });
    await sleep(350);

    report.steps.push({ step: 'openGoToFolder', result: await call('key', { combo: 'cmd+shift+g' }) });
    await sleep(260);
    report.steps.push({ step: 'typePath', result: await call('type_text', { text: IMAGE_PATH }) });
    await sleep(180);
    report.steps.push({ step: 'enter1', result: await call('key', { combo: 'enter' }) });
    await sleep(500);
    report.steps.push({ step: 'enter2', result: await call('key', { combo: 'enter' }) });

    await sleep(1400);

    // Check if still in modal and try save
    report.steps.push({ step: 'saveModal', result: await call('click_text', { windowId: win.windowId, text: 'Save' }) });
    await sleep(1200);
  }

  report.steps.push({ step: 'navigateFinal', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(1200);

  const finalFile = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'finalScreenshotFile', result: finalFile });
  const finalOcr = await call('screenshot', { windowId: win.windowId });
  report.steps.push({ step: 'finalOCR', result: finalOcr });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, screenshotFile: finalFile.ok ? finalFile.text : null }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
