import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-name-probe', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  const tabId = ig.id;

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/accounts/edit/' }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 80', timeoutMs:15000 }});

  const out = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const bodyText = (document.body?.innerText || '');
        const hasManu = /manu\s+singhal/i.test(bodyText);
        const personalDetailsLinks = Array.from(document.querySelectorAll('a[href]')).map(a => ({
          href: a.getAttribute('href') || '',
          text: clean(a.textContent),
          aria: clean(a.getAttribute('aria-label'))
        })).filter(x => /personal details|accounts center/i.test((x.text + ' ' + x.aria).toLowerCase()) || /accountscenter\.instagram\.com/i.test(x.href));

        const nameInputs = Array.from(document.querySelectorAll('input,textarea')).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          aria: el.getAttribute('aria-label') || null,
          value: (el.value || '').slice(0,100)
        })).filter(x => /name|full|first|last/i.test((x.id||'') + ' ' + (x.name||'') + ' ' + (x.placeholder||'') + ' ' + (x.aria||'')));

        return {
          url: location.href,
          title: document.title,
          hasManu,
          personalDetailsLinks,
          nameInputs,
          sampleLinks: Array.from(document.querySelectorAll('a[href]')).slice(0,40).map(a => a.getAttribute('href'))
        };
      })()`
    }
  }));

  console.log(out);
} catch (e) {
  console.error('NAME_PROBE_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
