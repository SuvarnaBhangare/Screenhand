import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-post-flow-scan', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/portfolio/redirect?page=projects' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  // Open create-project modal/page if available.
  await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const addBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /add a new project/i.test((el.textContent||'').trim()));
    if (addBtn) addBtn.click();
    return { clickedAdd: !!addBtn, url: location.href, title: document.title };
  })()` } });

  await new Promise(r=>setTimeout(r,1200));

  // Pick "No, just portfolio" if choice appears.
  await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const noBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /no,?\s*i\'?m just adding it to my portfolio/i.test((el.textContent||'').trim()));
    const yesBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /yes,?\s*i\'?m submitting to a hackathon/i.test((el.textContent||'').trim()));
    if (noBtn) noBtn.click();
    return { clickedNo: !!noBtn, hasYes: !!yesBtn, url: location.href, title: document.title };
  })()` } });

  await new Promise(r=>setTimeout(r,1800));

  const scan = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map((el,i)=>({
      i,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || null,
      placeholder: el.getAttribute('placeholder') || null,
      required: !!el.required,
      visible: !!(el.offsetParent !== null),
      value: (el.value||'').slice(0,80)
    })).filter(x=>x.visible).slice(0,200);

    const btns = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map((el,i)=>({
      i,
      tag: el.tagName.toLowerCase(),
      text: norm(el.textContent||el.value||'').slice(0,120),
      href: el.href || null,
      id: el.id || null,
      disabled: !!el.disabled,
      visible: !!(el.offsetParent !== null)
    })).filter(b=>b.visible && b.text).slice(0,120);

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,label')).map(el=>norm(el.textContent)).filter(Boolean).slice(0,120);

    return { url: location.href, title: document.title, inputs, btns, headings };
  })()` } });

  console.log(t(scan));
} finally {
  try { await client.close(); } catch {}
}
