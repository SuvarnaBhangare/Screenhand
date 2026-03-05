import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ID = '2029620157203763699';
const URL = `https://x.com/screenhand_/status/${ID}`;
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-delete-second-testid-confirm', version: '1.0.0' }, { capabilities: {} });
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

try {
  await client.connect(transport);
  const log = {};
  log.focus = await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs((await call('browser_tabs', {})).text || '');
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  log.nav = await call('browser_navigate', { tabId: tab.id, url: URL });
  log.wait = await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 });

  log.run = await call('browser_js', {
    tabId: tab.id,
    code: `(() => new Promise((resolve) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();

      const link = Array.from(document.querySelectorAll('a[href]')).find((a) => {
        const h = a.getAttribute('href') || '';
        return h.includes('/status/${ID}');
      });
      const article = link ? link.closest('article') : document.querySelector('article');
      if (!article) return resolve({ ok:false, reason:'no-article' });

      const caret = article.querySelector('[data-testid="caret"], button[aria-label="More"]');
      if (!caret) return resolve({ ok:false, reason:'no-caret' });
      caret.click();

      const s0 = Date.now();
      function openDelete() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) {
          if (Date.now() - s0 < 2200) return setTimeout(openDelete, 100);
          return resolve({ ok:false, reason:'menu-not-open' });
        }
        const items = Array.from(menu.querySelectorAll('[role="menuitem"], [tabindex="-1"], button, div, span'));
        const del = items.find((el) => /delete/i.test(clean(el.textContent || '')));
        if (!del) return resolve({ ok:false, reason:'delete-item-not-found' });
        (del.closest('[role="menuitem"], [tabindex="-1"], button, div') || del).click();

        const s1 = Date.now();
        function confirmDelete() {
          const byTest = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (byTest) {
            byTest.click();
            return resolve({ ok:true, via:'confirmationSheetConfirm' });
          }

          const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
          const btn = btns.find((b) => {
            const label = clean(b.textContent || '') + ' ' + clean(b.getAttribute('aria-label') || '');
            const disabled = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
            return !disabled && /^delete\b/i.test(label);
          });
          if (btn) {
            btn.click();
            return resolve({ ok:true, via:'delete-button', label: clean(btn.textContent || '') || clean(btn.getAttribute('aria-label') || '') });
          }

          if (Date.now() - s1 < 2800) return setTimeout(confirmDelete, 120);
          resolve({ ok:false, reason:'delete-confirm-not-found' });
        }
        confirmDelete();
      }
      openDelete();
    }))()`
  });

  await sleep(1200);
  log.verifyNav = await call('browser_navigate', { tabId: tab.id, url: URL });
  log.verifyWait = await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 });
  log.verify = await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      return {
        url: location.href,
        deletedLike: /this post was deleted|post not found|doesn.?t exist|try searching/i.test(txt.toLowerCase()),
        snippet: txt.slice(0, 800)
      };
    })()`
  });

  console.log(JSON.stringify({ ok: true, log }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
