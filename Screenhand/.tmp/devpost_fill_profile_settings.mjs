import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SETTINGS_URL = 'https://devpost.com/settings';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-fill-profile-settings', version:'1.0.0' }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function parseOrRaw(s){ try { return JSON.parse(s); } catch { return s; } }

async function js(code){
  const r = await client.callTool({ name:'browser_js', arguments:{ code } });
  return parseOrRaw(t(r));
}

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url: SETTINGS_URL } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const fill = await js(`(() => {
    const set = (sel, val, force=false) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return false;
      const current = (el.value || '').trim();
      if (!force && current.length > 0) return 'kept_existing';
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    const actions = {
      firstName: set('#user_first_name', 'Manu'),
      lastName: set('#user_last_name', 'Singhal'),
      tagline: set('#user_user_setting_attributes_tagline', 'Full-stack developer focused on AI and automation'),
      github: set('#user_user_setting_attributes_github_login', 'manushi4'),
      website: set('#user_user_setting_attributes_website', 'https://github.com/manushi4'),
      twitter: set('#user_user_setting_attributes_twitter', 'manu_singhal')
    };

    const submit = document.querySelector('input[type="submit"][value*="Save"], button[type="submit"]')
      || Array.from(document.querySelectorAll('input[type="submit"],button,[role="button"]')).find(el => /save changes|save|update/i.test((el.value||el.textContent||'').trim()));

    let submitAction = { clicked:false, reason:'not_found' };
    if (submit && !submit.disabled) {
      submit.click();
      submitAction = { clicked:true, text:(submit.value||submit.textContent||'').trim() };
    }

    return { url: location.href, actions, submitAction };
  })()`);

  await sleep(3000);

  const after = await js(`(() => {
    const msgs = Array.from(document.querySelectorAll('div,span,p,li')).map(e => (e.textContent||'').trim()).filter(Boolean)
      .filter(s => /saved|success|updated|error|invalid|required/i.test(s.toLowerCase()))
      .slice(0,40);

    const values = {
      first: document.querySelector('#user_first_name')?.value || null,
      last: document.querySelector('#user_last_name')?.value || null,
      tagline: document.querySelector('#user_user_setting_attributes_tagline')?.value || null,
      github: document.querySelector('#user_user_setting_attributes_github_login')?.value || null,
      website: document.querySelector('#user_user_setting_attributes_website')?.value || null,
      twitter: document.querySelector('#user_user_setting_attributes_twitter')?.value || null
    };

    return { url: location.href, title: document.title, values, msgs };
  })()`);

  const info = parseOrRaw(t(await client.callTool({ name:'browser_page_info', arguments:{} })));

  console.log(JSON.stringify({ fill, after, info }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
