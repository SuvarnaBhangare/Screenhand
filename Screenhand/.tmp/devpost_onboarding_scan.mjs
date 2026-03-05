import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-onboarding-scan", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });

  const info = await client.callTool({ name:'browser_page_info', arguments:{} });
  const state = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const url = location.href;
    const title = document.title;

    const btns = Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"]'))
      .map((el,i)=>({
        i,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || '').trim().replace(/\\s+/g,' ').slice(0,120),
        href: el.getAttribute('href') || null,
        id: el.id || null,
        name: el.getAttribute('name') || null,
        cls: (el.className || '').toString().slice(0,120),
        disabled: !!el.disabled
      }))
      .filter(x => x.text.length > 0)
      .slice(0, 120);

    const importantBtns = btns.filter(b => /continue|next|get started|start|finish|complete|skip|save|submit|done|later|welcome|profile|dashboard|create|join|follow/i.test(b.text)).slice(0,40);

    const inputs = Array.from(document.querySelectorAll('input,textarea,select'))
      .map((el,i)=>({
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || null,
        id: el.id || null,
        name: el.getAttribute('name') || null,
        placeholder: el.getAttribute('placeholder') || null,
        value: (el.value || '').slice(0,60),
        required: !!el.required,
        visible: !!(el.offsetParent !== null)
      }))
      .slice(0, 80);

    const visibleText = (document.body?.innerText || '')
      .split('\\n')
      .map(s=>s.trim())
      .filter(Boolean)
      .filter(s => /welcome|onboard|profile|hackathon|skill|interest|follow|complete|next|continue|setup/i.test(s.toLowerCase()))
      .slice(0,40);

    return { url, title, importantBtns, inputs, visibleText };
  })()` } });

  console.log(JSON.stringify({ info: t(info), state: t(state) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
