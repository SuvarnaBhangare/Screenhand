import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_update_profile_screenhand_v2_report.json';

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
const client = new Client({ name: 'x-update-profile-screenhand-v2', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, arguments_ = {}) {
  try {
    const res = await client.callTool({ name, arguments: arguments_ });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function js(tabId, code) {
  const r = await call('browser_js', { tabId, code });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, text: r.text, data: j(r.text) };
}

const report = {
  startedAt: new Date().toISOString(),
  brand: BRAND,
  steps: [],
  errors: []
};

try {
  await client.connect(transport);

  report.steps.push({ step: 'launch', result: await call('launch', { bundleId: 'com.google.Chrome' }) });
  report.steps.push({ step: 'focus', result: await call('focus', { bundleId: 'com.google.Chrome' }) });

  const tabsRes = await call('browser_tabs', {});
  if (!tabsRes.ok) throw new Error(tabsRes.error || 'browser_tabs failed');
  const tabs = parseTabs(tabsRes.text);
  report.steps.push({ step: 'tabs', result: tabs });

  let tab = tabs.find((x) => /^https:\/\/x\.com\//i.test(x.url) || /^https:\/\/twitter\.com\//i.test(x.url));
  if (!tab) {
    const open = await call('browser_open', { url: 'https://x.com/home' });
    report.steps.push({ step: 'openX', result: open });
    const tabsRes2 = await call('browser_tabs', {});
    if (!tabsRes2.ok) throw new Error(tabsRes2.error || 'browser_tabs after open failed');
    const tabs2 = parseTabs(tabsRes2.text);
    tab = tabs2.find((x) => /^https:\/\/x\.com\//i.test(x.url) || /^https:\/\/twitter\.com\//i.test(x.url));
  }

  if (!tab) throw new Error('No X tab found');
  report.tab = tab;

  report.steps.push({ step: 'stealth', result: await call('browser_stealth', { tabId: tab.id }) });

  // Try settings/profile first (direct edit form)
  report.steps.push({ step: 'navSettingsProfile', result: await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/settings/profile' }) });
  report.steps.push({ step: 'waitSettings', result: await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }) });

  const settingsProbe = await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]')).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      name: el.getAttribute('name') || null,
      id: el.id || null,
      placeholder: el.getAttribute('placeholder') || null,
      aria: el.getAttribute('aria-label') || null,
      dt: el.getAttribute('data-testid') || null,
      value: (el.value ?? el.textContent ?? '').toString().slice(0, 80)
    }));
    const testids = Array.from(new Set(Array.from(document.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid')).filter(Boolean))).slice(0, 400);
    return {
      url: location.href,
      title: document.title,
      bodyLen: clean(document.body?.innerText || '').length,
      bodySnippet: clean(document.body?.innerText || '').slice(0, 1500),
      fieldCount: fields.length,
      fields,
      hasEditProfileText: /edit profile/i.test(clean(document.body?.innerText || '')),
      testids
    };
  })()`);
  report.steps.push({ step: 'settingsProbe', result: settingsProbe.data || settingsProbe.text || settingsProbe.error });

  const fillViaFields = await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();

    const setInputValue = (el, value) => {
      if (!el) return false;
      el.focus();
      if (el.tagName.toLowerCase() === 'div') {
        el.textContent = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.textContent = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]'));
    const pick = (...patterns) => fields.find((el) => {
      const s = [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('data-testid')].filter(Boolean).join(' ').toLowerCase();
      return patterns.some((re) => re.test(s));
    }) || null;

    const nameEl = pick(/name/, /display/);
    const bioEl = pick(/bio/, /description/, /about/);
    const locEl = pick(/location/);
    const webEl = pick(/website/, /url/, /link/);

    const out = {
      found: { name: !!nameEl, bio: !!bioEl, location: !!locEl, website: !!webEl },
      set: {
        name: nameEl ? setInputValue(nameEl, ${JSON.stringify(BRAND.name)}) : false,
        bio: bioEl ? setInputValue(bioEl, ${JSON.stringify(BRAND.bio)}) : false,
        location: locEl ? setInputValue(locEl, ${JSON.stringify(BRAND.location)}) : false,
        website: webEl ? setInputValue(webEl, ${JSON.stringify(BRAND.website)}) : false
      }
    };

    const saveBtn = Array.from(document.querySelectorAll('button,[role="button"]')).find((el) => {
      const txt = clean(el.textContent) || clean(el.getAttribute('aria-label')) || '';
      const dt = (el.getAttribute('data-testid') || '').toLowerCase();
      return /^save$/i.test(txt) || dt.includes('save');
    });
    if (saveBtn) saveBtn.click();

    out.savedClicked = !!saveBtn;
    out.url = location.href;
    return out;
  })()`);
  report.steps.push({ step: 'fillViaSettingsFields', result: fillViaFields.data || fillViaFields.text || fillViaFields.error });

  // Fallback flow from profile page if settings didn't expose fields
  const noSettingsFields = !(fillViaFields.data?.found?.name || fillViaFields.data?.found?.bio || fillViaFields.data?.found?.location || fillViaFields.data?.found?.website);
  if (noSettingsFields) {
    report.steps.push({ step: 'fallbackReason', result: 'No fields found at /settings/profile; trying profile page editor' });
    report.steps.push({ step: 'navProfile', result: await call('browser_navigate', { tabId: tab.id, url: 'https://x.com/screenhand_' }) });
    report.steps.push({ step: 'waitProfile', result: await call('browser_wait', { tabId: tab.id, condition: 'document.body && document.body.innerText.length > 20', timeoutMs: 30000 }) });

    const openEditor = await js(tab.id, `(() => {
      const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
      const candidates = Array.from(document.querySelectorAll('button,[role="button"],a'));
      const byText = candidates.find((el) => /^edit profile$/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
      if (byText) { byText.click(); return { ok:true, mode:'text', url: location.href }; }
      const byDt = document.querySelector('[data-testid*="editProfile" i], [data-testid*="EditProfile" i]');
      if (byDt) { byDt.click(); return { ok:true, mode:'testid', url: location.href }; }
      return {
        ok:false,
        reason:'edit-profile-not-found',
        url: location.href,
        buttons: candidates.map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,80),
        testids: Array.from(new Set(Array.from(document.querySelectorAll('[data-testid]')).map((n)=>n.getAttribute('data-testid')).filter(Boolean))).slice(0,300)
      };
    })()`);
    report.steps.push({ step: 'fallbackOpenEditor', result: openEditor.data || openEditor.text || openEditor.error });
  }

  report.steps.push({ step: 'verify', result: await js(tab.id, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const body = clean(document.body?.innerText || '');
    return {
      url: location.href,
      title: document.title,
      bodyLen: body.length,
      hasScreenhandName: body.includes(${JSON.stringify(BRAND.name)}),
      hasScreenhandSite: body.toLowerCase().includes('screenhand.com'),
      bodySnippet: body.slice(0, 1600)
    };
  })()`) });

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
