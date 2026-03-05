import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029620157203763699';
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_edit_post_strict_report.json';
const EDIT_TEXT = 'ScreenHand helps AI agents automate real Mac workflows end-to-end with OCR, native app control, and Chrome automation via MCP. Explore: https://screenhand.com #AIAgents #MCP #macOS #Automation';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-edit-post-strict', version: '1.0.0' }, { capabilities: {} });
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
  await step('focus', () => call('focus', { bundleId: 'com.google.Chrome' }));
  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('tabs failed');
  const tab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  await step('navigate', () => call('browser_navigate', { tabId: tab.id, url: URL }));
  await step('wait', () => call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 25000 }));
  await sleep(600);

  await step('openMenu', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const article = Array.from(document.querySelectorAll('article')).find(a => /ScreenHand helps AI agents automate real Mac workflows/i.test(clean(a.innerText || ''))) || document.querySelector('article');
      if (!article) return { ok: false, reason: 'no-article' };
      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return { ok: false, reason: 'no-caret' };
      caret.click();
      return { ok: true };
    })()`
  }));

  await sleep(450);

  const clickEdit = await step('clickEditMenuItem', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const menu = document.querySelector('div[role="menu"]');
      if (!menu) return { ok: false, reason: 'menu-not-open' };
      const items = Array.from(menu.querySelectorAll('[role="menuitem"], div[tabindex="-1"], button'));
      const hit = items.find((el) => {
        const txt = clean(el.textContent || '');
        return /^edit$/i.test(txt) || /^edit post$/i.test(txt) || /edit post/i.test(txt);
      });
      if (!hit) {
        return { ok: false, reason: 'edit-item-not-found', options: items.map((el) => clean(el.textContent || '')).filter(Boolean).slice(0, 20) };
      }
      hit.click();
      return { ok: true, clicked: clean(hit.textContent || '') };
    })()`
  }));

  await sleep(650);

  const surface = await step('detectEditSurface', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /edit/i.test(clean(d.innerText || '')) || d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]')) || null;
      const root = dialog || document;
      const buttons = Array.from(root.querySelectorAll('button,[role="button"]')).map((el) => ({
        text: clean(el.textContent || ''),
        aria: clean(el.getAttribute('aria-label') || ''),
        dt: el.getAttribute('data-testid') || null,
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true'
      }));
      const updateBtn = buttons.find((b) => /update|save/i.test((b.text || '') + ' ' + (b.aria || '')) && !b.disabled)
        || buttons.find((b) => (b.dt === 'tweetButton' || b.dt === 'tweetButtonInline') && !b.disabled && /update|save/i.test((b.text || '') + ' ' + (b.aria || '')));
      const editor = root.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
      return {
        ok: true,
        dialogFound: !!dialog,
        updateFound: !!updateBtn,
        updateBtn,
        editorFound: !!editor,
        bodyHasEditLabel: /edit post/i.test(clean(document.body?.innerText || '')),
        sampleButtons: buttons.slice(0, 20)
      };
    })()`
  }));

  const surfaceData = surface.ok ? j(surface.text || '{}') : null;
  if (!surfaceData?.updateFound || !surfaceData?.editorFound) {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, out: OUT, reason: 'No safe edit surface (Update/Save) detected; aborted to avoid accidental reply', clickEdit, surface: surfaceData }, null, 2));
    process.exit(0);
  }

  await step('replaceText', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const text = ${JSON.stringify(EDIT_TEXT)};
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /edit/i.test(clean(d.innerText || '')) || d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'));
      const root = dialog || document;
      const box = root.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
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

  await sleep(200);

  await step('submitUpdate', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /edit/i.test(clean(d.innerText || '')) || d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'));
      const root = dialog || document;
      const buttons = Array.from(root.querySelectorAll('button,[role="button"]'));
      const btn = buttons.find((el) => {
        const label = clean(el.textContent || '') + ' ' + clean(el.getAttribute('aria-label') || '');
        const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
        return !disabled && /update|save/i.test(label);
      });
      if (!btn) return { ok: false, reason: 'update-btn-not-found' };
      const label = clean(btn.textContent || '') || clean(btn.getAttribute('aria-label') || '');
      btn.click();
      return { ok: true, clicked: label, dt: btn.getAttribute('data-testid') || null };
    })()`
  }));

  await sleep(1400);
  const verify = await step('verify', () => call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body?.innerText || '');
      return {
        hasNew: body.includes('end-to-end with OCR') || body.includes('#Automation'),
        hasOld: body.includes('Try it:'),
        snippet: body.slice(0, 1200)
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
