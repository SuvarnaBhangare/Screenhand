import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PROFILE_URL = 'https://devpost.com/settings/profile';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-profile-fill', version:'1.0.0' }, { capabilities:{} });
const t = (r) => r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

function parseOrRaw(s){ try { return JSON.parse(s); } catch { return s; } }

async function js(code){
  const r = await client.callTool({ name:'browser_js', arguments:{ code } });
  return parseOrRaw(t(r));
}

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });

  await client.callTool({ name:'browser_navigate', arguments:{ url: PROFILE_URL } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });
  await sleep(1500);

  const before = await js(`(() => {
    const visible = (el) => !!(el && el.offsetParent !== null);
    const fields = Array.from(document.querySelectorAll('input[type="text"],input[type="url"],textarea,select,input[type="email"]'))
      .map(el => ({
        id: el.id || null,
        name: el.getAttribute('name') || null,
        placeholder: el.getAttribute('placeholder') || null,
        value: (el.value||'').slice(0,120),
        visible: visible(el)
      }))
      .filter(f => f.visible)
      .slice(0,120);

    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).map(el => ({
      text: (el.textContent||el.value||'').trim().replace(/\\s+/g,' ').slice(0,80),
      disabled: !!el.disabled
    })).filter(b => b.text).slice(0,40);

    return { url: location.href, title: document.title, fields, buttons };
  })()`);

  const fill = await js(`(() => {
    const set = (sel,val) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return false;
      if (!el.value || el.value.trim() === '') {
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles:true }));
        el.dispatchEvent(new Event('change', { bubbles:true }));
        return true;
      }
      return false;
    };

    const actions = {
      firstName: set('#user_first_name','Manu'),
      lastName: set('#user_last_name','Singhal'),
      displayName: set('#user_display_name','Manu Singhal'),
      headline: set('#user_headline','Full-stack developer focused on AI and automation'),
      bio: set('#user_bio','Builder interested in full-stack apps, automation workflows, and practical AI products.'),
      website: set('#user_website_url','https://devpost.com/'),
      github: set('#user_github_url','https://github.com/manushi4'),
      city: set('#user_location','Jaipur, Rajasthan, India') || set('#user_address','Jaipur, Rajasthan, India')
    };

    const saveBtn = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /save|update|continue|submit/i.test((el.textContent||el.value||'').trim()));
    let save = null;
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.click();
      save = { clicked:true, text:(saveBtn.textContent||saveBtn.value||'').trim() };
    } else {
      save = { clicked:false, reason:'no_enabled_save' };
    }

    return { actions, save, url: location.href };
  })()`);

  await sleep(2500);

  const after = await js(`(() => {
    const msgs = Array.from(document.querySelectorAll('div,span,p,li')).map(e => (e.textContent||'').trim()).filter(Boolean)
      .filter(s => /saved|updated|error|required|invalid|success/i.test(s.toLowerCase()))
      .slice(0,30);

    const url = location.href;
    const title = document.title;

    return { url, title, msgs };
  })()`);

  const info = parseOrRaw(t(await client.callTool({ name:'browser_page_info', arguments:{} })));

  console.log(JSON.stringify({ before, fill, after, info }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
