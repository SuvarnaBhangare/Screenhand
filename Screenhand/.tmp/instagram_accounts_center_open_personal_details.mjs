import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'ig-ac-open-personal-details', version:'1.0.0' }, { capabilities:{} });
const text=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const parse=(s)=>{try{return JSON.parse(s);}catch{return null;}};
const parseTabs=(t)=>t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try{
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({name:'browser_tabs',arguments:{}})));
  const tab = tabs.find(t=>/accountscenter\.instagram\.com/.test(t.url)) || tabs.find(t=>/instagram\.com/.test(t.url));
  if(!tab) throw new Error('No tab found');
  const tabId = tab.id;

  console.log(text(await client.callTool({name:'browser_navigate',arguments:{tabId,url:'https://accountscenter.instagram.com/profiles/'}})));
  console.log(text(await client.callTool({name:'browser_wait',arguments:{tabId,condition:'document.body && document.body.innerText.includes("Personal details")',timeoutMs:20000}})));

  const clickRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const nodes = Array.from(document.querySelectorAll('a,button,[role="button"],div,span')).map(el => {
          const txt = clean(el.textContent);
          const r = el.getBoundingClientRect();
          const visible = r.width > 12 && r.height > 12 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
          return { el, txt, area:r.width*r.height, visible };
        }).filter(x => x.visible && x.txt.toLowerCase() === 'personal details' && x.area < 120000);

        if (!nodes.length) return { ok:false, reason:'Personal details control not found' };
        const target = nodes.sort((a,b)=>a.area-b.area)[0].el;
        target.scrollIntoView({ block:'center' });
        target.click();
        return { ok:true, clickedText:'Personal details' };
      })()`
    }
  }));
  console.log('CLICK:', clickRaw);

  console.log(text(await client.callTool({name:'browser_wait',arguments:{tabId,condition:'document.body && (document.body.innerText.includes("Name") || document.body.innerText.includes("Personal details"))',timeoutMs:12000}})));

  const infoRaw = text(await client.callTool({name:'browser_page_info',arguments:{tabId}}));
  console.log('INFO:', infoRaw);

  const fieldsRaw = text(await client.callTool({
    name:'browser_js',
    arguments:{
      tabId,
      code:`(() => {
        const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
        const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type||null,
          id: el.id||null,
          name: el.name||null,
          placeholder: el.placeholder||null,
          aria: el.getAttribute('aria-label')||null,
          value: (el.value||'').slice(0,120)
        }));
        const actions = Array.from(document.querySelectorAll('a[href],button,[role="button"]')).map(el => ({
          text: clean(el.textContent),
          aria: clean(el.getAttribute('aria-label')),
          href: el.getAttribute('href')||null
        })).filter(x => /name|edit|save|next|continue|personal/i.test((x.text+' '+x.aria).toLowerCase())).slice(0,80);
        return { url: location.href, title: document.title, inputs, actions };
      })()`
    }
  }));

  console.log('FIELDS:', fieldsRaw);
}catch(e){
  console.error('OPEN_PERSONAL_DETAILS_FAILED', String(e?.message||e));
  process.exitCode=1;
}finally{
  try{await client.close();}catch{}
}
