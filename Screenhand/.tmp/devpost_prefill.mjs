import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-prefill", version:"1.0.0" }, { capabilities:{} });
const text = (r)=>r?.content?.find?.(c=>c.type==="text")?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:"focus", arguments:{ app:"Google Chrome" } });
  await client.callTool({ name:"browser_navigate", arguments:{ url:"https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button" } });
  await client.callTool({ name:"browser_wait", arguments:{ condition:"document.readyState === \"complete\"", timeoutMs:15000 } });

  await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const cands = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const el = cands.find(e => /sign up with email/i.test((e.textContent||'').trim()));
    if (el) el.click();
    return {clicked: !!el};
  })()` } });
  await new Promise(r=>setTimeout(r, 1200));

  const fill = await client.callTool({ name:"browser_js", arguments:{ code:`(() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const out = {
      first: set('#user_first_name', 'Manu'),
      last: set('#user_last_name', 'Singhal'),
      password: set('#user_password', 'Deoli@2026')
    };
    const values = {
      first: document.querySelector('#user_first_name')?.value || null,
      last: document.querySelector('#user_last_name')?.value || null,
      email: document.querySelector('#user_email')?.value || null,
      passwordLen: (document.querySelector('#user_password')?.value || '').length
    };
    return { out, values, url: location.href, title: document.title };
  })()` } });

  console.log(text(fill));
} finally {
  try { await client.close(); } catch {}
}
