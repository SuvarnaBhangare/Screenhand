import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-public-media-probe', version:'1.0.1' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:30000 } });

  const pub = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => i.getAttribute('src')).filter(Boolean);
    const software = imgs.filter(s => s.includes('/production/software_'));
    const body = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      softwareImages: software,
      softwareImageCount: software.length,
      hasGalleryText: body.includes('Image gallery') || body.includes('Gallery')
    };
  })()` }});

  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:30000 } });

  const edit = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const list = document.querySelector('.image-gallery-list');
    const items = list ? Array.from(list.querySelectorAll('li, .gallery-item')).length : 0;
    const imgs = list ? Array.from(list.querySelectorAll('img')).map(i => i.getAttribute('src')).filter(Boolean) : [];
    return {
      url: location.href,
      title: document.title,
      galleryItems: items,
      galleryImages: imgs,
      thumb: document.querySelector('#software-thumbnail-image') ? document.querySelector('#software-thumbnail-image').getAttribute('src') : null
    };
  })()` }});

  console.log(JSON.stringify({ publicRaw: t(pub), editRaw: t(edit) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
