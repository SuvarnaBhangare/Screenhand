import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-readiness-check', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/portfolio/redirect?page=projects' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const state = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const ctas = Array.from(document.querySelectorAll('a,button,[role="button"],input[type="submit"]'))
      .map(el => ({ text:(el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,80), href:el.href || null }))
      .filter(x => x.text)
      .filter(x => /submit|project|new|create|start|add/i.test(x.text))
      .slice(0, 50);

    const alerts = Array.from(document.querySelectorAll('div,span,p,li')).map(e => (e.textContent||'').trim()).filter(Boolean)
      .filter(s => /verify|complete profile|required|error|need|cannot|must/i.test(s.toLowerCase()))
      .slice(0, 30);

    return { url: location.href, title: document.title, ctas, alerts };
  })()` } });

  const info = await client.callTool({ name:'browser_page_info', arguments:{} });
  console.log(JSON.stringify({ state: t(state), info: t(info) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
