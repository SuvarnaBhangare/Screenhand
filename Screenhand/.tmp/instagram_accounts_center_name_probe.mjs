import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-accounts-center-name-probe', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  const tabId = ig.id;

  console.log(text(await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://accountscenter.instagram.com/?entry_point=app_settings' }})));
  console.log(text(await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 80', timeoutMs:20000 }})));

  const out = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const body = (document.body?.innerText || '');
        const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          aria: el.getAttribute('aria-label') || null,
          value: (el.value || '').slice(0,120)
        }));
        const candidates = inputs.filter(x => /name|full|first|last/i.test((x.id||'') + ' ' + (x.name||'') + ' ' + (x.placeholder||'') + ' ' + (x.aria||'')));
        const clickable = Array.from(document.querySelectorAll('a[href],button,[role="button"]')).map(el => ({
          text: clean(el.textContent),
          aria: clean(el.getAttribute('aria-label')),
          href: el.getAttribute('href') || null
        })).filter(x => /personal details|name|profile|account/i.test((x.text + ' ' + x.aria).toLowerCase())).slice(0,60);
        return {
          url: location.href,
          title: document.title,
          hasPersonalDetailsText: /personal details/i.test(body),
          nameInputCandidates: candidates,
          clickable
        };
      })()`
    }
  }));

  console.log(out);
} catch (e) {
  console.error('ACCOUNTS_CENTER_PROBE_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
