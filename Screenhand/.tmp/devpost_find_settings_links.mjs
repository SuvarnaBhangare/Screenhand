import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-find-settings', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80),
      href: a.href
    }));
    const filtered = links.filter(l => /settings|profile|account|preferences|edit/i.test(l.text) || /\/settings|\/profile|\/users\//i.test(l.href));
    return { url: location.href, title: document.title, filtered: filtered.slice(0,120) };
  })()` } });

  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
