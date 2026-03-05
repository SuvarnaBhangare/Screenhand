import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const URL = 'https://x.com/screenhand_/status/2029617823178424794';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']});
const client = new Client({ name:'x-status-controls-probe', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.((c)=>c.type==='text')?.text || JSON.stringify(r);
const j=(s)=>{try{return JSON.parse(s);}catch{return null;}};

function parseTabs(text){
  return (text||'').split('\n').map((line)=>{const m=line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],title:m[2],url:m[3]}:null;}).filter(Boolean);
}

async function call(name,args={}){ const res = await client.callTool({ name, arguments: args }); return t(res); }

try{
  await client.connect(transport);
  await call('focus',{ bundleId:'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs',{}));
  const tab = tabs.find((x)=>/(x\.com|twitter\.com)/i.test(x.url));
  if(!tab) throw new Error('No X tab');
  await call('browser_navigate',{ tabId:tab.id, url:URL });
  await call('browser_wait',{ tabId:tab.id, condition:'document.body && document.body.innerText.length > 80', timeoutMs:30000 });

  const out = j(await call('browser_js',{ tabId:tab.id, code:`(() => {
    const q=(s)=>document.querySelectorAll(s).length;
    return {
      url: location.href,
      title: document.title,
      articles: q('article'),
      reply: q('[data-testid="reply"]'),
      like: q('[data-testid="like"]'),
      unlike: q('[data-testid="unlike"]'),
      repost: q('[data-testid="retweet"], [data-testid="unretweet"]'),
      bookmark: q('[data-testid="bookmark"], [data-testid="removeBookmark"]'),
      composer: q('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'),
      send: q('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'),
      dmNew: q('[data-testid="DM_New_Direct_Message_Button"], a[href="/messages/compose"]'),
      snippet: (document.body?.innerText || '').replace(/\s+/g,' ').slice(0,500)
    };
  })()` }));

  console.log(JSON.stringify({ ok:true, out }, null, 2));
}catch(err){
  console.log(JSON.stringify({ ok:false, error:String(err?.message||err) }, null, 2));
  process.exitCode=1;
}finally{ try{await client.close();}catch{} }
