import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_profile_edit_probe_report.json';
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-profile-edit-probe', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, arguments_ = {}) {
  const res = await client.callTool({ name, arguments: arguments_ });
  return t(res);
}

async function js(tabId, code) {
  return j(await call('browser_js', { tabId, code }));
}

const report = { startedAt: new Date().toISOString() };

try {
  await client.connect(transport);
  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab found');
  const tabId = tab.id;
  report.tab = tab;

  await call('browser_stealth', { tabId });
  await call('browser_navigate', { tabId, url: 'https://x.com/home' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 25000 });

  report.home = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const profileAnchor = anchors.find((a) => {
      const txt = clean(a.textContent) || clean(a.getAttribute('aria-label')) || '';
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/')) return false;
      if (/^\\/(home|explore|notifications|messages|bookmarks|i|settings|compose|search)\\b/i.test(href)) return false;
      return /profile/i.test(txt) || /\\/[^/]+$/.test(href);
    });
    return {
      url: location.href,
      title: document.title,
      profileHrefGuess: profileAnchor?.getAttribute('href') || null,
      buttonSamples: Array.from(document.querySelectorAll('button,[role="button"],a')).map(el=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,80)
    };
  })()`);

  const profilePath = report.home?.profileHrefGuess || '/';
  const profileUrl = profilePath.startsWith('http') ? profilePath : `https://x.com${profilePath}`;
  report.profileUrl = profileUrl;

  await call('browser_navigate', { tabId, url: profileUrl });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 25000 });

  report.profileBeforeEdit = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const editBtn = Array.from(document.querySelectorAll('button,[role="button"],a')).find(el => /^edit profile$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
    return {
      url: location.href,
      title: document.title,
      hasEditProfile: !!editBtn,
      editText: editBtn ? (clean(editBtn.textContent)||clean(editBtn.getAttribute('aria-label'))||null) : null
    };
  })()`);

  report.openEdit = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const editBtn = Array.from(document.querySelectorAll('button,[role="button"],a')).find(el => /^edit profile$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
    if (!editBtn) return { ok:false, reason:'edit-profile-button-missing' };
    editBtn.click();
    return { ok:true };
  })()`);

  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 12000 });

  report.editModal = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const vis = (el) => !!(el && el.offsetParent !== null);
    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]'))
      .map((el) => {
        const tag = el.tagName.toLowerCase();
        const r = el.getBoundingClientRect();
        return {
          tag,
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          aria: el.getAttribute('aria-label') || null,
          dataTestid: el.getAttribute('data-testid') || null,
          value: tag === 'div' ? clean(el.textContent).slice(0,220) : (el.value || '').slice(0,220),
          visible: vis(el),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        };
      })
      .filter((f) => f.visible)
      .slice(0, 80);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],a')).map(el => ({
      text: clean(el.textContent)||clean(el.getAttribute('aria-label'))||null,
      dataTestid: el.getAttribute('data-testid') || null
    })).filter((b)=>b.text).slice(0,120);
    return {
      url: location.href,
      title: document.title,
      fields,
      buttons
    };
  })()`);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, profileUrl, openEdit: report.openEdit, fieldCount: report.editModal?.fields?.length || 0 }, null, 2));
} catch (err) {
  report.error = String(err?.message || err);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: report.error }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
