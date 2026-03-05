import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-new-route', version:'1.0.0' }, { capabilities:{} });
const t=r=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
try {
  await client.connect(transport);
  await client.callTool({name:'focus',arguments:{bundleId:'com.google.Chrome'}});
  await client.callTool({name:'browser_navigate',arguments:{url:'https://devpost.com/software/new'}});
  await client.callTool({name:'browser_wait',arguments:{condition:'document.readyState === "complete"',timeoutMs:20000}});
  const info = await client.callTool({name:'browser_page_info',arguments:{}});
  const js = await client.callTool({name:'browser_js',arguments:{code:`(() => {
    const fields = Array.from(document.querySelectorAll('input,textarea,select')).map(el=>({id:el.id||null,name:el.name||null,type:el.getAttribute('type')||el.tagName.toLowerCase(),visible:!!(el.offsetParent!==null),required:!!el.required})).slice(0,80);
    const btns = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map(el=>({text:(el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,120),id:el.id||null,visible:!!(el.offsetParent!==null)})).filter(b=>b.visible&&b.text).slice(0,80);
    const h = Array.from(document.querySelectorAll('h1,h2,h3,label')).map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,50);
    return {url:location.href,title:document.title,fields,btns,h};
  })()`}});
  console.log('=== INFO ===\n'+t(info));
  console.log('=== JS ===\n'+t(js));
} finally { try { await client.close(); } catch {} }
