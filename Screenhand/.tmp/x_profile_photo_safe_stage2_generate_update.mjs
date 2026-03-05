import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_photo_safe_stage2_generate_update_report.json';
const PROFILE_URL = 'https://x.com/screenhand_';
const PROMPT = 'Create a clean logo avatar for ScreenHand: dark slate circular background, white S centered, minimal flat style.';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-profile-photo-safe-stage2-generate-update', version: '1.0.0' }, { capabilities: {} });

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
    return { windowId: Number(m[1]), appName: m[2], title: m[3], x: Number(m[4]), y: Number(m[5]), width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), prompt: PROMPT, steps: [], errors: [] };

try {
  await client.connect(transport);

  report.steps.push({ step: 'launchChrome', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });
  await sleep(1000);

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'browserTabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'browser_tabs failed');
  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found');

  let win = null;
  for (let i = 0; i < 4; i++) {
    const windowsRes = await call('windows', {});
    report.steps.push({ step: `windows_${i + 1}`, result: windowsRes });
    if (windowsRes.ok) {
      win = parseWindows(windowsRes.text)
        .filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400)
        .sort((a, b) => b.area - a.area)[0] || null;
      if (win) break;
    }
    await call('focus', { bundleId: 'com.google.Chrome' });
    await sleep(800);
  }
  if (!win) throw new Error('Main Chrome window not found');
  report.chromeWindow = win;

  // Ensure modal is visible by trying Edit profile -> Edit Photo if not already
  report.steps.push({ step: 'ensureEditProfile', result: await call('click_text', { windowId: win.windowId, text: 'Edit profile' }) });
  await sleep(700);
  report.steps.push({ step: 'ensureEditPhoto', result: await call('click_text', { windowId: win.windowId, text: 'Edit Photo' }) });
  await sleep(900);

  report.steps.push({ step: 'focusEditImageInput', result: await call('click_text', { windowId: win.windowId, text: 'Edit image' }) });
  await sleep(220);
  report.steps.push({ step: 'typePrompt', result: await call('type_text', { text: PROMPT }) });
  await sleep(220);
  report.steps.push({ step: 'submitPromptEnter', result: await call('key', { combo: 'enter' }) });

  await sleep(9000);

  report.steps.push({ step: 'clickUpdateProfile', result: await call('click_text', { windowId: win.windowId, text: 'Update Profile' }) });
  await sleep(2500);

  report.steps.push({ step: 'navigateProfileFinal', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(1300);

  const finalFile = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'finalScreenshotFile', result: finalFile });
  const finalShot = await call('screenshot', { windowId: win.windowId });
  report.steps.push({ step: 'finalScreenshotOCR', result: finalShot });

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
