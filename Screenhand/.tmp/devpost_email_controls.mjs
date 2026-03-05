import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-email-controls", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try{
  await client.connect(transport);
  await client.callTool({name:'browser_navigate', arguments:{url:'https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button'}});
  await client.callTool({name:'browser_wait', arguments:{condition:'document.readyState === "complete"', timeoutMs:15000}});
  const res = await client.callTool({name:'browser_js', arguments:{code:`(() => {
    const controls = Array.from(document.querySelectorAll('a,button,[role="button"]'))
      .map((el,i)=>({
        i,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: el.className || null,
        text: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120),
        href: el.getAttribute('href'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        dataAttrs: Object.fromEntries(Array.from(el.attributes).filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]))
      }))
      .filter(c => /sign up with email|or sign up with email|join|register/i.test(c.text));

    const field = document.querySelector('#user_email');
    const visible = !!(field && field.offsetParent !== null);
    const style = field ? getComputedStyle(field) : null;

    return {
      controls,
      emailFieldExists: !!field,
      emailFieldVisible: visible,
      emailFieldStyle: style ? { display: style.display, visibility: style.visibility, opacity: style.opacity } : null
    };
  })()`}});
  console.log(t(res));
} finally {
  try{ await client.close(); }catch{}
}
