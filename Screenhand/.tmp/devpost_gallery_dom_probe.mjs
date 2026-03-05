import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-gallery-dom-probe', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:30000 } });

  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const els = Array.from(document.querySelectorAll('*')).filter(el => {
      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toString().toLowerCase();
      const txt = norm(el.textContent || '').toLowerCase();
      return /photo|gallery|thumbnail|video/.test(id + ' ' + cls + ' ' + txt);
    }).slice(0, 200);

    const mapped = els.map((el, i) => ({
      i,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (el.className || '').toString().slice(0,160),
      text: norm(el.textContent || '').slice(0,140),
      visible: !!(el.offsetParent !== null)
    }));

    const inputs = Array.from(document.querySelectorAll('input[type="file"], input')).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      id: el.id || null,
      name: el.name || null,
      accept: el.getAttribute('accept') || null,
      multiple: el.hasAttribute('multiple'),
      value: (el.value || '').slice(0,120)
    })).slice(0, 120);

    const imgs = Array.from(document.querySelectorAll('img')).map((img, i) => ({
      i,
      id: img.id || null,
      cls: (img.className || '').toString().slice(0,140),
      src: img.getAttribute('src') || null,
      alt: img.getAttribute('alt') || null,
      visible: !!(img.offsetParent !== null)
    })).filter(x => /photo|thumbnail|d112y698adiu2z|cloudfront/i.test((x.id||'')+' '+(x.cls||'')+' '+(x.src||''))).slice(0, 80);

    return { url: location.href, title: document.title, mapped, inputs, imgs };
  })()` }});

  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
