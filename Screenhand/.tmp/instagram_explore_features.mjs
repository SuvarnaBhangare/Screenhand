import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT_DIR = '/Users/khushi/Documents/Automator/Screenhand/.tmp';
const OUT_JSON = path.join(OUT_DIR, 'instagram_feature_report.json');

function getText(res) {
  return res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseTabs(text) {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
      if (!m) return null;
      return { id: m[1], title: m[2], url: m[3] };
    })
    .filter(Boolean);
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

const pageProbeCode = "(() => { const clean=(s)=>(s||'').replace(/\\\\s+/g,' ').trim(); const uniq=(arr)=>Array.from(new Set(arr.filter(Boolean))); const qsa=(sel)=>{try{return Array.from(document.querySelectorAll(sel));}catch{return[];}}; const links=qsa('a[href]').slice(0,500).map(a=>a.getAttribute('href')||'').filter(Boolean); const navLabels=uniq(qsa('a,button,[role=\"button\"],span').slice(0,1200).map(el=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||clean(el.getAttribute('title')))).slice(0,180); const navHrefs=uniq(links.filter(h=>h.startsWith('/')||h.includes('instagram.com'))).slice(0,220); const buttons=uniq(qsa('button,[role=\"button\"]').slice(0,300).map(el=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||clean(el.getAttribute('title')))).slice(0,140); const forms=qsa('input,textarea,select').slice(0,80).map(el=>({tag:(el.tagName||'').toLowerCase(),type:el.type||undefined,name:el.name||undefined,id:el.id||undefined,placeholder:el.placeholder||undefined,aria:el.getAttribute('aria-label')||undefined})); const body=clean((document.body&&document.body.innerText)||''); const lower=body.toLowerCase(); const has=(x)=>lower.includes(String(x||'').toLowerCase()); const p=location.pathname||''; const featureSignals={ homeFeed: !!document.querySelector('main,article'), storiesTray: has('stories'), reels: p.startsWith('/reels') || navHrefs.some(h=>h.includes('/reels')), explore: p.startsWith('/explore') || navHrefs.some(h=>h.includes('/explore')), messages: p.startsWith('/direct') || navHrefs.some(h=>h.includes('/direct/inbox')), notifications: navHrefs.some(h=>h.includes('/accounts/activity')), create: navHrefs.some(h=>h.includes('/create')) || has('create') || has('new post'), profile: navHrefs.some(h=>h.includes('/accounts/edit')) || (p.split('/').filter(Boolean).length===1), settings: p.includes('/accounts/edit') || has('settings'), search: has('search') || !!document.querySelector('input[type=\"search\"]'), comments: has('comment'), likes: has('like'), share: has('share') || has('send'), saves: has('save'), follows: has('follow') }; return { title: document.title, url: location.href, pathname: p, navLabels, navHrefs, buttons, forms, featureSignals, textSnippet: body.slice(0,1600) }; })()";

const routes = [
  { key: 'home', url: 'https://www.instagram.com/' },
  { key: 'explore', url: 'https://www.instagram.com/explore/' },
  { key: 'reels', url: 'https://www.instagram.com/reels/' },
  { key: 'messages', url: 'https://www.instagram.com/direct/inbox/' },
  { key: 'activity', url: 'https://www.instagram.com/accounts/activity/' },
  { key: 'edit_profile', url: 'https://www.instagram.com/accounts/edit/' },
  { key: 'accounts_center', url: 'https://www.instagram.com/accounts/center/' },
  { key: 'professional_dashboard', url: 'https://www.instagram.com/professional_dashboard/' },
  { key: 'create', url: 'https://www.instagram.com/create/select/' },
];

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'instagram-feature-explorer', version: '1.0.0' }, { capabilities: {} });

const report = {
  generatedAt: new Date().toISOString(),
  source: 'screenhand-mcp',
  routesChecked: [],
  consolidated: {
    navLabels: [],
    navHrefs: [],
    buttons: [],
    forms: [],
    featureSignals: {},
  },
  errors: [],
};

try {
  await client.connect(transport);

  const tabsText = getText(await client.callTool({ name: 'browser_tabs', arguments: {} }));
  const tabs = parseTabs(tabsText);
  const ig = tabs.find((t) => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found in Chrome.');

  const tabId = ig.id;
  report.instagramTab = ig;

  const stealthRes = getText(await client.callTool({ name: 'browser_stealth', arguments: { tabId } }));
  report.stealth = stealthRes;

  for (const route of routes) {
    const entry = { key: route.key, targetUrl: route.url };
    try {
      entry.navigate = getText(await client.callTool({ name: 'browser_navigate', arguments: { tabId, url: route.url } }));
      entry.wait = getText(await client.callTool({
        name: 'browser_wait',
        arguments: { tabId, condition: 'document.body && document.body.innerText.length > 50', timeoutMs: 12000 },
      }));

      const infoRaw = getText(await client.callTool({ name: 'browser_page_info', arguments: { tabId } }));
      entry.pageInfo = tryParseJson(infoRaw) || { raw: infoRaw };

      const probeRaw = getText(await client.callTool({ name: 'browser_js', arguments: { tabId, code: pageProbeCode } }));
      entry.probe = tryParseJson(probeRaw) || { raw: probeRaw };
    } catch (err) {
      entry.error = String(err?.message || err);
      report.errors.push({ route: route.key, error: entry.error });
    }
    report.routesChecked.push(entry);
  }

  const allProbes = report.routesChecked.map((r) => r.probe).filter((p) => p && typeof p === 'object' && !p.raw);
  report.consolidated.navLabels = uniq(allProbes.flatMap((p) => p.navLabels || [])).slice(0, 200);
  report.consolidated.navHrefs = uniq(allProbes.flatMap((p) => p.navHrefs || [])).slice(0, 300);
  report.consolidated.buttons = uniq(allProbes.flatMap((p) => p.buttons || [])).slice(0, 200);

  const formLines = uniq(
    allProbes
      .flatMap((p) => p.forms || [])
      .map((f) => [f.tag, f.type, f.name, f.id, f.placeholder, f.aria].filter(Boolean).join(' | '))
  );
  report.consolidated.forms = formLines.slice(0, 200);

  const signalKeys = uniq(allProbes.flatMap((p) => Object.keys(p.featureSignals || {})));
  for (const k of signalKeys) {
    report.consolidated.featureSignals[k] = allProbes.some((p) => p.featureSignals?.[k]);
  }

  try {
    const exportRaw = getText(await client.callTool({
      name: 'export_playbook',
      arguments: {
        platform: 'instagram',
        domain: 'instagram.com',
        description: 'Instagram platform knowledge discovered via Screenhand exploration',
        tabId,
      },
    }));
    report.exportPlaybook = exportRaw.slice(0, 2000);
  } catch (err) {
    report.errors.push({ route: 'export_playbook', error: String(err?.message || err) });
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  console.log(`Report saved: ${OUT_JSON}`);
  console.log(`Routes checked: ${report.routesChecked.length}`);
  console.log(`Consolidated nav labels: ${report.consolidated.navLabels.length}`);
  console.log(`Consolidated nav hrefs: ${report.consolidated.navHrefs.length}`);
  console.log(`Consolidated buttons: ${report.consolidated.buttons.length}`);
  console.log(`Errors: ${report.errors.length}`);
  console.log('Key signals:', JSON.stringify(report.consolidated.featureSignals, null, 2));
} catch (err) {
  console.error('EXPLORATION_FAILED:', String(err?.message || err));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
