import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_post_optimized_v1_report.json';
const POST_TEXT = `ScreenHand v2 is live.
Mac desktop automation for AI agents:
• OCR + screenshots
• Click/type across native apps
• Chrome automation + AppleScript

Try: https://screenhand.com
GitHub: github.com/manushi4/Screenhand

#ScreenHand #DesktopAutomation #MCP #macOS`;

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-post-optimized-v1', version: '1.0.0' }, { capabilities: {} });

const report = { startedAt: new Date().toISOString(), postText: POST_TEXT };
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
    const width = Number(m[6]); const height = Number(m[7]);
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

async function clickText(windowId, text) {
  const r = await call('click_text', { windowId, text });
  return { text, ...r };
}

try {
  await client.connect(transport);

  report.launch = await call('launch', { bundleId: 'com.google.Chrome' });
  report.focus = await call('focus', { bundleId: 'com.google.Chrome' });

  const tabsRes = await call('browser_tabs', {});
  report.tabs = tabsRes;
  const tabs = parseTabs(tabsRes.text || '');
  let xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));

  if (!xTab) {
    const open = await call('browser_open', { url: 'https://x.com/home' });
    report.openX = open;
    const tabsRes2 = await call('browser_tabs', {});
    const tabs2 = parseTabs(tabsRes2.text || '');
    xTab = tabs2.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  }
  if (!xTab) throw new Error('No X tab available');

  report.selectedTab = xTab;
  report.stealth = await call('browser_stealth', { tabId: xTab.id });
  report.navigateCompose = await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/compose/post' });
  report.waitCompose = await call('browser_wait', {
    tabId: xTab.id,
    condition: 'document.body && document.body.innerText.length > 40',
    timeoutMs: 30000
  });

  await sleep(1400);

  const winsRes = await call('windows', {});
  report.windows = winsRes;
  const wins = parseWindows(winsRes.text || '');
  const win = wins
    .filter((w) => /Google Chrome/i.test(w.appName) && w.width > 700 && w.height > 450)
    .sort((a, b) => b.area - a.area)[0];
  if (!win) throw new Error('Main Chrome window not found');
  report.window = win;

  report.preShot = await call('screenshot_file', { windowId: win.windowId });

  const clickAttempts = [];
  for (const label of ["What’s happening?", "What's happening?", 'Post', 'Add a comment']) {
    const r = await clickText(win.windowId, label);
    clickAttempts.push(r);
    if (r.ok) break;
  }
  report.clickAttempts = clickAttempts;

  await sleep(500);
  report.type = await call('type_text', { text: POST_TEXT });
  await sleep(600);
  report.submitHotkey = await call('key', { combo: 'cmd+enter' });
  await sleep(3600);

  report.navigateProfile = await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' });
  report.waitProfile = await call('browser_wait', {
    tabId: xTab.id,
    condition: 'document.body && document.body.innerText.length > 80',
    timeoutMs: 30000
  });

  const latest = await call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const a = Array.from(document.querySelectorAll('a[href*="/status/"]'));
      const own = a.map(x=>x.getAttribute('href')).filter(Boolean).find(h=>/^\/screenhand_\/status\/\d+/.test(h));
      const firstAny = a.map(x=>x.getAttribute('href')).filter(Boolean).find(h=>/\/status\/\d+/.test(h));
      const href = own || firstAny || null;
      return {
        url: location.href,
        href,
        full: href ? (href.startsWith('http') ? href : ('https://x.com' + href)) : null,
        title: document.title,
        snippet: (document.body?.innerText || '').slice(0, 600)
      };
    })()`
  });
  report.latest = latest;

  report.postShot = await call('screenshot_file', { windowId: win.windowId });
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    latest: j(latest.text || ''),
    preShot: report.preShot?.text || null,
    postShot: report.postShot?.text || null
  }, null, 2));
} catch (err) {
  report.error = String(err?.message || err);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: report.error }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
