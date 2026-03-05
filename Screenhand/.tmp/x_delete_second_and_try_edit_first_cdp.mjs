import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HANDLE = 'screenhand_';
const DELETE_ID = '2029620157203763699';
const EDIT_ID = '2029617823178424794';
const NEW_TEXT = 'Updated by ScreenHand team: AI agents can automate real Mac workflows end-to-end with OCR, native app control, and Chrome automation via MCP. Learn more: https://screenhand.com #AIAgents #MCP #macOS #ScreenHand';
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_delete_second_and_try_edit_first_cdp_report.json';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-delete-second-and-try-edit-first-cdp', version: '1.0.0' }, { capabilities: {} });

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

const report = { startedAt: new Date().toISOString(), steps: [], errors: [] };
async function step(name, fn) {
  const result = await fn();
  report.steps.push({ step: name, result });
  return result;
}

function statusUrl(id) { return `https://x.com/${HANDLE}/status/${id}`; }

async function openMenuForStatus(tabId, statusId, label) {
  return step(`${label}:openMenu`, () => call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const sid = ${JSON.stringify(statusId)};
      const hrefA = '/${HANDLE}/status/' + sid;

      function findArticle() {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const hit = links.find((a) => {
          const h = a.getAttribute('href') || '';
          return h === hrefA || h.includes('/status/' + sid);
        });
        return hit ? hit.closest('article') : null;
      }

      const article = findArticle() || document.querySelector('article');
      const carets = article
        ? Array.from(article.querySelectorAll('[data-testid="caret"], button[aria-label="More"]'))
        : [];
      const fallbackCarets = Array.from(document.querySelectorAll('[data-testid="caret"], button[aria-label="More"]'));
      const caret = carets[0] || fallbackCarets[0] || null;
      if (!caret) {
        return resolve({ ok:false, reason:'no-caret', url: location.href, articleFound: !!article, allCarets: fallbackCarets.length });
      }
      caret.click();

      const started = Date.now();
      function waitMenu() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - started < 2500) return setTimeout(waitMenu, 120);
          return resolve({ ok:false, reason:'menu-not-open', url: location.href });
        }
        const opts = Array.from(new Set(Array.from(menu.querySelectorAll('*')).map((n) => clean(n.textContent || '')).filter(Boolean))).slice(0, 30);
        resolve({ ok:true, url: location.href, options: opts });
      }
      waitMenu();
    }))()`
  }));
}

async function clickMenuItem(tabId, pattern, label) {
  return step(`${label}:clickMenuItem:${pattern}`, () => call('browser_js', {
    tabId,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { ok:false, reason:'menu-missing' };
      const re = new RegExp(${JSON.stringify(pattern)}, 'i');
      const nodes = Array.from(menu.querySelectorAll('*'));
      const hit = nodes.find((n) => re.test(clean(n.textContent || '')));
      if (!hit) {
        const opts = Array.from(new Set(nodes.map((n) => clean(n.textContent || '')).filter(Boolean))).slice(0, 30);
        return { ok:false, reason:'item-not-found', opts };
      }
      const clickNode = hit.closest('[role="menuitem"], [tabindex="-1"], button, a, div') || hit;
      clickNode.click();
      return { ok:true, clicked: clean(hit.textContent || '') };
    })()`
  }));
}

async function confirmDelete(tabId) {
  return step('delete:confirm', () => call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const started = Date.now();
      function tick() {
        const byTest = document.querySelector('[data-testid="confirmationSheetConfirm"]');
        if (byTest) {
          byTest.click();
          return resolve({ ok:true, via:'confirmationSheetConfirm' });
        }
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        const dialog = dialogs.find((d) => /delete post/i.test(clean(d.innerText || ''))) || dialogs[0] || null;
        if (dialog) {
          const btns = Array.from(dialog.querySelectorAll('button,[role="button"]'));
          const del = btns.find((b) => {
            const lbl = clean(b.textContent || '') || clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /^delete$/i.test(lbl);
          });
          if (del) {
            const lbl = clean(del.textContent || '') || clean(del.getAttribute('aria-label') || '');
            del.click();
            return resolve({ ok:true, via:'dialog-delete', label: lbl });
          }
        }
        if (Date.now() - started < 3200) return setTimeout(tick, 120);
        resolve({ ok:false, reason:'confirm-not-found' });
      }
      tick();
    }))()`
  }));
}

async function verifyDeleted(tabId, id) {
  await step('delete:verify:navigate', () => call('browser_navigate', { tabId, url: statusUrl(id) }));
  await step('delete:verify:wait', () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));
  return step('delete:verify:dom', () => call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return {
        url: location.href,
        deletedLike: txt.includes('this post was deleted') || txt.includes('post not found') || txt.includes("doesn't exist") || txt.includes('does not exist') || txt.includes('try searching for something else'),
        snippet: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 900)
      };
    })()`
  }));
}

async function tryEdit(tabId, id) {
  await step('edit:navigate', () => call('browser_navigate', { tabId, url: statusUrl(id) }));
  await step('edit:wait', () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));

  const menuOpen = await openMenuForStatus(tabId, id, 'edit');
  if (!menuOpen.ok || (menuOpen.ok && !j(menuOpen.text || '{}')?.ok)) {
    return { ok:false, reason:'menu-open-failed', details: menuOpen };
  }

  const clickEdit = await clickMenuItem(tabId, '^edit$|^edit post$', 'edit');
  const clickEditData = clickEdit.ok ? j(clickEdit.text || '{}') : null;
  if (!clickEdit.ok || !clickEditData?.ok) {
    return { ok:false, reason:'edit-menu-item-not-found', details: clickEditData || clickEdit };
  }

  const replaceAndSubmit = await step('edit:replaceAndSubmit', () => call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const text = ${JSON.stringify(NEW_TEXT)};
      const started = Date.now();
      function tick() {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        const dialog = dialogs.find((d) => /edit post/i.test(clean(d.innerText || '')) || d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]')) || null;
        const root = dialog || document;
        const box = root.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');

        const buttons = Array.from(root.querySelectorAll('button,[role="button"]'));
        const update = buttons.find((b) => {
          const lbl = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
          const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
          return !disabled && /update|save/i.test(lbl);
        });
        const reply = buttons.find((b) => /reply/i.test(clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '')));

        if (!box || !update) {
          if (Date.now() - started < 3200) return setTimeout(tick, 120);
          return resolve({ ok:false, reason:'edit-surface-not-found', hasBox: !!box, hasUpdate: !!update, hasReply: !!reply, buttonLabels: buttons.map((b) => clean(b.textContent || '') || clean(b.getAttribute('aria-label') || '')).filter(Boolean).slice(0, 20) });
        }

        box.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(box);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, text);

        const typed = clean(box.innerText || box.textContent || '');
        const lbl = clean(update.textContent || '') || clean(update.getAttribute('aria-label') || '');
        update.click();
        resolve({ ok:true, clicked: lbl, len: typed.length, preview: typed.slice(0, 220) });
      }
      tick();
    }))()`
  }));

  const submitData = replaceAndSubmit.ok ? j(replaceAndSubmit.text || '{}') : null;

  await step('edit:verify:navigate', () => call('browser_navigate', { tabId, url: statusUrl(id) }));
  await step('edit:verify:wait', () => call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));
  const verify = await step('edit:verify:dom', () => call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      return {
        url: location.href,
        hasUpdatedText: txt.includes('Updated by ScreenHand team') || txt.includes('#ScreenHand'),
        snippet: txt.slice(0, 1000)
      };
    })()`
  }));

  return { ok:true, submit: submitData, verify: verify.ok ? j(verify.text || '{}') : verify };
}

try {
  await client.connect(transport);
  await step('focus', () => call('focus', { bundleId: 'com.google.Chrome' }));

  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.tab = xTab;

  await step('stealth', () => call('browser_stealth', { tabId: xTab.id }));

  // Delete second post
  await step('delete:navigate', () => call('browser_navigate', { tabId: xTab.id, url: statusUrl(DELETE_ID) }));
  await step('delete:wait', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));
  const menuOpen = await openMenuForStatus(xTab.id, DELETE_ID, 'delete');
  const menuOpenData = menuOpen.ok ? j(menuOpen.text || '{}') : null;
  report.deleteMenuOpen = menuOpenData || menuOpen;

  let deleteRun = null;
  if (menuOpenData?.ok) {
    const clickDelete = await clickMenuItem(xTab.id, '^delete$', 'delete');
    const clickDeleteData = clickDelete.ok ? j(clickDelete.text || '{}') : null;
    const confirm = await confirmDelete(xTab.id);
    const confirmData = confirm.ok ? j(confirm.text || '{}') : null;
    const verify = await verifyDeleted(xTab.id, DELETE_ID);
    const verifyData = verify.ok ? j(verify.text || '{}') : null;
    deleteRun = { clickDelete: clickDeleteData, confirm: confirmData, verify: verifyData };
  } else {
    deleteRun = { skipped: true, reason: 'could-not-open-delete-menu' };
  }
  report.deleteRun = deleteRun;

  // Edit first post
  report.editRun = await tryEdit(xTab.id, EDIT_ID);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, deleteRun: report.deleteRun, editRun: report.editRun }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
