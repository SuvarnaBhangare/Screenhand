import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_update_profile_name_only_report.json';
const NAME = 'ScreenHand';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-update-profile-name-only', version: '1.0.0' }, { capabilities: {} });

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
      windowId: Number(m[1]), appName: m[2], title: m[3],
      x: Number(m[4]), y: Number(m[5]), width: Number(m[6]), height: Number(m[7]), raw: line
    };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'focusChrome', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (tabsRes.ok) {
    const xLine = tabsRes.text.split('\n').find((l) => /x\.com|twitter\.com/i.test(l));
    const m = xLine?.match(/^\[([^\]]+)\]/);
    if (m) {
      report.steps.push({ step: 'navProfile', result: await call('browser_navigate', { tabId: m[1], url: 'https://x.com/screenhand_' }) });
    }
  }

  await new Promise((r) => setTimeout(r, 800));

  const winsRes = await call('windows', {});
  report.steps.push({ step: 'windows', result: winsRes });
  const wins = parseWindows(winsRes.text || '');
  const chromeWin = wins.find((w) => /Google Chrome/i.test(w.appName) && /x|screenhand_|Usha|twitter/i.test(w.title))
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No visible Chrome window found');
  report.chromeWindow = chromeWin;

  report.steps.push({ step: 'clickEditProfile', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Edit profile' }) });
  await new Promise((r) => setTimeout(r, 900));

  // Try several offsets for Name label -> input field focus
  const offsets = [28, 18, 38, 0];
  for (const off of offsets) {
    report.steps.push({ step: `clickName_offset_${off}`, result: await call('click_text', { windowId: chromeWin.windowId, text: 'Name', offset_y: off }) });
    await new Promise((r) => setTimeout(r, 120));
    report.steps.push({ step: `cmdA_${off}`, result: await call('key', { combo: 'cmd+a' }) });
    await new Promise((r) => setTimeout(r, 120));
    report.steps.push({ step: `typeName_${off}`, result: await call('type_text', { text: NAME }) });
    await new Promise((r) => setTimeout(r, 180));

    const shot = await call('screenshot', { windowId: chromeWin.windowId });
    const ok = /Name\s+ScreenHand/i.test(shot.text || '') || /ScreenHand\s*@screenhand_/i.test(shot.text || '');
    report.steps.push({ step: `verifyOffset_${off}`, result: { ok, snippet: (shot.text || '').slice(0, 1800) } });
    if (ok) break;
  }

  report.steps.push({ step: 'save', result: await call('click_text', { windowId: chromeWin.windowId, text: 'Save' }) });
  await new Promise((r) => setTimeout(r, 900));

  const finalShot = await call('screenshot', { windowId: chromeWin.windowId });
  report.steps.push({
    step: 'finalVerify',
    result: {
      hasScreenHandName: /ScreenHand\s*\(@screenhand_\)|Name\s+ScreenHand/i.test(finalShot.text || ''),
      hasBio: /open-source mcp server/i.test(finalShot.text || ''),
      hasGlobal: /Location\s+Global/i.test(finalShot.text || ''),
      snippet: (finalShot.text || '').slice(0, 2200)
    }
  });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, final: report.steps.find((s) => s.step === 'finalVerify')?.result }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
