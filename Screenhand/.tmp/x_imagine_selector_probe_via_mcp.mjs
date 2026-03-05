import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-imagine-selector-probe-via-mcp', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3] } : null;
  }).filter(Boolean);
}

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return t(res);
}

async function js(tabId, code) {
  return j(await call('browser_js', { tabId, code }));
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });

  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/screenhand_' });
  await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 20000 });

  const openEdit = await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const byDt = document.querySelector('[data-testid="editProfileButton"]');
    if (byDt) { byDt.click(); return { ok:true, via:'testid' }; }
    const el = Array.from(document.querySelectorAll('a,button,[role="button"]')).find((n)=>/^edit profile$/i.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||''));
    if (el) { el.click(); return { ok:true, via:'text' }; }
    return { ok:false };
  })()`);

  await call('browser_wait', { tabId: tab.id, condition: 'document.body && /edit profile/i.test(document.body.innerText)', timeoutMs: 15000 });

  const openPhoto = await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const root = document.querySelector('div[role="dialog"]') || document;
    const el = Array.from(root.querySelectorAll('a,button,[role="button"],div,span')).find((n)=>/^edit photo$/i.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||''));
    if (el) { el.click(); return { ok:true }; }
    return { ok:false };
  })()`);

  await call('browser_wait', { tabId: tab.id, condition: 'location.href.includes("/i/imagine") || /imagine/i.test(document.body.innerText)', timeoutMs: 20000 });

  const probe = await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const dialog = document.querySelector('div[role="dialog"]') || document;
    const controls = Array.from(dialog.querySelectorAll('button,a,input,textarea,div[role="button"],div[contenteditable="true"]')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || null,
        dt: el.getAttribute('data-testid') || null,
        role: el.getAttribute('role') || null,
        aria: clean(el.getAttribute('aria-label')),
        title: clean(el.getAttribute('title')),
        placeholder: clean(el.getAttribute('placeholder')),
        text: clean(el.textContent).slice(0,120),
        href: el.getAttribute('href') || null,
        value: (el.value ?? '').toString().slice(0,120),
        visible: r.width > 2 && r.height > 2,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      };
    }).filter((c)=>c.visible);

    return {
      url: location.href,
      title: document.title,
      textSnippet: clean(dialog.innerText || '').slice(0, 1800),
      controls
    };
  })()`);

  console.log(JSON.stringify({ openEdit, openPhoto, probe }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
