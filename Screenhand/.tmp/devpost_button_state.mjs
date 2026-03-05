import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-button", version:"1.0.0" }, { capabilities:{} });
const text = (r)=>r?.content?.find?.(c=>c.type==="text")?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  const res = await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const btn = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(e => /sign up with email|sign up|join/i.test((e.textContent||e.value||'').trim()));
    if (!btn) return {found:false};
    const r = btn.getBoundingClientRect();
    return {
      found:true,
      text:(btn.textContent||btn.value||'').trim(),
      disabled: !!btn.disabled,
      rect:{ x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) },
      center:{ x:Math.round(r.x + r.width/2), y:Math.round(r.y + r.height/2) }
    };
  })()` } });
  console.log(text(res));
} finally {
  try { await client.close(); } catch {}
}
