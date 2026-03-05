import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_verify_profile_public_report.json';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-verify-profile-public', version: '1.0.0' }, { capabilities: {} });

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
      area: Number(m[6]) * Number(m[7]),
      raw: line
    };
  }).filter(Boolean);
}

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };

try {
  await client.connect(transport);
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  report.steps.push({ step: 'tabs', result: tabsRes });
  if (tabsRes.ok) {
    const xLine = tabsRes.text.split('\n').find((l) => /x\.com|twitter\.com/i.test(l));
    const m = xLine?.match(/^\[([^\]]+)\]/);
    if (m) report.steps.push({ step: 'navigateProfile', result: await call('browser_navigate', { tabId: m[1], url: 'https://x.com/screenhand_' }) });
  }

  await new Promise((r) => setTimeout(r, 900));

  const winsRes = await call('windows', {});
  const wins = parseWindows(winsRes.text || '');
  const chromeCandidates = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 500 && w.height > 300);
  const chromeWin = chromeCandidates.sort((a, b) => b.area - a.area)[0]
    || wins.find((w) => /Google Chrome/i.test(w.appName));
  if (!chromeWin) throw new Error('No Chrome window');
  report.chromeWindow = chromeWin;

  // Try to close edit modal if still open
  report.steps.push({ step: 'closeModalMaybe', result: await call('key', { combo: 'escape' }) });
  await new Promise((r) => setTimeout(r, 500));

  const shot = await call('screenshot', { windowId: chromeWin.windowId });
  const text = shot.text || '';
  report.steps.push({
    step: 'ocr',
    result: {
      hasPublicNameScreenHand: /ScreenHand\s*@screenhand_/i.test(text) || /@screenhand_\s*\n\s*ScreenHand/i.test(text),
      hasPublicNameUsha: /Usha\s*@screenhand_/i.test(text) || /@screenhand_\s*\n\s*Usha/i.test(text),
      hasBioKeyword: /open-source mcp server|screenhand\.com/i.test(text.toLowerCase()),
      snippet: text.slice(0, 2400)
    }
  });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, final: report.steps.find((s) => s.step === 'ocr')?.result }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
