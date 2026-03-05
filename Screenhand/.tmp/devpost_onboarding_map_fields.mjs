import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-map-fields", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/settings/hackathon-recommendations?return_to=https%3A%2F%2Fdevpost.com%2F' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity||'1') > 0 && r.width > 0 && r.height > 0;
    };

    const requiredInputs = Array.from(document.querySelectorAll('input[required], select[required], textarea[required]')).map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || null,
      required: true,
      isVisible: visible(el),
      val: (el.value||'').slice(0,60)
    }));

    const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"], textarea, select')).map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      placeholder: el.getAttribute('placeholder') || null,
      isVisible: visible(el),
      val: (el.value||'').slice(0,60)
    }));

    const labeledOptions = Array.from(document.querySelectorAll('label[for]')).map(lb => {
      const id = lb.getAttribute('for');
      const ctl = id ? document.getElementById(id) : null;
      if (!ctl) return null;
      return {
        label: (lb.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120),
        id,
        type: ctl.getAttribute('type') || ctl.tagName.toLowerCase(),
        name: ctl.getAttribute('name') || null,
        checked: ctl.checked || false,
        visible: visible(lb) || visible(ctl)
      };
    }).filter(Boolean);

    const continueBtn = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]')).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      text: (el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,80),
      disabled: !!el.disabled
    })).filter(b => /continue|next|save|finish|done/i.test(b.text));

    return { url: location.href, requiredInputs, textInputs: textInputs.slice(0,60), labeledOptions: labeledOptions.slice(0,240), continueBtn };
  })()` } });

  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
