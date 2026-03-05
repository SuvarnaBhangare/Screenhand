import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-captcha-probe', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/new' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const input = document.querySelector('#software_name');
    const submit = document.querySelector('#software_name_save_button');
    if (input) {
      input.focus();
      input.value = 'Screenhand: AI Desktop Automation Copilot';
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    }
    if (submit) submit.click();

    const iframes = Array.from(document.querySelectorAll('iframe')).map((f, i) => {
      const r = f.getBoundingClientRect();
      return {
        i,
        id: f.id || null,
        title: f.title || null,
        name: f.name || null,
        src: f.getAttribute('src') || null,
        visible: !!(f.offsetParent !== null && getComputedStyle(f).visibility !== 'hidden' && getComputedStyle(f).display !== 'none'),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      };
    });

    const rec = iframes.find(x => /recaptcha/i.test((x.src||'') + ' ' + (x.title||'') + ' ' + (x.name||'')));
    const token = document.querySelector('#g-recaptcha-response')?.value || '';
    const notices = Array.from(document.querySelectorAll('p,div,span')).map(e => norm(e.textContent)).filter(Boolean).filter(x => /captcha|robot|submit this form|complete the reCAPTCHA/i.test(x)).slice(0,20);

    const anchor = Array.from(document.querySelectorAll('iframe')).find(f => /recaptcha/i.test((f.getAttribute('src')||'') + ' ' + (f.title||'') + ' ' + (f.name||'')));
    let clickPoint = null;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const toolbar = window.outerHeight - window.innerHeight;
      clickPoint = {
        x: Math.round(window.screenX + r.x + Math.min(35, r.width / 2)),
        y: Math.round(window.screenY + toolbar + r.y + Math.min(35, r.height / 2)),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      };
    }

    return {
      url: location.href,
      title: document.title,
      inputValue: input?.value || null,
      submitDisabled: submit ? !!submit.disabled : null,
      tokenLength: token.length,
      notices,
      recaptcha: rec || null,
      clickPoint,
      iframeCount: iframes.length,
      iframes: iframes.slice(0,20)
    };
  })()` }});

  console.log(t(res));
} finally {
  try { await client.close(); } catch {}
}
