import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const PUBLIC_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot';

const TAGLINE = 'Claude-powered desktop automation that sees your screen and controls Mac apps end-to-end.';
const TECH = 'TypeScript, Swift, Model Context Protocol (MCP), macOS Accessibility API, CoreGraphics, Vision OCR, AppleScript, Chrome DevTools Protocol';
const TRY_URL = 'https://github.com/manushi4/Screenhand';

const DESCRIPTION = `## Inspiration\nWe wanted Claude to move beyond chat and become a real desktop operator: seeing the UI, clicking controls, typing text, and chaining workflows across apps.\n\n## What it does\nScreenhand gives Claude eyes and hands on macOS. It can inspect UI trees, run OCR on screen content, click and type in native apps, automate Chrome with CDP, and execute AppleScript for deep system actions.\n\n## How we built it\n- A native Swift bridge for Accessibility, CoreGraphics screenshots, and Vision OCR\n- A TypeScript runtime that exposes browser automation, AppleScript execution, and coordinate handling\n- An MCP server interface so any MCP client can call these capabilities as tools\n\n## Challenges we ran into\n- Reliable coordinate mapping across Retina displays\n- Safely exposing powerful automation primitives while preserving user control\n- Making browser and native app actions work consistently in one flow\n\n## Accomplishments that we're proud of\n- Unified automation across native apps + browser in one tool layer\n- Fast UI debugging via accessibility tree inspection\n- Practical real-world flows like signup, onboarding, QA testing, and cross-app operations\n\n## What we learned\nCombining accessibility APIs with browser automation unlocks much more dependable AI operation than OCR-only approaches.\n\n## What's next for Screenhand\n- Stronger guardrails and permission scopes\n- Better live-loop autonomy with pause/confirm checkpoints\n- Reusable workflow templates for growth, QA, and operations teams`;

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-fill-publish', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

async function call(name, args={}) {
  return await client.callTool({ name, arguments: args });
}

try {
  await client.connect(transport);
  await call('focus', { bundleId:'com.google.Chrome' });
  await call('browser_navigate', { url: EDIT_URL });
  await call('browser_wait', { condition:'document.readyState === "complete"', timeoutMs:20000 });

  const fill = await call('browser_js', { code:`(() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    };

    const setTagline = set('#software_tagline', ${JSON.stringify(TAGLINE)});
    const setTech = set('#software_tag_list', ${JSON.stringify(TECH)});
    const setTry = set('#software_urls_attributes_0_url', ${JSON.stringify(TRY_URL)});
    const setDescription = set('#software_description', ${JSON.stringify(DESCRIPTION)});

    const saveBtn = document.querySelector('#software-save');
    if (saveBtn) saveBtn.click();

    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map(el => ({
      text: (el.textContent || el.value || '').replace(/\s+/g,' ').trim(),
      id: el.id || null,
      visible: !!(el.offsetParent !== null),
      disabled: !!el.disabled
    })).filter(b => b.visible && b.text).slice(0,200);

    return {
      url: location.href,
      setTagline,
      setTech,
      setTry,
      setDescription,
      clickedSave: !!saveBtn,
      buttons
    };
  })()`});

  await sleep(3000);

  const publishAttempt = await call('browser_js', { code:`(() => {
    const norm = s => (s||'').replace(/\s+/g,' ').trim();
    const candidates = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]')).map(el => ({
      el,
      text: norm(el.textContent || el.value || ''),
      id: el.id || null,
      visible: !!(el.offsetParent !== null),
      disabled: !!el.disabled
    })).filter(x => x.visible && x.text);

    const publish = candidates.find(x => /publish|submit|post/i.test(x.text));
    if (publish && !publish.disabled) publish.el.click();

    return {
      url: location.href,
      publishFound: !!publish,
      publishText: publish?.text || null,
      publishId: publish?.id || null,
      publishDisabled: publish ? publish.disabled : null,
      candidates: candidates.slice(0,80).map(c => ({ text: c.text, id: c.id, disabled: c.disabled }))
    };
  })()`});

  await sleep(3500);

  const afterPublishInfo = await call('browser_page_info', {});

  // Verify public page
  await call('browser_navigate', { url: PUBLIC_URL });
  await call('browser_wait', { condition:'document.readyState === "complete"', timeoutMs:20000 });
  const publicInfo = await call('browser_page_info', {});

  const publicCheck = await call('browser_js', { code:`(() => {
    const body = (document.body?.innerText || '').replace(/\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      hasTagline: /Claude-powered desktop automation/i.test(body),
      hasBuiltWith: /TypeScript|Swift|Accessibility API|MCP/i.test(body),
      hasAboutSection: /Inspiration|What it does|How we built it|What\'s next/i.test(body)
    };
  })()`});

  console.log(JSON.stringify({
    fill: JSON.parse(t(fill)),
    publishAttempt: JSON.parse(t(publishAttempt)),
    afterPublishInfo: JSON.parse(t(afterPublishInfo)),
    publicInfo: JSON.parse(t(publicInfo)),
    publicCheck: JSON.parse(t(publicCheck))
  }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
