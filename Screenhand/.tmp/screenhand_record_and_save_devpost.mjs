import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SIGNUP_URL = 'https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button';
const ONBOARD_URL = 'https://devpost.com/settings/hackathon-recommendations?return_to=https%3A%2F%2Fdevpost.com%2F';
const SETTINGS_URL = 'https://devpost.com/settings';
const PORTFOLIO_URL = 'https://devpost.com/portfolio/redirect?page=projects';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});

const client = new Client({ name: 'screenhand-record-save-devpost', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return text(res);
}

try {
  await client.connect(transport);

  await call('focus', { bundleId: 'com.google.Chrome' });

  await call('browser_navigate', { url: SIGNUP_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 20000 });
  await call('browser_js', {
    code: `(() => {
      const emailLink = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /sign up with email/i.test((el.textContent||'').trim()));
      if (emailLink) emailLink.click();
      return {
        url: location.href,
        emailFormPresent: !!document.querySelector('#user_email'),
        fields: ['#user_first_name','#user_last_name','#user_email','#user_password'].map(s => ({ selector: s, exists: !!document.querySelector(s) }))
      };
    })()`
  });

  await call('browser_navigate', { url: ONBOARD_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 20000 });
  await call('browser_js', {
    code: `(() => {
      const req = Array.from(document.querySelectorAll('input[required],select[required],textarea[required]')).map(el => ({ id: el.id||null, name: el.name||null }));
      const continueBtn = !!Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /continue/i.test((el.textContent||el.value||'').trim()));
      return { url: location.href, requiredCount: req.length, continueBtn, required: req.slice(0,10) };
    })()`
  });

  await call('browser_navigate', { url: SETTINGS_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 20000 });
  await call('browser_js', {
    code: `(() => {
      const fields = ['#user_first_name','#user_last_name','#user_user_setting_attributes_tagline','#user_user_setting_attributes_github_login','#user_user_setting_attributes_website'];
      return {
        url: location.href,
        editableFields: fields.map(s => ({ selector: s, exists: !!document.querySelector(s) })),
        saveButton: !!Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).find(el => /save/i.test((el.textContent||el.value||'').trim()))
      };
    })()`
  });

  await call('browser_navigate', { url: PORTFOLIO_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 20000 });
  await call('browser_js', {
    code: `(() => {
      const addProject = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /add a new project/i.test((el.textContent||'').trim()));
      return { url: location.href, addProjectVisible: !!addProject };
    })()`
  });

  const save = await call('memory_save', {
    task: 'Devpost fast setup: signup page check, onboarding page check, settings update page, and portfolio readiness check',
    tags: ['devpost', 'signup', 'onboarding', 'settings', 'portfolio', 'screenhand']
  });

  const recall = await call('memory_recall', {
    task: 'Devpost account setup and onboarding automation',
    limit: 5
  });

  const stats = await call('memory_stats', {});

  console.log('=== MEMORY_SAVE ===');
  console.log(save);
  console.log('\n=== MEMORY_RECALL ===');
  console.log(recall);
  console.log('\n=== MEMORY_STATS ===');
  console.log(stats);
} finally {
  try { await client.close(); } catch {}
}
