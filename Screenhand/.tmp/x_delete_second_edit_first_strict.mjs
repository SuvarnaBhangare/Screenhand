import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DELETE_ID = '2029620157203763699';
const EDIT_ID = '2029617823178424794';
const HANDLE = 'screenhand_';
const EDIT_TEXT = 'Updated by ScreenHand team: AI agents can automate real Mac workflows end-to-end with OCR vision, native app control, and Chrome automation via MCP. Learn more: https://screenhand.com #AIAgents #MCP #macOS';
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_delete_second_edit_first_strict_report.json';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-delete-second-edit-first-strict', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

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

const report = { startedAt: new Date().toISOString(), deleteId: DELETE_ID, editId: EDIT_ID, steps: [], errors: [] };
async function step(name, fn) {
  const result = await fn();
  report.steps.push({ step: name, result });
  return result;
}

async function navigate(tabId, id, label) {
  const url = `https://x.com/${HANDLE}/status/${id}`;
  await step(`${label}:navigate`, () => call('browser_navigate', { tabId, url }));
  await step(`${label}:wait`, () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 }));
}

async function deletePost(tabId, id) {
  await navigate(tabId, id, 'delete');

  const del = await step('delete:run', () => call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const sid = ${JSON.stringify(id)};

      const link = Array.from(document.querySelectorAll('a[href]')).find((a) => {
        const h = a.getAttribute('href') || '';
        return h === '/${HANDLE}/status/' + sid || h.includes('/status/' + sid);
      });
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'no-article' });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'no-caret' });
      caret.click();

      const started = Date.now();
      function openDelete() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - started < 2200) return setTimeout(openDelete, 120);
          return resolve({ ok:false, reason:'menu-not-open' });
        }
        const nodes = Array.from(menu.querySelectorAll('*'));
        const delNode = nodes.find((n) => /delete/i.test(clean(n.textContent || '')));
        if (!delNode) return resolve({ ok:false, reason:'delete-option-not-found' });
        const clickNode = delNode.closest('[role="menuitem"], [tabindex="-1"], button, div') || delNode;
        clickNode.click();

        const cStart = Date.now();
        function confirmDelete() {
          const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
          const confirm = buttons.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /^delete\b/i.test(label);
          });
          if (!confirm) {
            if (Date.now() - cStart < 2600) return setTimeout(confirmDelete, 120);
            return resolve({ ok:false, reason:'delete-confirm-not-found' });
          }
          const label = clean(confirm.textContent || '') || clean(confirm.getAttribute('aria-label') || '');
          confirm.click();
          setTimeout(() => resolve({ ok:true, confirmed: label }), 450);
        }
        confirmDelete();
      }
      openDelete();
    }))()`
  }));

  await step('delete:verify:nav', () => call('browser_navigate', { tabId, url: `https://x.com/${HANDLE}/status/${id}` }));
  await step('delete:verify:wait', () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));
  const ver = await step('delete:verify', () => call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return {
        url: location.href,
        deletedLike: txt.includes('deleted') || txt.includes('post not found') || txt.includes('doesn\'t exist') || txt.includes('does not exist'),
        snippet: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 900)
      };
    })()`
  }));

  return { run: del, verify: ver.ok ? j(ver.text || '{}') : ver };
}

async function editPost(tabId, id) {
  await navigate(tabId, id, 'edit');

  const editRun = await step('edit:run', () => call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const sid = ${JSON.stringify(id)};
      const text = ${JSON.stringify(EDIT_TEXT)};

      const link = Array.from(document.querySelectorAll('a[href]')).find((a) => {
        const h = a.getAttribute('href') || '';
        return h === '/${HANDLE}/status/' + sid || h.includes('/status/' + sid);
      });
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'no-article' });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'no-caret' });
      caret.click();

      const s0 = Date.now();
      function openEdit() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - s0 < 2400) return setTimeout(openEdit, 120);
          return resolve({ ok:false, reason:'menu-not-open' });
        }
        const nodes = Array.from(menu.querySelectorAll('*'));
        const editNode = nodes.find((n) => {
          const txt = clean(n.textContent || '');
          return /^edit$/i.test(txt) || /^edit post$/i.test(txt) || /edit post/i.test(txt);
        });
        if (!editNode) return resolve({ ok:false, reason:'edit-option-not-found' });
        const clickNode = editNode.closest('[role="menuitem"], [tabindex="-1"], button, div') || editNode;
        clickNode.click();

        const s1 = Date.now();
        function applyEdit() {
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
          const dialog = dialogs.find((d) => d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]')) || null;
          const root = dialog || document;
          const box = root.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');

          // Strict: require Update/Save button; reject Reply to avoid accidental reply
          const buttons = Array.from(root.querySelectorAll('button,[role="button"]'));
          const updateBtn = buttons.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /update|save/i.test(label);
          });
          const replyBtn = buttons.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            return /reply/i.test(label);
          });

          if (!box || !updateBtn) {
            if (Date.now() - s1 < 2800) return setTimeout(applyEdit, 120);
            return resolve({ ok:false, reason:'edit-surface-not-found', hasBox: !!box, hasUpdate: !!updateBtn, hasReply: !!replyBtn });
          }

          box.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(box);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, text);

          const typed = clean(box.innerText || box.textContent || '');
          const lbl = clean(updateBtn.textContent || '') || clean(updateBtn.getAttribute('aria-label') || '');
          updateBtn.click();
          setTimeout(() => resolve({ ok:true, clicked: lbl, preview: typed.slice(0, 240), len: typed.length }), 450);
        }
        applyEdit();
      }
      openEdit();
    }))()`
  }));

  await step('edit:verify:nav', () => call('browser_navigate', { tabId, url: `https://x.com/${HANDLE}/status/${id}` }));
  await step('edit:verify:wait', () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 }));
  const verify = await step('edit:verify', () => call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      return {
        url: location.href,
        hasNew: txt.includes('Updated by ScreenHand team') || txt.includes('#Automation') || txt.includes('Learn more: https://screenhand.com'),
        snippet: txt.slice(0, 1000)
      };
    })()`
  }));

  return { run: editRun, verify: verify.ok ? j(verify.text || '{}') : verify };
}

try {
  await client.connect(transport);
  await step('focus', () => call('focus', { bundleId: 'com.google.Chrome' }));
  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');

  report.deleteResult = await deletePost(xTab.id, DELETE_ID);
  report.editResult = await editPost(xTab.id, EDIT_ID);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, deleteResult: report.deleteResult, editResult: report.editResult }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
