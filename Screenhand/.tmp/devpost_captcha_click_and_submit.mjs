import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PROJECT_NAME = 'Screenhand: AI Desktop Automation Copilot';
const WAIT_MS = 120000;
const POLL_MS = 2000;

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-captcha-click-submit', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pageState() {
  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const input = document.querySelector('#software_name');
    const submit = document.querySelector('#software_name_save_button');
    const token = document.querySelector('#g-recaptcha-response')?.value || '';

    const recaptchaFrame = Array.from(document.querySelectorAll('iframe')).find(f => /recaptcha/i.test((f.getAttribute('src')||'') + ' ' + (f.title||'') + ' ' + (f.name||'')));
    let clickPoint = null;
    let rect = null;
    if (recaptchaFrame) {
      const r = recaptchaFrame.getBoundingClientRect();
      const toolbar = window.outerHeight - window.innerHeight;
      rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      clickPoint = {
        x: Math.round(window.screenX + r.x + Math.min(35, r.width / 2)),
        y: Math.round(window.screenY + toolbar + r.y + Math.min(35, r.height / 2))
      };
    }

    const challenge = Array.from(document.querySelectorAll('iframe')).find(f => {
      const src = (f.getAttribute('src') || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      return name.includes('bframe') || src.includes('api2/bframe');
    });
    const challengeRect = challenge ? (() => {
      const r = challenge.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    })() : null;

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');
    const notices = [];
    if (/please complete the recaptcha/i.test(bodyText)) notices.push('Please complete the reCAPTCHA');
    if (/verify you are human|i am not a robot|not a robot/i.test(bodyText)) notices.push('Human verification challenge visible');

    return {
      url: location.href,
      title: document.title,
      inputPresent: !!input,
      inputValue: input?.value || null,
      submitPresent: !!submit,
      submitDisabled: submit ? !!submit.disabled : null,
      tokenLength: token.length,
      recaptchaVisible: !!recaptchaFrame,
      clickPoint,
      rect,
      challengeVisible: !!challenge && !!challengeRect && challengeRect.y > -2000,
      challengeRect,
      notices
    };
  })()` }});
  const raw = t(res);
  try {
    return JSON.parse(raw);
  } catch {
    return {
      url: null,
      title: null,
      inputPresent: false,
      inputValue: null,
      submitPresent: false,
      submitDisabled: null,
      tokenLength: 0,
      recaptchaVisible: false,
      clickPoint: null,
      rect: null,
      challengeVisible: false,
      challengeRect: null,
      notices: ['page_state_parse_error'],
      raw
    };
  }
}

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/new' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const input = document.querySelector('#software_name');
    if (!input) return {ok:false, reason:'software_name_missing'};
    input.focus();
    input.value = ${JSON.stringify(PROJECT_NAME)};
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    const submit = document.querySelector('#software_name_save_button');
    if (submit) submit.click();
    return {ok:true, submitClicked:!!submit};
  })()` }});

  await sleep(1200);

  const beforeClick = await pageState();

  let clickResult = null;
  if (beforeClick.clickPoint?.x && beforeClick.clickPoint?.y) {
    clickResult = t(await client.callTool({ name:'click', arguments:{ x: beforeClick.clickPoint.x, y: beforeClick.clickPoint.y } }));
  }

  const started = Date.now();
  const polls = [];
  while (Date.now() - started < WAIT_MS) {
    const st = await pageState();
    polls.push({
      elapsedMs: Date.now() - started,
      url: st.url,
      tokenLength: st.tokenLength,
      challengeVisible: st.challengeVisible,
      submitPresent: st.submitPresent,
      submitDisabled: st.submitDisabled,
      notices: st.notices
    });

    if (/\/software\//.test(st.url) && !/\/software\/new$/.test(st.url) && st.url !== 'https://devpost.com/software') {
      break;
    }

    if (st.tokenLength > 0 && st.submitPresent && !st.submitDisabled) {
      await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
        const submit = document.querySelector('#software_name_save_button');
        if (!submit) return {clicked:false};
        submit.click();
        return {clicked:true};
      })()` }});
      await sleep(2500);
      const after = await pageState();
      polls.push({
        elapsedMs: Date.now() - started,
        action: 'submit_click_after_token',
        url: after.url,
        tokenLength: after.tokenLength,
        submitPresent: after.submitPresent,
        submitDisabled: after.submitDisabled,
        notices: after.notices
      });
      if (/\/software\//.test(after.url) && !/\/software\/new$/.test(after.url) && after.url !== 'https://devpost.com/software') {
        break;
      }
    }

    await sleep(POLL_MS);
  }

  const final = await pageState();
  const finalInfo = JSON.parse(t(await client.callTool({ name:'browser_page_info', arguments:{} })));

  console.log(JSON.stringify({
    beforeClick,
    clickResult,
    polls,
    final,
    finalInfo
  }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
