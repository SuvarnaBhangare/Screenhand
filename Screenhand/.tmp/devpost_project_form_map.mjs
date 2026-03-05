import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-project-form-map', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/singhaldeoli106' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  // Open new project picker
  await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const addBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /add a new project/i.test((el.textContent||'').trim()));
    if (addBtn) addBtn.click();
    return {clicked:!!addBtn};
  })()` } });

  await new Promise(r=>setTimeout(r,1200));

  // Choose portfolio-only option
  await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const noBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /no,?\s*i\'?m\s*just\s*adding\s*it\s*to\s*my\s*portfolio/i.test((el.textContent||'').trim()));
    if (noBtn) noBtn.click();
    return {clickedNo:!!noBtn, text:noBtn ? (noBtn.textContent||'').trim() : null};
  })()` } });

  await new Promise(r=>setTimeout(r,1500));

  const map = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
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
      className: (el.className || '').toString().slice(0,140),
      value: (el.value || el.textContent || '').slice(0,120)
    }));

    const labels = Array.from(document.querySelectorAll('label')).map((lb,i)=>({
      i,
      text: norm(lb.textContent).slice(0,140),
      htmlFor: lb.getAttribute('for') || null,
      visible: visible(lb)
    })).filter(x=>x.visible && x.text).slice(0,160);

    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map((el,i)=>({
      i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      text: norm(el.textContent || el.value || '').slice(0,160),
      id: el.id || null,
      href: el.href || null,
      visible: visible(el),
      disabled: !!el.disabled
    })).filter(x=>x.visible && x.text).slice(0,200);

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => norm(h.textContent)).filter(Boolean).slice(0,80);

    return {
      url: location.href,
      title: document.title,
      headings,
      fieldsVisible: fields.filter(f=>f.visible).slice(0,200),
      fieldsAllCount: fields.length,
      labels,
      buttons
    };
  })()` } });

  console.log(t(map));
} finally {
  try { await client.close(); } catch {}
}
