import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_picture_stage2_retry_submit_report.json';
const PROFILE_URL = 'https://x.com/screenhand_';
const PROMPT = 'Minimal profile avatar logo for ScreenHand: dark circle background, white S letter centered.';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-profile-picture-stage2-retry-submit', version: '1.0.0' }, { capabilities: {} });
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

const report = { startedAt: new Date().toISOString(), prompt: PROMPT, steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'launch', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });
  await sleep(900);

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'tabs failed');
  const tabs = parseTabs(tabsRes.text);
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  if (!winsRes.ok) throw new Error(winsRes.error || 'windows failed');
  const win = parseWindows(winsRes.text).filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No main Chrome window');
  report.window = win;

  // Ensure imagine modal open
  report.steps.push({ step: 'gotoProfile', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(800);
  report.steps.push({ step: 'clickEditProfile', result: await call('click_text', { windowId: win.windowId, text: 'Edit profile' }) });
  await sleep(800);
  report.steps.push({ step: 'clickEditPhoto', result: await call('click_text', { windowId: win.windowId, text: 'Edit Photo' }) });
  await sleep(1000);

  report.steps.push({ step: 'focusEditImage', result: await call('click_text', { windowId: win.windowId, text: 'Edit image' }) });
  await sleep(200);
  report.steps.push({ step: 'typePrompt', result: await call('type_text', { text: PROMPT }) });
  await sleep(200);

  // Explicit submit: click send icon near bottom-right of modal
  const sendCandidates = [
    { x: win.x + 722, y: win.y + 607 },
    { x: win.x + 707, y: win.y + 607 },
    { x: win.x + 735, y: win.y + 607 }
  ];
  for (const [idx, c] of sendCandidates.entries()) {
    report.steps.push({ step: `clickSend_${idx + 1}`, result: await call('click', { x: c.x, y: c.y }) });
    await sleep(250);
  }
  report.steps.push({ step: 'enterSendFallback', result: await call('key', { combo: 'enter' }) });

  // Wait and retry Update Profile until available
  let updated = false;
  for (let i = 1; i <= 8; i++) {
    await sleep(3000);
    const u1 = await call('click_text', { windowId: win.windowId, text: 'Update Profile' });
    report.steps.push({ step: `tryUpdateProfile_${i}`, result: u1 });
    if (u1.ok && /^Clicked\s/i.test(u1.text || '')) {
      updated = true;
      break;
    }
    const u2 = await call('click_text', { windowId: win.windowId, text: 'Update profile' });
    report.steps.push({ step: `tryUpdateprofileLower_${i}`, result: u2 });
    if (u2.ok && /^Clicked\s/i.test(u2.text || '')) {
      updated = true;
      break;
    }
  }

  report.updatedClicked = updated;

  await sleep(2500);
  report.steps.push({ step: 'finalProfileNavigate', result: await call('browser_navigate', { tabId: xTab.id, url: PROFILE_URL }) });
  await sleep(1200);

  const finalFile = await call('screenshot_file', { windowId: win.windowId });
  report.steps.push({ step: 'finalScreenshotFile', result: finalFile });
  const finalOcr = await call('screenshot', { windowId: win.windowId });
  report.steps.push({ step: 'finalOCR', result: finalOcr });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, updatedClicked: updated, screenshotFile: finalFile.ok ? finalFile.text : null }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
