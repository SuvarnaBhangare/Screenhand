import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-correct-focus", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

try{
  await client.connect(transport);

  const focusRes = await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  const appsRes = await client.callTool({ name:'apps', arguments:{} });

  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs: 20000 } });

  const prep = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const emailLink = document.querySelector('a.signup-email-link, a[href="#"], button');
    const exact = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /sign up with email/i.test((el.textContent||'').trim()));
    if (exact) exact.click();

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

    return {
      out,
      emailVisible: !!(document.querySelector('#user_email') && document.querySelector('#user_email').offsetParent !== null),
      tokenLenBefore: (document.querySelector('#g-recaptcha-response')?.value || '').length,
      point: frame && r ? {
        // checkbox square area in the left side of recaptcha anchor
        x: Math.round(window.screenX + r.x + 32),
        y: Math.round(window.screenY + toolbar + r.y + 39),
        frameRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        screenX: window.screenX,
        screenY: window.screenY,
        toolbar,
      } : null
    };
  })()` } });

  const prepObj = JSON.parse(t(prep));

  let clickRes = 'no-recaptcha-frame';
  if (prepObj?.point?.x && prepObj?.point?.y) {
    const c = await client.callTool({ name:'click', arguments:{ x: prepObj.point.x, y: prepObj.point.y } });
    clickRes = t(c);
  }

  await sleep(4500);

  const post = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    const anchor = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]');
    const ar = anchor?.getBoundingClientRect();
    const challenge = Array.from(document.querySelectorAll('iframe')).filter(f => /bframe|challenge/i.test((f.src||'') + ' ' + (f.title||''))).map(f => {
      const rr = f.getBoundingClientRect();
      return { title:f.title||null, src:f.src||null, rect:{x:Math.round(rr.x), y:Math.round(rr.y), w:Math.round(rr.width), h:Math.round(rr.height)} };
    });
    return {
      tokenLength: token.length,
      hasToken: token.length > 0,
      anchorRect: ar ? {x:Math.round(ar.x),y:Math.round(ar.y),w:Math.round(ar.width),h:Math.round(ar.height)} : null,
      challenge
    };
  })()` } });

  const windows = await client.callTool({ name:'windows', arguments:{} });
  const windowsText = t(windows);
  const line = windowsText.split(/\n/).find(l => /Google Chrome/i.test(l) && /Devpost/i.test(l)) || windowsText.split(/\n/).find(l => /Google Chrome/i.test(l));
  const m = line?.match(/^\[(\d+)\]/);
  const windowId = m ? Number(m[1]) : null;
  let shotPath = null;
  if (windowId) {
    const shot = await client.callTool({ name:'screenshot_file', arguments:{ windowId } });
    shotPath = t(shot);
  }

  console.log(JSON.stringify({
    focusRes: t(focusRes),
    apps: t(appsRes),
    prep: prepObj,
    clickRes,
    post: JSON.parse(t(post)),
    chromeWindowLine: line || null,
    screenshot: shotPath
  }, null, 2));
} finally {
  try{ await client.close(); }catch{}
}
