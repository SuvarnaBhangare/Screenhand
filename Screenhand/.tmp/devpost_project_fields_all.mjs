import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-fields-all', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
try {
  await client.connect(transport);
  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const visible = (el) => !!(el && el.offsetParent !== null && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
    const fields = Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')).map((el,i) => ({
      i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      id: el.id || null,
      name: el.getAttribute('name') || null,
      placeholder: el.getAttribute('placeholder') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      required: !!el.required,
      visible: visible(el),
      classes: (el.className || '').toString().slice(0,120),
      value: (el.value || el.textContent || '').slice(0,100)
    }));
    const forms = Array.from(document.querySelectorAll('form')).map((f,i)=>({i,id:f.id||null,action:f.getAttribute('action')||null,classes:(f.className||'').toString().slice(0,100),visible:visible(f)}));
    return {url:location.href,title:document.title,fields,forms,activeEl: document.activeElement ? {tag:document.activeElement.tagName.toLowerCase(),id:document.activeElement.id||null,classes:(document.activeElement.className||'').toString().slice(0,100),value:(document.activeElement.value||document.activeElement.textContent||'').slice(0,100)}: null};
  })()` } });
  console.log(t(res));
} finally { try { await client.close(); } catch {} }
