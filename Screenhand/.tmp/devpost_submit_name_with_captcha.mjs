import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const NAME = 'Screenhand: AI Desktop Automation Copilot';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-submit-name-captcha', version:'1.0.0' }, { capabilities:{} });
const t = r => r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const prep = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const set = (sel,val)=>{
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    };

    const titleSet = set('#software_name', ${JSON.stringify(NAME)});
    const submit = document.querySelector('#software_name_save_button') || Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /save and continue|continue|save/i.test((el.textContent||el.value||'').trim()));
    const rec = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"], #g-recaptcha-response');
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    if (rec && rec.scrollIntoView) rec.scrollIntoView({ block:'center' });

    const iframe = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]');
    const r = iframe ? iframe.getBoundingClientRect() : null;
    const toolbar = window.outerHeight - window.innerHeight;
    const clickPoint = r ? {
      x: Math.round(window.screenX + r.x + 32),
      y: Math.round(window.screenY + toolbar + r.y + 39),
      rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
    } : null;

    return {
      titleSet,
      tokenLength: token.length,
      hasCaptcha: !!rec,
      submitFound: !!submit,
      submitDisabled: submit ? !!submit.disabled : null,
      clickPoint,
      url: location.href,
      title: document.title
    };
  })()` } });

  const prepObj = JSON.parse(t(prep));

  let captchaClick = null;
  if (prepObj.clickPoint?.x && prepObj.clickPoint?.y) {
    const click = await client.callTool({ name:'click', arguments:{ x: prepObj.clickPoint.x, y: prepObj.clickPoint.y } });
    captchaClick = t(click);
  }

  await sleep(4000);

  const post = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    const submit = document.querySelector('#software_name_save_button') || Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /save and continue|continue|save/i.test((el.textContent||el.value||'').trim()));
    return {
      tokenLength: token.length,
      submitFound: !!submit,
      submitDisabled: submit ? !!submit.disabled : null,
      url: location.href,
      title: document.title
    };
  })()` } });

  const postObj = JSON.parse(t(post));

  let submitRes = null;
  if (postObj.submitFound && !postObj.submitDisabled && postObj.tokenLength > 0) {
    const s = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
      const submit = document.querySelector('#software_name_save_button') || Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /save and continue|continue|save/i.test((el.textContent||el.value||'').trim()));
      if (!submit) return {clicked:false, reason:'not_found'};
      submit.click();
      return {clicked:true};
    })()` } });
    submitRes = t(s);
  }

  await sleep(3500);

  const finalInfo = await client.callTool({ name:'browser_page_info', arguments:{} });

  console.log(JSON.stringify({
    prep: prepObj,
    captchaClick,
    post: postObj,
    submitRes,
    finalInfo: JSON.parse(t(finalInfo))
  }, null, 2));
} finally { try { await client.close(); } catch {} }
