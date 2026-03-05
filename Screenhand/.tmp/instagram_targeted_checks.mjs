import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-targeted-checks', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parseTabs = (t) => t.split('\n').map((l)=>{ const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],title:m[2],url:m[3]}:null; }).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name: 'browser_tabs', arguments: {} })));
  const ig = tabs.find((t) => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  const tabId = ig.id;

  const routes = [
    'https://www.instagram.com/',
    'https://www.instagram.com/accounts/activity/',
    'https://www.instagram.com/notifications/',
    'https://www.instagram.com/create/',
    'https://www.instagram.com/create/select/'
  ];

  for (const url of routes) {
    const nav = text(await client.callTool({ name: 'browser_navigate', arguments: { tabId, url } }));
    const info = text(await client.callTool({ name: 'browser_page_info', arguments: { tabId } }));
    console.log('\n===', url, '===');
    console.log(nav);
    console.log(info.slice(0, 600));
  }

  await client.callTool({ name: 'browser_navigate', arguments: { tabId, url: 'https://www.instagram.com/' } });
  const createLink = text(await client.callTool({
    name: 'browser_js',
    arguments: {
      tabId,
      code: `(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const els = Array.from(document.querySelectorAll('a,button,[role="button"]'));
        const hits = els.filter(el => /create|new post/i.test(clean(el.textContent)||'') || /create/i.test(clean(el.getAttribute('aria-label'))||''));
        return hits.slice(0,10).map(el => ({tag:el.tagName.toLowerCase(), text:clean(el.textContent), aria:clean(el.getAttribute('aria-label')), href:el.getAttribute('href')||null}));
      })()`,
    },
  }));
  console.log('\n=== CREATE_ENTRYPOINTS ===');
  console.log(createLink);
} catch (e) {
  console.error('TARGET_CHECK_FAILED:', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
