import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_post_optimized_fast_report.json';
const POST_TEXT = `ScreenHand v2 is live.
Mac desktop automation for AI agents:
• OCR + screenshots
• Click/type across native apps
• Chrome automation + AppleScript

Try: https://screenhand.com
GitHub: github.com/manushi4/Screenhand

#ScreenHand #DesktopAutomation #MCP #macOS`;

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-post-optimized-fast', version: '1.0.0' }, { capabilities: {} });

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
  const res = await client.callTool({ name, arguments: args });
  return t(res);
}

async function clickText(windowId, text) {
  try {
    const textOut = await call('click_text', { windowId, text });
    return { ok: true, text, out: textOut };
  } catch (err) {
    return { ok: false, text, error: String(err?.message || err) };
  }
}

try {
  await client.connect(transport);

  report.focus = await call('focus', { app: 'Google Chrome' });

  const tabs = parseTabs(await call('browser_tabs', {}));
  let xTab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) {
    await call('browser_open', { url: 'https://x.com/home' });
    const tabs2 = parseTabs(await call('browser_tabs', {}));
    xTab = tabs2.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  }
  if (!xTab) throw new Error('No X tab found');
  report.tab = xTab;

  report.navHome = await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/home' });
  report.waitHome = await call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 20000 });

  report.openCompose = j(await call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean=(s)=>(s||'').replace(/\s+/g,' ').trim();
      const btn = Array.from(document.querySelectorAll('button,[role="button"],a')).find(el => /^post$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||'') || /^tweet$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
      if (!btn) return { ok:false, reason:'post-button-not-found' };
      btn.click();
      return { ok:true };
    })()`
  }));

  await call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 12000 });
  await sleep(800);

  const wins = parseWindows(await call('windows', {}));
  const win = wins.filter((w) => /Google Chrome/i.test(w.appName) && w.width > 700 && w.height > 450).sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No main Chrome window');
  report.window = win;

  report.clickComposerAttempts = [];
  for (const candidate of ["What’s happening?", "What's happening?", 'Post']) {
    const r = await clickText(win.windowId, candidate);
    report.clickComposerAttempts.push(r);
    if (r.ok && /Clicked/i.test(r.out || '')) break;
  }

  await sleep(400);
  report.type = await call('type_text', { text: POST_TEXT });
  await sleep(450);
  report.submit = await call('key', { combo: 'cmd+enter' });
  await sleep(3200);

  report.navProfile = await call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/screenhand_' });
  report.waitProfile = await call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 20000 });

  report.latest = j(await call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/status/"]')).map(a=>a.getAttribute('href')).filter(Boolean);
      const own = links.find(h => /^\/screenhand_\/status\/\d+/.test(h));
      const any = links.find(h => /\/status\/\d+/.test(h));
      const href = own || any || null;
      return { href, url: href ? ('https://x.com' + href) : null, page: location.href, title: document.title };
    })()`
  }));

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, latest: report.latest, openCompose: report.openCompose }, null, 2));
} catch (err) {
  report.error = String(err?.message || err);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: report.error }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
