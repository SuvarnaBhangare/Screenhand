import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-find-create-element', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if(!ig) throw new Error('No IG tab');
  const tabId = ig.id;

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/' }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 100', timeoutMs:12000 }});

  const outRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const all = Array.from(document.querySelectorAll('a,button,[role="button"],div,span'));
        const hits = all
          .map(el => {
            const text = clean(el.textContent);
            const aria = clean(el.getAttribute('aria-label'));
            const title = clean(el.getAttribute('title'));
            const href = el.getAttribute('href');
            const cls = (el.className||'').toString().slice(0,120);
            const testStr = (text + ' ' + aria + ' ' + title).trim();
            if (!/new post|create/i.test(testStr)) return null;
            const r = el.getBoundingClientRect();
            const visible = r.width > 12 && r.height > 12 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
            return {
              tag: el.tagName.toLowerCase(),
              text: text.slice(0,120),
              aria,
              title,
              href,
              class: cls,
              visible,
              rect: {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)},
              html: (el.outerHTML || '').slice(0,240)
            };
          })
          .filter(Boolean)
          .slice(0,80);

        const direct = {
          hrefCreate: !!document.querySelector('a[href="/create/"]'),
          ariaCreate: !!document.querySelector('[aria-label="New post"], [aria-label*="Create"], [aria-label*="new post" i]')
        };

        return { url: location.href, direct, hits };
      })()`
    }
  }));

  console.log(outRaw);
} catch (e) {
  console.error('FIND_CREATE_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
