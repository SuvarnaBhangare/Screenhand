import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const NAME = 'Screenhand: AI Desktop Automation Copilot';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-create-from-new', version:'1.0.0' }, { capabilities:{} });
const t = r=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
try {
  await client.connect(transport);
  await client.callTool({name:'focus',arguments:{bundleId:'com.google.Chrome'}});
  await client.callTool({name:'browser_navigate',arguments:{url:'https://devpost.com/software/new'}});
  await client.callTool({name:'browser_wait',arguments:{condition:'document.readyState === "complete"',timeoutMs:20000}});
  const act = await client.callTool({name:'browser_js',arguments:{code:`(() => {
    const input = document.querySelector('#software_name');
    const btn = document.querySelector('#software_name_save_button');
    if (!input || !btn) return {ok:false, reason:'missing_input_or_button'};
    input.focus();
    input.value = ${JSON.stringify(NAME)};
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    btn.click();
    return {ok:true, value:input.value};
  })()`}});
  await sleep(4000);
  const info = await client.callTool({name:'browser_page_info',arguments:{}});
  const js = await client.callTool({name:'browser_js',arguments:{code:`(() => {
    const fields = Array.from(document.querySelectorAll('input,textarea,select')).map(el=>({id:el.id||null,name:el.name||null,type:el.getAttribute('type')||el.tagName.toLowerCase(),visible:!!(el.offsetParent!==null),required:!!el.required})).slice(0,120);
    const labels = Array.from(document.querySelectorAll('label,h1,h2,h3')).map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,80);
    const btns = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map(el=>({text:(el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,120),id:el.id||null,visible:!!(el.offsetParent!==null)})).filter(b=>b.visible&&b.text).slice(0,120);
    return {url:location.href,title:document.title,fields,labels,btns};
  })()`}});
  console.log('=== ACT ===\n'+t(act));
  console.log('=== INFO ===\n'+t(info));
  console.log('=== JS ===\n'+t(js));
} finally { try { await client.close(); } catch {} }
