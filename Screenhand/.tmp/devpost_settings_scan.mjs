import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-settings-scan', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/settings' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const info = await client.callTool({ name:'browser_page_info', arguments:{} });
  const dom = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({ text:(a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80), href:a.href })).filter(l => l.text).slice(0,200);
    const fields = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      placeholder: el.getAttribute('placeholder') || null,
      value: (el.value || '').slice(0,80),
      visible: !!(el.offsetParent !== null),
      required: !!el.required
    })).slice(0,200);
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).map(el => ({ text:(el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,80), disabled: !!el.disabled })).filter(b => b.text).slice(0,100);
    return { url: location.href, title: document.title, links, fields, buttons };
  })()` } });

  console.log(JSON.stringify({ info:t(info), dom:t(dom) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
