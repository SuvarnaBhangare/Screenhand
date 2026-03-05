import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-verify-latest-post', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if(!ig) throw new Error('No IG tab found');
  const tabId = ig.id;

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/screenhand_/' }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 100', timeoutMs:20000 }});

  const firstPostRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/p/"]')).map(a => a.getAttribute('href')).filter(Boolean);
        const uniq = Array.from(new Set(links));
        return { profileUrl: location.href, postLinks: uniq.slice(0, 8), count: uniq.length };
      })()`
    }
  }));
  const firstPost = parse(firstPostRaw);
  if (!firstPost || !firstPost.postLinks || firstPost.postLinks.length === 0) {
    console.log(JSON.stringify({ ok:false, reason:'no post links found', raw:firstPostRaw }, null, 2));
    process.exit(0);
  }

  const latest = firstPost.postLinks[0].startsWith('http') ? firstPost.postLinks[0] : `https://www.instagram.com${firstPost.postLinks[0]}`;
  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url: latest }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 100', timeoutMs:20000 }});

  const postRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const body = (document.body?.innerText || '').replace(/\\s+/g,' ').trim();
        return {
          url: location.href,
          title: document.title,
          hasLaunchingText: /launching screenhand today/i.test(body),
          hasGithubText: /github\.com\/manushi4\/screenhand/i.test(body),
          snippet: body.slice(0, 900)
        };
      })()`
    }
  }));

  console.log(JSON.stringify({ ok:true, profile:firstPost.profileUrl, latestPost:latest, profileScan:firstPost, post:parse(postRaw) || postRaw }, null, 2));
} catch (e) {
  console.error('VERIFY_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
