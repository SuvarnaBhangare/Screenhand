import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-find-settings2', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const code = `(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map((a) => {
      return {
        text: (a.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
        href: a.href || ''
      };
    });

    const filtered = links.filter((l) => {
      const text = (l.text || '').toLowerCase();
      const href = (l.href || '').toLowerCase();
      return text.includes('settings') || text.includes('profile') || text.includes('account') || text.includes('preferences') || text.includes('edit') || href.includes('/settings') || href.includes('/profile') || href.includes('/users/');
    }).slice(0, 120);

    return {
      url: location.href,
      title: document.title,
      filtered
    };
  })()`;

  const res = await client.callTool({ name:'browser_js', arguments:{ code } });
  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
