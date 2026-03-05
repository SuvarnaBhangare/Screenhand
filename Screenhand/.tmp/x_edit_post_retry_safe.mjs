import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const STATUS_ID = '2029620157203763699';
const URL = `https://x.com/screenhand_/status/${STATUS_ID}`;
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_edit_post_retry_safe_report.json';
const EDIT_TEXT = 'ScreenHand helps AI agents automate real Mac workflows end-to-end with OCR, native app control, and Chrome automation via MCP. Explore: https://screenhand.com #AIAgents #MCP #macOS #Automation #ScreenHand';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-edit-post-retry-safe', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
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

const report = { startedAt: new Date().toISOString(), url: URL, editText: EDIT_TEXT, steps: [], errors: [] };
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
  if (!xTab) throw new Error('No X tab found');

  await step('navigateStatus', () => call('browser_navigate', { tabId: xTab.id, url: URL }));
  await step('waitBody', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));
  await sleep(700);

  await step('openMenuExactArticle', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const link = document.querySelector('a[href="/screenhand_/status/${STATUS_ID}"]') || document.querySelector('a[href*="/status/${STATUS_ID}"]');
      const article = link ? link.closest('article') : null;
      if (!article) return { ok: false, reason: 'target-article-not-found' };
      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return { ok: false, reason: 'caret-not-found' };
      caret.click();
      return { ok: true, articleText: clean(article.innerText || '').slice(0, 220) };
    })()`
  }));

  await sleep(450);

  const clickEdit = await step('clickEditFromMenu', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { ok: false, reason: 'menu-not-open' };
      const nodes = Array.from(menu.querySelectorAll('*'));
      const editNode = nodes.find((n) => /^edit$/i.test(clean(n.textContent || '')) || /^edit post$/i.test(clean(n.textContent || '')));
      if (!editNode) {
        const options = Array.from(new Set(nodes.map((n) => clean(n.textContent || '')).filter(Boolean))).slice(0, 30);
        return { ok: false, reason: 'edit-not-found', options };
      }
      const clickable = editNode.closest('[role="menuitem"], [tabindex="-1"], button, a, div') || editNode;
      clickable.click();
      return { ok: true, clickedText: clean(editNode.textContent || ''), clickableTag: clickable.tagName.toLowerCase() };
    })()`
  }));

  await sleep(700);

  const surface = await step('detectEditSurface', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const editorAny = document.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
      const inDialog = dialogs.find((d) => d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]')) || null;
      const scope = inDialog || document;
      const buttons = Array.from(scope.querySelectorAll('button,[role="button"]')).map((el) => {
        const label = clean(el.textContent || '') || clean(el.getAttribute('aria-label') || '');
        return {
          label,
          dt: el.getAttribute('data-testid') || null,
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true'
        };
      });
      const updateBtn = buttons.find((b) => !b.disabled && /update|save/i.test(b.label));
      const body = clean(document.body?.innerText || '');
      return {
        ok: true,
        editLabelSeen: /edit post/i.test(body),
        dialogCount: dialogs.length,
        inDialog: !!inDialog,
        editorFound: !!editorAny,
        updateFound: !!updateBtn,
        updateBtn,
        buttons: buttons.slice(0, 25),
        location: location.href
      };
    })()`
  }));

  const s = surface.ok ? j(surface.text || '{}') : null;
  if (!s?.editorFound || !s?.updateFound) {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, out: OUT, reason: 'No update/save edit surface found, aborted safely', clickEdit, surface: s }, null, 2));
    process.exit(0);
  }

  await step('replaceEditorText', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const text = ${JSON.stringify(EDIT_TEXT)};
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((d) => d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'));
      const scope = dialog || document;
      const box = scope.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
      if (!box) return { ok: false, reason: 'editor-not-found' };
      box.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);
      const val = clean(box.innerText || box.textContent || '');
      return { ok: true, len: val.length, preview: val.slice(0, 220) };
    })()`
  }));

  await sleep(220);

  await step('clickUpdateSave', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((d) => d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'));
      const scope = dialog || document;
      const btn = Array.from(scope.querySelectorAll('button,[role="button"]')).find((el) => {
        const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
        if (disabled) return false;
        const label = clean(el.textContent || '') || clean(el.getAttribute('aria-label') || '');
        return /update|save/i.test(label);
      });
      if (!btn) return { ok: false, reason: 'update-save-button-not-found' };
      const label = clean(btn.textContent || '') || clean(btn.getAttribute('aria-label') || '');
      btn.click();
      return { ok: true, clicked: label, dt: btn.getAttribute('data-testid') || null };
    })()`
  }));

  await sleep(1700);

  await step('reloadStatus', () => call('browser_navigate', { tabId: xTab.id, url: URL }));
  await step('waitReload', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));

  const verify = await step('verifyUpdate', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body?.innerText || '');
      return {
        hasNewPhrase: body.includes('end-to-end with OCR') || body.includes('#Automation #ScreenHand'),
        hasOldTryIt: body.includes('Try it:'),
        snippet: body.slice(0, 1400)
      };
    })()`
  }));

  report.verify = verify.ok ? j(verify.text || '{}') : null;
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
