import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-frontmost-check", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try{
  await client.connect(transport);
  const f = await client.callTool({name:'focus', arguments:{app:'Google Chrome'}});
  const a = await client.callTool({name:'apps', arguments:{}});
  console.log('focus:', t(f));
  console.log('apps:', t(a));
} finally { try{await client.close();}catch{} }
