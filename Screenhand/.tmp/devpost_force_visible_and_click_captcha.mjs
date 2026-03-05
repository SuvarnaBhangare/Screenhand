import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-force-visible-captcha", version:"1.0.0" }, { capabilities:{} });
const t = (r) => r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

try {
  await client.connect(transport);

  await client.callTool({ name:'focus', arguments:{ app:'Google Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs: 20000 } });

  const prep = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const emailForm = document.querySelector('.row.col-12.email-form');
    if (emailForm) {
      emailForm.classList.remove('hidden');
      emailForm.style.display = 'block';
      emailForm.style.visibility = 'visible';
      emailForm.style.opacity = '1';
    }

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
      email: set('#user_email', 'singhaldeoli106@gmail.com'),
      password: set('#user_password', 'Deoli@2026')
    };

    const frame = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]');
    if (frame) frame.scrollIntoView({ block: 'center' });

    const r = frame?.getBoundingClientRect();
    const toolbar = window.outerHeight - window.innerHeight;

    const clickPoint = frame && r ? {
      absX: Math.round(window.screenX + r.x + r.width / 2),
      absY: Math.round(window.screenY + toolbar + r.y + r.height / 2),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      toolbar,
      screenX: window.screenX,
      screenY: window.screenY,
      inner: { w: window.innerWidth, h: window.innerHeight },
      outer: { w: window.outerWidth, h: window.outerHeight }
    } : null;

    return {
      out,
      emailVisible: !!(document.querySelector('#user_email') && document.querySelector('#user_email').offsetParent !== null),
      tokenLenBefore: (document.querySelector('#g-recaptcha-response')?.value || '').length,
      clickPoint
    };
  })()` } });

  const prepObj = JSON.parse(t(prep));

  let clickResult = 'no-click-point';
  if (prepObj?.clickPoint?.absX && prepObj?.clickPoint?.absY) {
    const c = await client.callTool({ name:'click', arguments:{ x: prepObj.clickPoint.absX, y: prepObj.clickPoint.absY } });
    clickResult = t(c);
  }

  await sleep(3500);

  const post = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    const frame = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]');
    const r = frame?.getBoundingClientRect();
    const challenge = Array.from(document.querySelectorAll('iframe')).filter(f => /challenge|bframe/i.test((f.title||'') + ' ' + (f.src||''))).map(f => {
      const rr = f.getBoundingClientRect();
      return { title:f.title||null, src:f.src||null, rect:{x:Math.round(rr.x),y:Math.round(rr.y),w:Math.round(rr.width),h:Math.round(rr.height)} };
    });
    return {
      tokenLength: token.length,
      hasToken: token.length > 0,
      frameRect: r ? { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) } : null,
      challenge
    };
  })()` } });

  console.log(JSON.stringify({ prep: prepObj, clickResult, post: JSON.parse(t(post)) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
