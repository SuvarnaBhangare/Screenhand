import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CANDIDATES = ['2029617823178424794', '2029620157203763699'];
const HANDLE = 'screenhand_';
const NEW_TEXT = 'Updated: ScreenHand helps AI agents automate real Mac workflows end-to-end with OCR, native app control, Chrome automation, and AppleScript via MCP. Explore https://screenhand.com #AIAgents #MCP #macOS #ScreenHand';
const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_delete_noneditable_edit_other_report.json';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-delete-noneditable-edit-other', version: '1.0.0' }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

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

const report = {
  startedAt: new Date().toISOString(),
  candidates: CANDIDATES,
  actions: [],
  errors: []
};

async function logStep(step, result) {
  report.actions.push({ step, result });
  return result;
}

async function probeMenu(tabId, id) {
  const url = `https://x.com/${HANDLE}/status/${id}`;
  await logStep(`nav:${id}`, await call('browser_navigate', { tabId, url }));
  await logStep(`wait:${id}`, await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));

  const res = await call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const statusId = ${JSON.stringify(id)};
      const targetHref = '/${HANDLE}/status/' + statusId;

      function uniq(arr) {
        const out = [];
        const seen = new Set();
        for (const v of arr) {
          if (!v || seen.has(v)) continue;
          seen.add(v);
          out.push(v);
        }
        return out;
      }

      const links = Array.from(document.querySelectorAll('a[href]'));
      const link = links.find((a) => a.getAttribute('href') === targetHref) || links.find((a) => (a.getAttribute('href') || '').includes('/status/' + statusId));
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'target-article-not-found', url: location.href });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'caret-not-found', url: location.href });
      caret.click();

      const start = Date.now();
      function scan() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - start < 1800) return setTimeout(scan, 120);
          return resolve({ ok:false, reason:'menu-not-open', url: location.href });
        }
        const texts = uniq(Array.from(menu.querySelectorAll('*')).map((n) => clean(n.textContent || '')).filter(Boolean));
        const hasEdit = texts.some((x) => /^edit$/i.test(x) || /^edit post$/i.test(x) || /edit post/i.test(x));
        const hasDelete = texts.some((x) => /^delete$/i.test(x) || /delete/i.test(x));
        resolve({ ok:true, id: statusId, url: location.href, hasEdit, hasDelete, options: texts.slice(0, 40), articlePreview: clean(article.innerText || '').slice(0, 220) });
      }
      scan();
    }))()`
  });

  const parsed = res.ok ? j(res.text || '{}') : { ok: false, reason: res.error || 'probe-failed' };
  await logStep(`probe:${id}`, parsed);
  return parsed;
}

async function deletePost(tabId, id) {
  const url = `https://x.com/${HANDLE}/status/${id}`;
  await logStep(`delete-nav:${id}`, await call('browser_navigate', { tabId, url }));
  await logStep(`delete-wait:${id}`, await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));

  const del = await call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const statusId = ${JSON.stringify(id)};
      const targetHref = '/${HANDLE}/status/' + statusId;
      const links = Array.from(document.querySelectorAll('a[href]'));
      const link = links.find((a) => a.getAttribute('href') === targetHref) || links.find((a) => (a.getAttribute('href') || '').includes('/status/' + statusId));
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'target-article-not-found' });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'caret-not-found' });
      caret.click();

      const start = Date.now();
      function tryDeleteMenu() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - start < 1800) return setTimeout(tryDeleteMenu, 100);
          return resolve({ ok:false, reason:'menu-not-open' });
        }
        const items = Array.from(menu.querySelectorAll('[role="menuitem"], [tabindex="-1"], button, div'));
        const hit = items.find((el) => /delete/i.test(clean(el.textContent || '')));
        if (!hit) return resolve({ ok:false, reason:'delete-item-not-found' });
        hit.click();

        const cStart = Date.now();
        function confirmDelete() {
          const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
          const confirm = buttons.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /^delete\b/i.test(label);
          });
          if (!confirm) {
            if (Date.now() - cStart < 2200) return setTimeout(confirmDelete, 120);
            return resolve({ ok:false, reason:'delete-confirm-not-found' });
          }
          const label = clean(confirm.textContent || '') || clean(confirm.getAttribute('aria-label') || '');
          confirm.click();
          setTimeout(() => resolve({ ok:true, clickedConfirm: label }), 400);
        }
        confirmDelete();
      }
      tryDeleteMenu();
    }))()`
  });

  const parsed = del.ok ? j(del.text || '{}') : { ok: false, reason: del.error || 'delete-failed' };
  await logStep(`delete-run:${id}`, parsed);

  await logStep(`delete-verify-nav:${id}`, await call('browser_navigate', { tabId, url }));
  await logStep(`delete-verify-wait:${id}`, await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }));
  const verify = await call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      return {
        url: location.href,
        deletedMarker: /this post was deleted|post not found|doesn.?t exist|try searching/i.test(txt.toLowerCase()),
        snippet: txt.slice(0, 700)
      };
    })()`
  });
  const v = verify.ok ? j(verify.text || '{}') : { ok: false, reason: verify.error || 'verify-failed' };
  await logStep(`delete-verify:${id}`, v);
  return { parsed, verify: v };
}

async function editPost(tabId, id, newText) {
  const url = `https://x.com/${HANDLE}/status/${id}`;
  await logStep(`edit-nav:${id}`, await call('browser_navigate', { tabId, url }));
  await logStep(`edit-wait:${id}`, await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));

  const edit = await call('browser_js', {
    tabId,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const text = ${JSON.stringify(newText)};
      const statusId = ${JSON.stringify(id)};
      const targetHref = '/${HANDLE}/status/' + statusId;

      const links = Array.from(document.querySelectorAll('a[href]'));
      const link = links.find((a) => a.getAttribute('href') === targetHref) || links.find((a) => (a.getAttribute('href') || '').includes('/status/' + statusId));
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'target-article-not-found' });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'caret-not-found' });
      caret.click();

      const start = Date.now();
      function findEditMenu() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - start < 1800) return setTimeout(findEditMenu, 100);
          return resolve({ ok:false, reason:'menu-not-open' });
        }
        const nodes = Array.from(menu.querySelectorAll('*'));
        const editNode = nodes.find((n) => {
          const txt = clean(n.textContent || '');
          return /^edit$/i.test(txt) || /^edit post$/i.test(txt) || /edit post/i.test(txt);
        });
        if (!editNode) return resolve({ ok:false, reason:'edit-not-found' });
        const clickNode = editNode.closest('[role="menuitem"], [tabindex="-1"], button, a, div') || editNode;
        clickNode.click();

        const es = Date.now();
        function waitEditSurface() {
          const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((d) => {
            const txt = clean(d.innerText || '');
            return /edit post/i.test(txt) || !!d.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
          });
          const scope = dialog || document;
          const box = scope.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
          const btns = Array.from(scope.querySelectorAll('button,[role="button"]'));
          const update = btns.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /update|save/i.test(label);
          });
          if (!box || !update) {
            if (Date.now() - es < 2600) return setTimeout(waitEditSurface, 120);
            return resolve({ ok:false, reason:'edit-surface-not-found', haveBox: !!box, haveUpdate: !!update });
          }

          box.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(box);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('insertText', false, text);

          const typed = clean(box.innerText || box.textContent || '');
          const label = clean(update.textContent || '') || clean(update.getAttribute('aria-label') || '');
          update.click();
          return resolve({ ok:true, clicked: label, preview: typed.slice(0, 220), len: typed.length });
        }
        waitEditSurface();
      }
      findEditMenu();
    }))()`
  });

  const parsed = edit.ok ? j(edit.text || '{}') : { ok: false, reason: edit.error || 'edit-failed' };
  await logStep(`edit-run:${id}`, parsed);

  await logStep(`edit-verify-nav:${id}`, await call('browser_navigate', { tabId, url }));
  await logStep(`edit-verify-wait:${id}`, await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 120', timeoutMs: 30000 }));
  const verify = await call('browser_js', {
    tabId,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      return {
        url: location.href,
        hasUpdated: txt.includes('Updated: ScreenHand helps AI agents') || txt.includes('#Automation #ScreenHand'),
        hasOldTryIt: txt.includes('Try it:'),
        snippet: txt.slice(0, 900)
      };
    })()`
  });
  const v = verify.ok ? j(verify.text || '{}') : { ok: false, reason: verify.error || 'verify-failed' };
  await logStep(`edit-verify:${id}`, v);
  return { parsed, verify: v };
}

try {
  await client.connect(transport);
  await logStep('focusChrome', await call('focus', { bundleId: 'com.google.Chrome' }));

  const tabsRes = await logStep('tabs', await call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('browser_tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab');
  report.tab = xTab;

  const probes = [];
  for (const id of CANDIDATES) probes.push(await probeMenu(xTab.id, id));
  report.probes = probes;

  const editable = probes.find((p) => p && p.ok && p.hasEdit);
  const nonEditable = probes.find((p) => p && p.ok && !p.hasEdit);

  report.selection = {
    editableId: editable?.id || null,
    nonEditableId: nonEditable?.id || null
  };

  if (nonEditable?.id) {
    report.deleteResult = await deletePost(xTab.id, nonEditable.id);
  } else {
    report.deleteResult = { skipped: true, reason: 'No non-editable post identified from probes' };
  }

  if (editable?.id) {
    report.editResult = await editPost(xTab.id, editable.id, NEW_TEXT);
  } else {
    report.editResult = { skipped: true, reason: 'No editable post identified from probes' };
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, selection: report.selection, deleteResult: report.deleteResult, editResult: report.editResult }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
