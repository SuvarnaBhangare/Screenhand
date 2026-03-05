import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'ig-ac-page-info', version:'1.0.0' }, { capabilities:{} });
const text=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const parse=(s)=>{try{return JSON.parse(s);}catch{return null;}};
const parseTabs=(t)=>t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

try{
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({name:'browser_tabs',arguments:{}})));
  const ac = tabs.find(t=>/accountscenter\.instagram\.com/.test(t.url)) || tabs.find(t=>/instagram\.com/.test(t.url));
  const tabId = ac.id;
  const infoRaw = text(await client.callTool({name:'browser_page_info',arguments:{tabId}}));
  const info = parse(infoRaw) || { raw: infoRaw };
  console.log(JSON.stringify(info, null, 2));
}catch(e){
  console.error('AC_PAGE_INFO_FAILED', String(e?.message||e));
  process.exitCode=1;
}finally{
  try{await client.close();}catch{}
}
