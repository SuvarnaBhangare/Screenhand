import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029620157203763699';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-delete-post-202962-via-ocr', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  }).filter(Boolean);
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    return { windowId: Number(m[1]), appName: m[2], title: m[3], area: Number(m[6]) * Number(m[7]) };
  }).filter(Boolean);
}

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

try {
  await client.connect(transport);
  const log = {};
  log.focus = await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs((await call('browser_tabs', {})).text || '');
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  log.nav = await call('browser_navigate', { tabId: tab.id, url: URL });
  log.wait = await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 100', timeoutMs: 30000 });

  log.openMenu = await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const link = Array.from(document.querySelectorAll('a[href]')).find((a) => (a.getAttribute('href') || '').includes('/status/2029620157203763699'));
      const article = link ? link.closest('article') : document.querySelector('article');
      const caret = article?.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return { ok:false, reason:'no-caret' };
      caret.click();
      return { ok:true };
    })()`
  });

  const wins = parseWindows((await call('windows', {})).text || '').filter((w) => /Google Chrome/i.test(w.appName));
  const win = wins.find((w) => /screenhand|x\s*:/i.test(w.title || '')) || wins.sort((a,b)=>b.area-a.area)[0];
  if (!win) throw new Error('No Chrome window');
  log.window = win;

  await sleep(500);
  log.menuShot = await call('screenshot', { windowId: win.windowId });

  // click menu delete
  log.clickDelete = await call('click_text', { windowId: win.windowId, text: 'Delete' });
  await sleep(500);

  // click confirm delete
  log.confirmDelete = await call('click_text', { windowId: win.windowId, text: 'Delete' });
  await sleep(900);

  log.verifyNav = await call('browser_navigate', { tabId: tab.id, url: URL });
  log.verifyWait = await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 });
  log.verifyShot = await call('screenshot', { windowId: win.windowId });

  console.log(JSON.stringify({ ok: true, log }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
