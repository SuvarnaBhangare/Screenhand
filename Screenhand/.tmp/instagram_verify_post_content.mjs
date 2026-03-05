import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const POST_URL = 'https://www.instagram.com/screenhand_/p/DVf2aU7k-8Y/';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-verify-post-content', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if(!ig) throw new Error('No IG tab');
  const tabId = ig.id;

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:POST_URL }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 100', timeoutMs:20000 }});

  const out = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const b = (document.body?.innerText || '').replace(/\\s+/g,' ').trim().toLowerCase();
        return {
          url: location.href,
          title: document.title,
          hasLaunchingText: b.includes('launching screenhand today'),
          hasGithubText: b.includes('github.com/manushi4/screenhand'),
          hasHashtagMCP: b.includes('#mcp') || b.includes('mcp'),
          snippet: (document.body?.innerText || '').slice(0, 1200)
        };
      })()`
    }
  }));

  console.log(JSON.stringify(parse(out) || out, null, 2));
} catch (e) {
  console.error('VERIFY_CONTENT_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
