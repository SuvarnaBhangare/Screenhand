import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PROJECT_NAME = 'Screenhand: AI Desktop Automation Copilot';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-create-draft', version:'1.0.0' }, { capabilities:{} });
const t = r => r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/singhaldeoli106' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const prep = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const addBtn = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /add a new project/i.test((el.textContent||'').trim()));
    if (addBtn) addBtn.click();

    const modal = document.querySelector('#hackathon-picker');
    const form = document.querySelector('#software_editor');
    const input = document.querySelector('#software_name');
    const saveBtn = document.querySelector('#software_name_save_button');

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'block';
      modal.style.visibility = 'visible';
      modal.style.opacity = '1';
    }

    // Reveal hidden parents of form input
    let p = input?.parentElement || null;
    for (let i=0; i<8 && p; i++) {
      if (getComputedStyle(p).display === 'none') p.style.display = 'block';
      if (getComputedStyle(p).visibility === 'hidden') p.style.visibility = 'visible';
      p = p.parentElement;
    }

    if (form) {
      let fp = form.parentElement;
      for (let i=0; i<6 && fp; i++) {
        if (getComputedStyle(fp).display === 'none') fp.style.display = 'block';
        if (getComputedStyle(fp).visibility === 'hidden') fp.style.visibility = 'visible';
        fp = fp.parentElement;
      }
    }

    if (input) {
      input.focus();
      input.value = ${JSON.stringify(PROJECT_NAME)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (saveBtn) {
      saveBtn.style.display = 'inline-block';
      saveBtn.disabled = false;
      saveBtn.click();
    } else if (form) {
      form.submit();
    }

    return {
      clickedAdd: !!addBtn,
      hasModal: !!modal,
      hasForm: !!form,
      hasInput: !!input,
      hasSaveBtn: !!saveBtn,
      inputValue: input ? input.value : null,
      url: location.href,
      title: document.title
    };
  })()` } });

  await new Promise(r=>setTimeout(r,3500));

  const state = await client.callTool({ name:'browser_page_info', arguments:{} });
  const debug = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const url = location.href;
    const title = document.title;
    const forms = Array.from(document.querySelectorAll('form')).map(f=>({id:f.id||null,action:f.getAttribute('action')||null})).slice(0,30);
    const hints = Array.from(document.querySelectorAll('h1,h2,h3,label')).map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,40);
    return { url, title, forms, hints };
  })()` } });

  console.log('=== PREP ===');
  console.log(t(prep));
  console.log('=== PAGE_INFO ===');
  console.log(t(state));
  console.log('=== DEBUG ===');
  console.log(t(debug));
} finally { try { await client.close(); } catch {} }
