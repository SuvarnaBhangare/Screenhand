import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-checkbox-precise", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

try{
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ app:'Google Chrome' } });

  const p = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const frame = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]');
    if (!frame) return { found:false };
    frame.scrollIntoView({ block: 'center' });
    const r = frame.getBoundingClientRect();
    const toolbar = window.outerHeight - window.innerHeight;
    // Checkbox square is near left edge of anchor iframe.
    const absX = Math.round(window.screenX + r.x + 32);
    const absY = Math.round(window.screenY + toolbar + r.y + 39);
    return { found:true, absX, absY, rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)} };
  })()` } });

  const point = JSON.parse(t(p));
  let clickRes = 'no-frame';
  if (point.found) {
    const c = await client.callTool({ name:'click', arguments:{ x:point.absX, y:point.absY } });
    clickRes = t(c);
  }

  await sleep(3500);

  const s = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    const challengeFrame = Array.from(document.querySelectorAll('iframe')).find(f => /bframe|challenge/i.test((f.src||'') + ' ' + (f.title||'')));
    const cr = challengeFrame ? challengeFrame.getBoundingClientRect() : null;
    return {
      tokenLength: token.length,
      hasToken: token.length > 0,
      challengeVisible: !!(cr && cr.width > 0 && cr.height > 0 && cr.y >= 0),
      challengeRect: cr ? {x:Math.round(cr.x),y:Math.round(cr.y),w:Math.round(cr.width),h:Math.round(cr.height)} : null
    };
  })()` } });

  console.log(JSON.stringify({ point, clickRes, state: JSON.parse(t(s)) }, null, 2));
} finally {
  try{ await client.close(); }catch{}
}
