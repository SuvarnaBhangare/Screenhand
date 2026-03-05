import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029620157203763699';
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_edit_latest_post_apply_report.json';
const EDIT_TEXT = 'ScreenHand helps AI agents automate real Mac workflows end-to-end: OCR vision, native app control, Chrome automation, and AppleScript via MCP. Explore: https://screenhand.com #AIAgents #MCP #macOS #Automation';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-edit-latest-post-apply', version: '1.0.0' }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { startedAt: new Date().toISOString(), url: URL, editText: EDIT_TEXT, steps: [], errors: [] };

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3], raw: line } : null;
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

async function step(name, fn) {
  const result = await fn();
  report.steps.push({ step: name, result });
  return result;
}

try {
  await client.connect(transport);

  await step('focusChrome', () => call('focus', { bundleId: 'com.google.Chrome' }));
  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.xTab = xTab;

  await step('navigateTweet', () => call('browser_navigate', { tabId: xTab.id, url: URL }));
  await step('waitBody', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 25000 }));
  await sleep(700);

  const openMenu = await step('openTweetMenu', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const articles = Array.from(document.querySelectorAll('article'));
      const target = articles.find(a => /ScreenHand helps AI agents automate real Mac workflows/i.test(clean(a.innerText || ''))) || articles[0];
      if (!target) return { ok: false, reason: 'no-article' };
      const caret = target.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return { ok: false, reason: 'no-caret' };
      caret.click();
      return { ok: true, articlePreview: clean(target.innerText || '').slice(0, 180) };
    })()`
  }));

  await sleep(500);

  const clickEdit = await step('clickEditPost', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], div[role="menuitem"], div[tabindex="-1"], button, span'));
      const hit = menuItems.find((el) => {
        const txt = clean(el.textContent || '');
        return /^edit post$/i.test(txt) || /^edit$/i.test(txt) || /edit post/i.test(txt);
      });
      if (!hit) {
        const options = menuItems.map((el) => clean(el.textContent || '')).filter(Boolean).slice(0, 30);
        return { ok: false, reason: 'edit-option-not-found', options };
      }
      const clickable = hit.closest('[role="menuitem"]') || hit.closest('div[tabindex="-1"]') || hit;
      clickable.click();
      return { ok: true, clicked: clean(hit.textContent || '') };
    })()`
  }));

  if (!clickEdit.ok || /edit-option-not-found/i.test(clickEdit.text || '')) {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, out: OUT, reason: 'Edit option not available on this post/account/time window', clickEdit }, null, 2));
    process.exit(0);
  }

  await sleep(700);

  await step('replaceText', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const text = ${JSON.stringify(EDIT_TEXT)};
      const box = document.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
      if (!box) return { ok: false, reason: 'editor-not-found' };
      box.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
      const val = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
      return { ok: true, editorPreview: val.slice(0, 220), len: val.length };
    })()`
  }));

  await sleep(300);

  await step('submitUpdate', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const byTestId = document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      const textBtn = Array.from(document.querySelectorAll('button,[role="button"]')).find((el) => {
        const label = clean(el.textContent || '') + ' ' + clean(el.getAttribute('aria-label') || '');
        return /update|save/i.test(label);
      });
      const btn = byTestId || textBtn;
      if (!btn) return { ok: false, reason: 'update-button-not-found' };
      const ariaDisabled = btn.getAttribute('aria-disabled');
      if (ariaDisabled === 'true' || btn.disabled) return { ok: false, reason: 'update-button-disabled' };
      btn.click();
      return { ok: true, clicked: clean(btn.textContent || btn.getAttribute('aria-label') || ''), testid: btn.getAttribute('data-testid') || null };
    })()`
  }));

  await sleep(1800);

  await step('reloadTweet', () => call('browser_navigate', { tabId: xTab.id, url: URL }));
  await sleep(900);

  const verify = await step('verifyText', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body?.innerText || '');
      return {
        hasUpdatedPhrase: body.includes('end-to-end') || body.includes('#Automation'),
        hasOldPhrase: body.includes('Try it:'),
        snippet: body.slice(0, 1400)
      };
    })()`
  }));

  report.verify = verify.ok ? j(verify.text || '') : null;
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
