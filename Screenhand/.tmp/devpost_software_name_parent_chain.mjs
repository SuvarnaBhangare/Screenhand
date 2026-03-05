import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-parent-chain', version:'1.0.0' }, { capabilities:{} });
const t = r => r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
try {
  await client.connect(transport);
  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const el = document.querySelector('#software_name');
    if (!el) return {found:false};
    const chain = [];
    let n = el;
    for (let i=0;i<12 && n;i++) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      chain.push({
        tag: n.tagName.toLowerCase(),
        id: n.id || null,
        classes: (n.className || '').toString().slice(0,140),
        hiddenAttr: n.hasAttribute('hidden'),
        ariaHidden: n.getAttribute('aria-hidden'),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
      });
      n = n.parentElement;
    }
    return {found:true, chain};
  })()` } });
  console.log(t(res));
} finally { try { await client.close(); } catch {} }
