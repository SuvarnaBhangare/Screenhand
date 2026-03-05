import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-profile-probe-mcp', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');
  const tabId = ig.id;

  console.log(text(await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/accounts/edit/' }})));
  console.log(text(await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 80', timeoutMs:15000 }})));

  const outRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const fields = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          aria: el.getAttribute('aria-label') || null,
          value: (el.value || '').slice(0,180),
          visible: (() => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; })()
        }));
        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: clean(b.textContent),
          type: b.type || null,
          disabled: !!b.disabled,
          visible: (() => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8; })()
        })).filter(b => b.visible);
        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
        const profileCandidates = links.filter(h => {
          if (!h) return false;
          if (!h.startsWith('/')) return false;
          if (h.startsWith('/accounts/')) return false;
          if (h.startsWith('/explore/')) return false;
          if (h.startsWith('/reels/')) return false;
          if (h.startsWith('/direct/')) return false;
          const parts = h.split('/').filter(Boolean);
          return parts.length === 1;
        }).slice(0, 10);
        return {
          url: location.href,
          title: document.title,
          fields,
          buttons,
          profileCandidates
        };
      })()`
    }
  }));

  console.log(outRaw);
} catch (e) {
  console.error('PROFILE_PROBE_MCP_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
