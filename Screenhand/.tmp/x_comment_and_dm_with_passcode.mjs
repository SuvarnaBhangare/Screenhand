import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_comment_and_dm_with_passcode_report.json';
const STATUS_URL = 'https://x.com/screenhand_/status/2029617823178424794';
const REPLY_TEXT = 'ScreenHand automation comment test (submitted).';
const CHAT_PASSCODE = '1234';
const DM_DRAFT = 'ScreenHand DM draft after passcode unlock (not sent).';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-comment-and-dm-with-passcode', version: '1.0.0' }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
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
    return { windowId: Number(m[1]), appName: m[2], title: m[3], area: Number(m[6]) * Number(m[7]), raw: line };
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

  await step('launchChrome', () => call('launch', { bundleId: 'com.google.Chrome' }));
  await step('focusChrome', () => call('focus', { bundleId: 'com.google.Chrome' }));
  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.xTab = xTab;

  let winsRes = await step('windows', () => call('windows', {}));
  let wins = parseWindows(winsRes.text || '').filter((w) => /Google Chrome/i.test(w.appName));
  if (!wins.length) {
    await step('focusChromeRetry', () => call('focus', { bundleId: 'com.google.Chrome' }));
    await sleep(300);
    winsRes = await step('windowsRetry', () => call('windows', {}));
    wins = parseWindows(winsRes.text || '').filter((w) => /Google Chrome/i.test(w.appName));
  }
  const win = wins.find((w) => /\/ X|ScreenHand on X:|Home \/ X|\bX\b/i.test(w.title || '') && !/about:blank/i.test(w.title || ''))
    || wins.find((w) => !/about:blank/i.test(w.title || ''))
    || wins.sort((a, b) => b.area - a.area)[0];
  if (!win) throw new Error('No Chrome window');
  report.window = win;

  // Comment submit
  await step('comment:navigateStatus', () => call('browser_navigate', { tabId: xTab.id, url: STATUS_URL }));
  await step('comment:waitStatus', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 }));
  await step('comment:shotBefore', () => call('screenshot', { windowId: win.windowId }));

  await step('comment:openComposer', () => call('click_text', { windowId: win.windowId, text: 'Post your reply' }));
  await sleep(200);
  await step('comment:type', () => call('type_text', { text: REPLY_TEXT }));
  await sleep(220);

  const submitByDom = await step('comment:submitByDom', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const btn = document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      if (!btn) return { ok:false, reason:'reply-button-not-found' };
      const disabled = !!btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      if (disabled) return { ok:false, reason:'reply-button-disabled' };
      btn.click();
      return { ok:true, clicked: btn.getAttribute('data-testid') || 'reply-button' };
    })()`
  }));

  const submitParsed = submitByDom.ok ? j(submitByDom.text || '{}') : null;
  if (!submitParsed?.ok) {
    await step('comment:submitFallbackOCR', () => call('click_text', { windowId: win.windowId, text: 'Reply' }));
  }

  await sleep(900);
  await step('comment:shotAfter', () => call('screenshot', { windowId: win.windowId }));

  // DM with passcode
  await step('dm:navigate', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/i/chat' }));
  await step('dm:wait', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 40', timeoutMs: 30000 }));
  await step('dm:shotBefore', () => call('screenshot', { windowId: win.windowId }));

  // Passcode recovery flow
  await step('dm:clickEnterPasscode', () => call('click_text', { windowId: win.windowId, text: 'Enter Passcode' }));
  await sleep(180);
  await step('dm:typePasscode', () => call('type_text', { text: CHAT_PASSCODE }));
  await sleep(120);
  await step('dm:pressEnterPasscode', () => call('key', { combo: 'enter' }));
  await sleep(900);
  await step('dm:shotAfterPasscode', () => call('screenshot', { windowId: win.windowId }));

  // Open new chat and type draft, no send
  const openNewChat = await step('dm:openNewChat', () => call('click_text', { windowId: win.windowId, text: 'New chat' }));
  if (!/Clicked/i.test(openNewChat.text || '')) {
    await step('dm:openStartConversationFallback', () => call('click_text', { windowId: win.windowId, text: 'Start Conversation' }));
  }
  await sleep(300);
  await step('dm:typeDraftNoSend', () => call('type_text', { text: DM_DRAFT }));
  await step('dm:shotAfterDraft', () => call('screenshot', { windowId: win.windowId }));

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
