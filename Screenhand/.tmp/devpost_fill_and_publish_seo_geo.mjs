import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const PUBLIC_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot';

const PAYLOAD = {
  title: 'ScreenHand: MCP Desktop Automation for AI Agents',
  tagline: 'Open-source MCP server that gives AI agents eyes and hands to automate desktop apps on macOS and Windows.',
  tech: [
    'Model Context Protocol (MCP)',
    'TypeScript',
    'Node.js',
    'Swift',
    '.NET',
    'macOS Accessibility API',
    'Windows UI Automation',
    'OCR',
    'Chrome DevTools Protocol',
    'AppleScript'
  ].join(', '),
  urls: [
    'https://github.com/manushi4/Screenhand',
    'https://www.npmjs.com/package/screenhand',
    'https://screenhand.com'
  ],
  description: `## TL;DR
ScreenHand is an open-source MCP desktop automation server that gives AI agents real UI control: see screens, read UI trees, click buttons, type text, automate Chrome, and orchestrate cross-app workflows.

## Inspiration
LLM agents can reason well, but most cannot reliably act on real desktop software. We built ScreenHand to bridge that gap so AI can do practical work beyond chat.

## What It Does
ScreenHand gives AI agents eyes and hands across desktop apps:
- Screen understanding: screenshot + OCR and accessibility/UI-automation tree inspection
- Direct actions: click, type, scroll, drag, menu actions, value setting
- Browser control: tab management, DOM querying, JS execution, form automation with CDP
- Cross-app workflows: read in one app, transform with AI, write into another app
- Memory loop: strategy recall and reusable action sequences for repeated tasks

## Why It Matters
Most desktop automation stacks are either brittle OCR bots or app-specific scripts. ScreenHand combines OS-native automation with browser automation under one MCP interface so the same agent can complete end-to-end workflows.

## How We Built It
- Native bridge layer (Swift/.NET) for OS APIs and high-fidelity UI control
- TypeScript runtime for tool routing, browser control, and orchestration
- MCP server interface so Claude, Codex, Cursor, and other MCP clients can use the same tools

## Technical Highlights
- 25+ tools spanning screen, app control, browser automation, and system actions
- Fast accessibility-level operations for UI tree read and element interaction
- Works across both macOS and Windows with a shared tool surface

## Challenges We Solved
- Stable coordinate mapping and interaction reliability across desktop surfaces
- Balancing power with safe operational boundaries and user confirmation points
- Unifying native app automation and browser automation into one workflow model

## Real Use Cases
- UI testing and regression checks
- Debugging app flows via accessibility tree inspection
- Data extraction and transfer between desktop apps
- Browser-assisted operations like form completion and structured scraping

## FAQ (AEO / GEO friendly)
### What is ScreenHand?
ScreenHand is an MCP server for desktop automation that lets AI agents observe and control real applications on macOS and Windows.

### How is ScreenHand different from browser-only automation tools?
ScreenHand controls native desktop apps and browsers in one flow, not just web pages.

### Which AI agents can use ScreenHand?
Any MCP-compatible client, including Claude, Codex, and Cursor.

### What can I automate with ScreenHand?
UI testing, repetitive desktop operations, onboarding flows, data transfer across apps, and browser-native hybrid workflows.

## What We Learned
High-reliability AI automation needs both structured UI access (accessibility trees) and practical fallback methods (OCR + direct actions), plus repeatable action memory.

## What’s Next
- Safer permission scopes and approval checkpoints
- More reusable workflow templates for growth, QA, and operations teams
- Better live-loop automation with stronger failure recovery`
};

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});

const client = new Client(
  { name: 'screenhand-devpost-fill-publish-seo-geo', version: '1.1.0' },
  { capabilities: {} }
);

const outText = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, args = {}) {
  return await client.callTool({ name, arguments: args });
}

async function evalJs(code) {
  const res = await call('browser_js', { code });
  return JSON.parse(outText(res));
}

async function setInput(selector, value) {
  const code = `(() => {
    const sel = ${JSON.stringify(selector)};
    const val = ${JSON.stringify(value)};
    const el = document.querySelector(sel);
    if (!el) return { selector: sel, ok: false, reason: 'not_found' };

    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val);
    else el.value = val;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    return { selector: sel, ok: true, valueLen: String(val).length };
  })()`;
  return await evalJs(code);
}

try {
  await client.connect(transport);

  await call('focus', { bundleId: 'com.google.Chrome' });
  await call('browser_navigate', { url: EDIT_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 30000 });

  const updates = [];
  updates.push(await setInput('#software_name', PAYLOAD.title));
  updates.push(await setInput('#software_tagline', PAYLOAD.tagline));
  updates.push(await setInput('#software_tag_list', PAYLOAD.tech));
  updates.push(await setInput('#software_description', PAYLOAD.description));

  const urlSelectors = [
    '#software_urls_attributes_0_url',
    '#software_urls_attributes_1_url',
    '#software_urls_attributes_2_url'
  ];
  for (let i = 0; i < urlSelectors.length; i += 1) {
    updates.push(await setInput(urlSelectors[i], PAYLOAD.urls[i] || ''));
  }

  const saveResult = await evalJs(`(() => {
    const btn = document.querySelector('#software-save');
    if (!btn) return { found: false, clicked: false };
    btn.click();
    return { found: true, clicked: true, text: (btn.textContent || btn.value || '').trim() };
  })()`);

  await sleep(3500);

  const publishResult = await evalJs(`(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]'))
      .map((el) => ({
        el,
        text: norm(el.textContent || el.value || ''),
        id: el.id || null,
        visible: !!(el.offsetParent !== null),
        disabled: !!el.disabled
      }))
      .filter((b) => b.visible && b.text);

    const candidate = buttons.find((b) => /publish|submit|post/i.test(b.text));
    if (candidate && !candidate.disabled) candidate.el.click();

    return {
      found: !!candidate,
      text: candidate?.text || null,
      id: candidate?.id || null,
      disabled: candidate ? candidate.disabled : null
    };
  })()`);

  await sleep(5000);

  const editInfo = JSON.parse(outText(await call('browser_page_info', {})));

  await call('browser_navigate', { url: PUBLIC_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 30000 });

  const publicInfo = JSON.parse(outText(await call('browser_page_info', {})));

  const publicCheck = await evalJs(`(() => {
    const body = (document.body?.innerText || '').replace(/\\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      hasMCP: /MCP|Model Context Protocol/i.test(body),
      hasDesktopAutomation: /desktop automation|desktop apps/i.test(body),
      hasCrossPlatform: /macOS|Windows/i.test(body),
      hasFaq: /FAQ|What is ScreenHand|Which AI agents can use ScreenHand/i.test(body)
    };
  })()`);

  console.log(JSON.stringify({ updates, saveResult, publishResult, editInfo, publicInfo, publicCheck }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
