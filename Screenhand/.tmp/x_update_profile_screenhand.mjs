import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_update_profile_screenhand_report.json';

const BRAND = {
  name: 'ScreenHand',
  bio: 'Open-source MCP server for AI desktop automation. AI agents can see, click, and type across macOS + Windows. screenhand.com',
  location: 'Global',
  website: 'https://screenhand.com'
};

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-update-profile-screenhand', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, arguments_ = {}) {
  try {
    const res = await client.callTool({ name, arguments: arguments_ });
    return { ok: true, text: t(res) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function js(tabId, code) {
  const r = await call('browser_js', { tabId, code });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: j(r.text), text: r.text };
}

const report = { startedAt: new Date().toISOString(), brand: BRAND, steps: [], errors: [] };

try {
  await client.connect(transport);
  await call('launch', { app: 'Google Chrome' });
  await call('focus', { app: 'Google Chrome' });

  const tabsRes = await call('browser_tabs', {});
  if (!tabsRes.ok) throw new Error(tabsRes.error);
  const tabs = parseTabs(tabsRes.text);
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab found');
  const tabId = tab.id;
  report.tab = tab;

  await call('browser_navigate', { tabId, url: 'https://x.com/home' });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 25000 });

  const openProfile = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    let el = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    if (!el) {
      const candidates = Array.from(document.querySelectorAll('a,button,[role="button"]'));
      el = candidates.find((x) => {
        const txt = clean(x.textContent) || clean(x.getAttribute('aria-label')) || '';
        return /^profile$/i.test(txt);
      }) || null;
    }
    let href = '';
    if (el) {
      href = el.getAttribute('href') || '';
      el.click();
      return { ok:true, mode:'selector-or-text', href, url: location.href };
    }
    const avatar = Array.from(document.querySelectorAll('[data-testid]')).map((n)=>n.getAttribute('data-testid')||'').find((id)=>/^UserAvatar-Container-/i.test(id));
    const handle = avatar ? avatar.replace(/^UserAvatar-Container-/i,'') : null;
    if (handle) {
      return { ok:true, mode:'avatar-handle', href:'/'+handle, url: location.href };
    }
    return { ok:false, reason:'profile-tab-missing', url: location.href };
  })()`);
  report.steps.push({ step: 'openProfile', result: openProfile.data || openProfile.text || openProfile.error });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 12000 });

  // If click didn't route, fallback direct profile URL from href
  const profileHref = openProfile.data?.href || '';
  if (profileHref && profileHref.startsWith('/')) {
    await call('browser_navigate', { tabId, url: `https://x.com${profileHref}` });
    await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 12000 });
  }

  const openEditor = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],a'));
    const edit = candidates.find((el) => /^edit profile$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
    if (edit) { edit.click(); return { ok:true, mode:'text', url: location.href }; }
    const dt = document.querySelector('[data-testid*="editProfile" i], [data-testid*="EditProfile" i]');
    if (dt) { dt.click(); return { ok:true, mode:'testid', url: location.href }; }
    return { ok:false, reason:'edit-profile-not-found', url: location.href, buttons: candidates.map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,40) };
  })()`);
  report.steps.push({ step: 'openEditor', result: openEditor.data || openEditor.text || openEditor.error });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 12000 });

  const fill = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const setVal = (el, val) => {
      if (!el) return false;
      el.focus();
      if (el.tagName.toLowerCase() === 'div') {
        el.textContent = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        document.execCommand?.('insertText', false, val);
        if ((el.textContent || '').trim() !== val) {
          el.textContent = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    };

    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]'));
    const pick = (pred) => fields.find(pred);
    const byAria = (re) => pick((el) => re.test((el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-testid') || '')));

    const nameEl = byAria(/name|display name/i) || document.querySelector('input[data-testid*="name" i], input[name*="name" i]');
    const bioEl = byAria(/bio|description/i) || document.querySelector('textarea[data-testid*="description" i], textarea, div[role="textbox"][contenteditable="true"][data-testid*="bio" i]');
    const locEl = byAria(/location/i) || document.querySelector('input[data-testid*="location" i]');
    const webEl = byAria(/website|url/i) || document.querySelector('input[type="url"], input[data-testid*="website" i]');

    const out = {
      name: !!nameEl && setVal(nameEl, ${JSON.stringify(BRAND.name)}),
      bio: !!bioEl && setVal(bioEl, ${JSON.stringify(BRAND.bio)}),
      location: !!locEl && setVal(locEl, ${JSON.stringify(BRAND.location)}),
      website: !!webEl && setVal(webEl, ${JSON.stringify(BRAND.website)}),
      found: {
        name: !!nameEl,
        bio: !!bioEl,
        location: !!locEl,
        website: !!webEl
      }
    };

    const save = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((el) => /^save$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||'') || /save/i.test(el.getAttribute('data-testid') || ''));
    if (save) save.click();
    return { ...out, savedClicked: !!save, url: location.href };
  })()`);
  report.steps.push({ step: 'fillAndSave', result: fill.data || fill.text || fill.error });
  await call('browser_wait', { tabId, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 12000 });

  const verify = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const body = clean(document.body?.innerText || '');
    return {
      url: location.href,
      hasName: body.includes(${JSON.stringify(BRAND.name)}),
      hasBioPhrase: body.toLowerCase().includes('open-source mcp server') || body.toLowerCase().includes('screenhand.com'),
      bodySnippet: body.slice(0, 1600)
    };
  })()`);
  report.steps.push({ step: 'verify', result: verify.data || verify.text || verify.error });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, steps: report.steps }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
