import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_post_optimized_ocr_report.json';
const POST_TEXT = `Shipping update from ScreenHand (Mar 5, 2026):
Automate real Mac workflows with AI agents across apps.
- OCR + screenshot reading
- Native click/type/scroll controls
- Chrome + AppleScript automation via MCP

Learn more: https://screenhand.com
Open source: github.com/manushi4/Screenhand

#ScreenHand #MacAutomation #AIAgents #MCP #Productivity`;

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-post-optimized-ocr', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    return { windowId: Number(m[1]), appName: m[2], title: m[3], width, height, area: width * height, raw: line };
  }).filter(Boolean);
}

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

const report = { startedAt: new Date().toISOString(), postText: POST_TEXT, steps: [], errors: [] };

async function step(name, fn) {
  const result = await fn();
  report.steps.push({ step: name, result });
  return result;
}

try {
  await client.connect(transport);

  await step('focusChrome', () => call('focus', { bundleId: 'com.google.Chrome' }));

  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('browser_tabs failed');
  const tabs = parseTabs(tabsRes.text || '');
  const xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found');
  report.xTab = xTab;

  await step('navCompose', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/compose/post' }));
  await sleep(1200);

  const winsRes = await step('windows', () => call('windows', {}));
  if (!winsRes.ok) throw new Error('windows failed');
  const chromeWins = parseWindows(winsRes.text || '')
    .filter((w) => /Google Chrome/i.test(w.appName) && w.width > 600 && w.height > 400);
  const win =
    chromeWins.find((w) => (w.title || '') === (xTab.title || '')) ||
    chromeWins.find((w) => /x\.com|home\s*\/\s*x|compose|profile/i.test(w.title || '')) ||
    chromeWins.find((w) => !/about:blank/i.test(w.title || '')) ||
    chromeWins.sort((a, b) => b.area - a.area)[0];
  if (!win) throw new Error('Main Chrome window not found');
  report.chromeWindow = win;

  await step('preShot', () => call('screenshot_file', { windowId: win.windowId }));

  const clickTry1 = await step('clickComposerCurly', () => call('click_text', { windowId: win.windowId, text: 'What’s happening?' }));
  if (!clickTry1.ok || /Not found|Window not found/i.test(clickTry1.text || '')) {
    await step('clickComposerPlain', () => call('click_text', { windowId: win.windowId, text: "What's happening?" }));
  }

  await sleep(400);
  await step('selectAll', () => call('key', { combo: 'cmd+a' }));
  await sleep(120);
  await step('clearComposer', () => call('key', { combo: 'backspace' }));
  await sleep(220);
  await step('typeText', () => call('type_text', { text: POST_TEXT }));
  await sleep(500);
  await step('submitCmdEnter', () => call('key', { combo: 'cmd+enter' }));

  await sleep(3500);

  await step('navProfile', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' }));
  await sleep(1200);

  const latest = await step('latestLink', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/status/"]')).map(a => a.getAttribute('href')).filter(Boolean);
      const own = links.find(h => h.startsWith('/screenhand_/status/'));
      const any = links.find(h => h.includes('/status/'));
      const href = own || any || null;
      return { href, url: href ? ('https://x.com' + href) : null, page: location.href, title: document.title };
    })()`
  }));

  const afterShot = await step('afterShot', () => call('screenshot', { windowId: win.windowId }));
  report.verify = {
    latest: latest.ok ? j(latest.text || '') : null,
    snippet: (afterShot.ok ? (afterShot.text || '') : '').slice(0, 2000)
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
