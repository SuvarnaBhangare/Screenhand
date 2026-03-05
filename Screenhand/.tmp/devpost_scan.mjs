import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-form-scan", version:"1.0.0" }, { capabilities:{} });

const text = (r)=>r?.content?.find?.(c=>c.type==="text")?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:"focus", arguments:{ app:"Google Chrome" } });
  await client.callTool({ name:"browser_navigate", arguments:{ url:"https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button" } });
  await client.callTool({ name:"browser_wait", arguments:{ condition:"document.readyState === \"complete\"", timeoutMs:15000 } });

  const before = await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const items = Array.from(document.querySelectorAll("a,button")).map((el,i)=>({i,tag:el.tagName.toLowerCase(),text:(el.textContent||"").trim().replace(/\\s+/g," ").slice(0,80),href:el.href||null}));
    return items.filter(x=>/email|join|sign up|register|continue/i.test(x.text)).slice(0,30);
  })()` } });

  const clickEmail = await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const targets = Array.from(document.querySelectorAll("a,button,[role=\\"button\\"]"));
    const t = targets.find(el => /sign up with email/i.test((el.textContent||"").trim()));
    if (!t) return {clicked:false, reason:"not_found"};
    t.click();
    return {clicked:true, tag:t.tagName, text:(t.textContent||"").trim()};
  })()` } });

  await new Promise(r=>setTimeout(r, 1200));

  const after = await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const inputs = Array.from(document.querySelectorAll("input,select,textarea")).map((el,i)=>({
      i,
      tag:el.tagName.toLowerCase(),
      type:el.getAttribute("type") || null,
      name:el.getAttribute("name") || null,
      id:el.id || null,
      placeholder:el.getAttribute("placeholder") || null,
      ariaLabel:el.getAttribute("aria-label") || null,
      required:el.required || false,
      value:(el.value||"").slice(0,30)
    }));
    const buttons = Array.from(document.querySelectorAll("button,input[type=\\"submit\\"],[role=\\"button\\"]")).map((el,i)=>({
      i,
      tag:el.tagName.toLowerCase(),
      type:el.getAttribute("type") || null,
      text:(el.textContent||el.value||"").trim().replace(/\\s+/g," ").slice(0,80),
      disabled: !!el.disabled
    }));
    return {url:location.href, title:document.title, inputs, buttons};
  })()` } });

  console.log("=== BEFORE CTA CANDIDATES ===");
  console.log(text(before));
  console.log("=== CLICK EMAIL RESULT ===");
  console.log(text(clickEmail));
  console.log("=== AFTER FORM SNAPSHOT ===");
  console.log(text(after));
} finally {
  try { await client.close(); } catch {}
}
