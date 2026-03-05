import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-ocr-robot-check", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ app:'Google Chrome' } });
  const wr = await client.callTool({ name:'windows', arguments:{} });
  const wt = t(wr);
  const line = wt.split(/\n/).find(l => /Google Chrome/i.test(l) && /Devpost/i.test(l)) || wt.split(/\n/).find(l => /Google Chrome/i.test(l));
  const m = line?.match(/^\[(\d+)\]/);
  const windowId = m ? Number(m[1]) : null;

  if (!windowId) {
    console.log(JSON.stringify({ line, error:'no-window-id' }, null, 2));
    process.exit(0);
  }

  const o = await client.callTool({ name:'ocr', arguments:{ windowId } });
  const raw = t(o);
  const parsed = JSON.parse(raw);
  const matches = (parsed.elements || []).filter((s) => /robot|captcha|verify|human/i.test(s));
  console.log(JSON.stringify({ line, windowId, image: parsed.image, window: parsed.window, matchCount: matches.length, matches }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
