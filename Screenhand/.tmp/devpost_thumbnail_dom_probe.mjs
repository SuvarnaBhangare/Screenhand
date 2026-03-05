import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-thumbnail-probe', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const all = Array.from(document.querySelectorAll('a,button,label,[role="button"],input[type="file"],img,source')).map((el, i) => {
      const text = norm(el.textContent || '');
      const id = el.id || null;
      const cls = (el.className || '').toString();
      const tag = el.tagName.toLowerCase();
      const src = el.getAttribute('src') || null;
      const forAttr = el.getAttribute('for') || null;
      const onclick = el.getAttribute('onclick') || null;
      const visible = !!(el.offsetParent !== null || tag === 'input' || tag === 'source');
      const marker = [text, id || '', cls, src || '', forAttr || ''].join(' ').toLowerCase();
      return { i, tag, id, className: cls.slice(0,140), text: text.slice(0,120), src, forAttr, onclick, visible, marker };
    });

    const thumbRelated = all.filter(x => /thumbnail|change image|photo|upload|software-thumbnail|software_photo|cover|image/i.test(x.marker)).slice(0,120);
    const visibleButtons = all.filter(x => x.visible && /change image|choose files|upload|thumbnail|photo/i.test(x.text.toLowerCase())).slice(0,80);

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
      id: el.id || null,
      name: el.name || null,
      className: (el.className || '').toString().slice(0,140),
      visible: !!(el.offsetParent !== null),
      accept: el.getAttribute('accept') || null
    }));

    return {
      url: location.href,
      title: document.title,
      thumbRelated,
      visibleButtons,
      fileInputs
    };
  })()` }});

  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
