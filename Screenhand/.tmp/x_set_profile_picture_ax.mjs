import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_set_profile_picture_ax_report.json';
const PROFILE_URL = 'https://x.com/screenhand_';
const IMAGE_PATH = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets/screenhand-profile-1080.png';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-set-profile-picture-ax', version: '1.0.0' }, { capabilities: {} });

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
    const width = Number(m[6]);
    const height = Number(m[7]);
    return {
      windowId: Number(m[1]), appName: m[2], title: m[3],
      x: Number(m[4]), y: Number(m[5]), width, height, area: width * height, raw: line
    };
  }).filter(Boolean);
}

async function clickTextVariants(windowId, variants, report, stepPrefix) {
  for (const v of variants) {
    const r = await call('click_text', { windowId, text: v });
    report.steps.push({ step: `${stepPrefix}:${v}`, result: r });
    if (r.ok) return { ok: true, used: v, result: r };
  }
  return { ok: false, used: null };
}

const report = {
  startedAt: new Date().toISOString(),
  image: IMAGE_PATH,
  steps: [],
  errors: []
};

try {
  await client.connect(transport);

  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'browserTabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'browser_tabs failed');
  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found');
  report.xTab = xTab;

  report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  report.steps.push({ step: 'waitProfile', result: await call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 40', timeoutMs: 25000 }) });
  await sleep(900);

  const windowsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: windowsRes });
  if (!windowsRes.ok) throw new Error(windowsRes.error || 'windows failed');
  const windows = parseWindows(windowsRes.text);
  const chromeWin = windows
    .filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400)
    .sort((a, b) => b.area - a.area)[0];
  if (!chromeWin) throw new Error('Main Chrome window not found');
  report.chromeWindow = chromeWin;

  const editProfile = await clickTextVariants(chromeWin.windowId, ['Edit profile'], report, 'clickEditProfile');
  if (!editProfile.ok) throw new Error('Edit profile not found');
  await sleep(1000);

  const editPhoto = await clickTextVariants(chromeWin.windowId, ['Edit Photo', 'Edit photo', 'Add photo', 'Profile photo'], report, 'clickEditPhoto');
  if (!editPhoto.ok) throw new Error('Edit photo trigger not found');
  await sleep(700);

  // Sometimes there is an intermediate menu option before native picker
  await clickTextVariants(chromeWin.windowId, ['Upload photo', 'Choose photo', 'Choose existing photo', 'Open'], report, 'clickUploadOption');
  await sleep(700);

  report.steps.push({ step: 'openGoToFolder', result: await call('key', { combo: 'cmd+shift+g' }) });
  await sleep(300);
  report.steps.push({ step: 'typeImagePath', result: await call('type_text', { text: IMAGE_PATH }) });
  await sleep(220);
  report.steps.push({ step: 'confirmPathEnter1', result: await call('key', { combo: 'enter' }) });
  await sleep(550);
  report.steps.push({ step: 'confirmOpenEnter2', result: await call('key', { combo: 'enter' }) });

  // Wait for upload/crop UI
  await sleep(2000);

  await clickTextVariants(chromeWin.windowId, ['Apply', 'Done', 'Crop', 'Save'], report, 'confirmCropOrApply');
  await sleep(1200);

  // Save profile modal
  const saveProfile = await clickTextVariants(chromeWin.windowId, ['Save'], report, 'saveProfile');
  if (!saveProfile.ok) {
    report.steps.push({ step: 'saveProfileFallbackKey', result: await call('key', { combo: 'enter' }) });
  }

  await sleep(2200);

  // Final verify snapshot (visual proof)
  report.steps.push({ step: 'navigateProfileFinal', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(1200);

  const finalShot = await call('screenshot', { windowId: chromeWin.windowId });
  report.steps.push({ step: 'finalScreenshot', result: finalShot });

  const finalFile = await call('screenshot_file', { windowId: chromeWin.windowId });
  report.steps.push({ step: 'finalScreenshotFile', result: finalFile });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    screenshotFile: finalFile.ok ? finalFile.text : null,
    note: 'Profile picture flow executed. Please visually confirm avatar changed on profile header.'
  }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
