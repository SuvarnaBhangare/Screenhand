import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-visibility-debug", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try{
  await client.connect(transport);
  await client.callTool({name:'browser_navigate', arguments:{url:'https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button'}});
  await client.callTool({name:'browser_wait', arguments:{condition:'document.readyState === "complete"', timeoutMs:15000}});
  const res = await client.callTool({name:'browser_js', arguments:{code:`(() => {
    const field = document.querySelector('#user_email');
    if (!field) return {found:false};

    const chain = [];
    let n = field;
    for (let i=0; i<8 && n; i++) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      chain.push({
        tag: n.tagName.toLowerCase(),
        id: n.id || null,
        classes: n.className || null,
        hiddenAttr: n.hasAttribute('hidden'),
        ariaHidden: n.getAttribute('aria-hidden'),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
      });
      n = n.parentElement;
    }

    const link = document.querySelector('a.signup-email-link');
    const submitBtn = document.querySelector('#submit-form');

    return {
      found:true,
      linkText: link?.textContent?.trim() || null,
      submitText: submitBtn?.textContent?.trim() || null,
      fieldOffsetParentTag: field.offsetParent?.tagName || null,
      fieldClientRects: field.getClientRects().length,
      chain
    };
  })()`}});
  console.log(t(res));
} finally {
  try{ await client.close(); }catch{}
}
