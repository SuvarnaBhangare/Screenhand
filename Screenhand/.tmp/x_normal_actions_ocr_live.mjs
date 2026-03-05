import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_normal_actions_ocr_live_report.json';
const STATUS_URL = 'https://x.com/screenhand_/status/2029617823178424794';
const REPLY_TEXT = 'ScreenHand automation test comment via MCP.';
const DM_DRAFT = 'ScreenHand DM smoke-test draft (not sent).';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-normal-actions-ocr-live', version: '1.0.0' }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
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
    return {
      windowId: Number(m[1]),
      appName: m[2],
      title: m[3],
      w: Number(m[6]),
      h: Number(m[7]),
      area: Number(m[6]) * Number(m[7]),
      raw: line
    };
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

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };
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
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.xTab = xTab;

  await step('navStatus', () => call('browser_navigate', { tabId: xTab.id, url: STATUS_URL }));
  await step('waitStatus', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 }));

  const winsRes = await step('windows', () => call('windows', {}));
  const wins = parseWindows(winsRes.text || '').filter((w) => /Google Chrome/i.test(w.appName));
  const win = wins.find((w) => /ScreenHand on X:|\/ X|Home \/ X/i.test(w.title || '') && !/about:blank/i.test(w.title || ''))
    || wins.find((w) => !/about:blank/i.test(w.title || ''))
    || wins.sort((a, b) => b.area - a.area)[0];
  if (!win) throw new Error('No Chrome window');
  report.window = win;

  await step('statusShotBefore', () => call('screenshot', { windowId: win.windowId }));

  // Like toggle via keyboard shortcut (reversible)
  await step('likeShortcut1', () => call('key', { combo: 'l' }));
  await sleep(450);
  await step('likeShotAfter1', () => call('screenshot', { windowId: win.windowId }));
  await step('likeShortcut2Revert', () => call('key', { combo: 'l' }));
  await sleep(450);
  await step('likeShotAfterRevert', () => call('screenshot', { windowId: win.windowId }));

  // Comment submit on own post
  await step('commentClickComposer', () => call('click_text', { windowId: win.windowId, text: 'Post your reply' }));
  await sleep(220);
  await step('commentType', () => call('type_text', { text: REPLY_TEXT }));
  await sleep(220);
  await step('commentSubmit', () => call('click_text', { windowId: win.windowId, text: 'Reply' }));
  await sleep(900);
  await step('statusShotAfterComment', () => call('screenshot', { windowId: win.windowId }));

  // DM open + draft (no send)
  await step('dmNavigate', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/messages' }));
  await step('dmWait', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 40', timeoutMs: 30000 }));
  await sleep(500);
  await step('dmShotBefore', () => call('screenshot', { windowId: win.windowId }));

  // Try open new message if visible; if not, click Search and type draft text only
  const dmOpen = await step('dmOpenNewMessageMaybe', () => call('click_text', { windowId: win.windowId, text: 'New message' }));
  if (!/Clicked/i.test(dmOpen.text || '')) {
    await step('dmClickSearchFallback', () => call('click_text', { windowId: win.windowId, text: 'Search' }));
  }
  await sleep(250);
  await step('dmTypeDraftNoSend', () => call('type_text', { text: DM_DRAFT }));
  await step('dmShotAfterDraft', () => call('screenshot', { windowId: win.windowId }));

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
