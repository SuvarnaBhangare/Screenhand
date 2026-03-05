import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'ig-probe-debug', version: '1.0.0' }, { capabilities: {} });

const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parseTabs = (t) =>
  t.split('\n')
    .map((l) => {
      const m = l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
      return m ? { id: m[1], title: m[2], url: m[3] } : null;
    })
    .filter(Boolean);

const tests = [
  "(() => ({ok:true, url:location.href}))()",
  "(() => { const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim(); return {ok:true, title:clean(document.title)}; })()",
  "(() => { const q = document.querySelector('a[href*=\"/reels/\"]'); return {ok:true, has:!!q}; })()",
  "(() => { const p = /^\\/[A-Za-z0-9._]+\\/?$/.test(location.pathname); return {ok:true,p}; })()",
  "(() => { const s = 'a[href*=\"/create\"], [aria-label*=\"Create\" i], [aria-label*=\"New post\" i]'; const q = document.querySelector(s); return {ok:true, has:!!q}; })()",
  "(() => { const links = Array.from(document.querySelectorAll('a[href]')).slice(0,5).map(a=>a.getAttribute('href')); return {ok:true, links}; })()"
];

try {
  await client.connect(transport);
  const tabs = text(await client.callTool({ name: 'browser_tabs', arguments: {} }));
  const ig = parseTabs(tabs).find((t) => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  console.log('TAB', ig);

  for (let i = 0; i < tests.length; i++) {
    const out = text(await client.callTool({ name: 'browser_js', arguments: { tabId: ig.id, code: tests[i] } }));
    console.log(`TEST${i + 1}:`, out.slice(0, 300));
  }
} catch (e) {
  console.error('DEBUG_FAILED:', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
