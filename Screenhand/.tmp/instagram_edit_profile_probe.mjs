import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-edit-profile-probe', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

async function js(tabId, code){ return text(await client.callTool({ name:'browser_js', arguments:{ tabId, code }})); }

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if(!ig) throw new Error('No instagram tab');
  const tabId = ig.id;

  console.log(text(await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/accounts/edit/' }})));
  console.log(text(await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.toLowerCase().includes("edit profile")', timeoutMs:15000 }})));

  const info = text(await client.callTool({ name:'browser_page_info', arguments:{ tabId }}));
  console.log('PAGE_INFO', info.slice(0,1000));

  const probe = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const inputs = Array.from(document.querySelectorAll('input,textarea,select,button')).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null,
      text: clean(el.textContent).slice(0,60) || null,
      role: el.getAttribute('role') || null
    }));
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      hasWebsitePlaceholder: !!document.querySelector('input[placeholder="Website"]'),
      hasBioId: !!document.querySelector('textarea#pepBio'),
      hasSubmitTextButton: Array.from(document.querySelectorAll('button')).some(b => /^submit$/i.test(clean(b.textContent))),
      submitButtons: Array.from(document.querySelectorAll('button')).map(b => ({type:b.type||null, text:clean(b.textContent).slice(0,80)})).filter(b=>/submit|save/i.test(b.text)),
      samples: inputs.slice(0,120),
      accountLinks: links.filter(h => h.startsWith('/accounts/')).slice(0,80)
    };
  })()`);

  console.log('PROBE', probe);
} catch (e) {
  console.error('PROBE_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
