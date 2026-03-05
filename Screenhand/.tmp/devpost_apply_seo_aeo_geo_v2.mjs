import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const PUBLIC_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot';

const PAYLOAD = {
  title: 'ScreenHand: AI Agent Desktop Automation via MCP',
  tagline: 'Open-source MCP server for AI agent desktop automation across macOS and Windows apps + Chrome workflows.',
  tech: [
    'model-context-protocol-(mcp)',
    'desktop-automation',
    'ai-agents',
    'typescript',
    'node.js',
    'swift',
    '.net',
    'windows-ui-automation',
    'macos-accessibility-api',
    'ocr',
    'chrome-devtools-protocol',
    'applescript'
  ].join(','),
  url0: 'https://screenhand.com',
  description: `## What is ScreenHand?
ScreenHand is an open-source MCP server that gives AI agents real desktop control: screen understanding, UI actions, browser automation, and cross-app workflows on macOS and Windows.

## Problem
Most AI automations stop at chat or browser-only scripting. Real work often spans native desktop apps, browser tabs, file managers, and system actions.

## Solution
ScreenHand provides one tool layer for end-to-end execution:
- See: screenshots + OCR + accessibility/UI automation tree
- Act: click, type, scroll, drag, set values, menu actions
- Automate web: CDP tabs, DOM actions, JavaScript execution, waits
- Orchestrate workflows: native app + browser steps in one agent loop

## Why this matters for developers and teams
- Faster QA and UI regression checks
- Practical onboarding/repetitive task automation
- Better support ops and growth ops workflows
- Reusable action memory for repeated tasks

## How we built it
- Native bridge layer (Swift on macOS, .NET on Windows)
- TypeScript MCP runtime and tool orchestration
- OS APIs: Accessibility/UI Automation, OCR, Chrome DevTools Protocol, AppleScript (macOS)

## Technical proof points
- 25+ automation tools exposed via MCP
- Fast UI tree operations for element inspection and interaction
- Cross-platform architecture with one consistent tool interface

## AEO FAQ (answer-first)
### Q: What does ScreenHand do?
A: It lets AI agents observe and control real desktop and browser interfaces through MCP tools.

### Q: How is ScreenHand different from browser-only automation?
A: ScreenHand automates native desktop apps and browser flows together, so one agent can finish full workflows.

### Q: Which AI clients can use ScreenHand?
A: Any MCP-compatible client, including Claude, Codex, and Cursor.

### Q: What workflows are best for ScreenHand?
A: UI testing, onboarding automation, multi-app data transfer, browser+desktop operational tasks, and QA loops.

## GEO references
- Model Context Protocol: https://modelcontextprotocol.io
- GitHub repository: https://github.com/manushi4/Screenhand
- npm package: https://www.npmjs.com/package/screenhand
- Product site: https://screenhand.com

## Keywords
AI agent desktop automation, MCP server, macOS automation, Windows UI automation, Chrome automation, OCR automation, cross-app workflow automation.`
};

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'screenhand-devpost-seo-aeo-geo-v2', version: '1.0.0' }, { capabilities: {} });
const out = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, arguments_ = {}) {
  return client.callTool({ name, arguments: arguments_ });
}

async function evalJs(code) {
  const res = await call('browser_js', { code });
  return JSON.parse(out(res));
}

async function setField(selector, value) {
  return evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const val = ${JSON.stringify(value)};
    if (!el) return { selector: ${JSON.stringify(selector)}, ok: false, reason: 'not_found' };

    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val);
    else el.value = val;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    return { selector: ${JSON.stringify(selector)}, ok: true, valueLen: String(val).length };
  })()`);
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  await call('browser_navigate', { url: EDIT_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 30000 });

  const updates = [];
  updates.push(await setField('#software_name', PAYLOAD.title));
  updates.push(await setField('#software_tagline', PAYLOAD.tagline));
  updates.push(await setField('#software_tag_list', PAYLOAD.tech));
  updates.push(await setField('#software_description', PAYLOAD.description));
  updates.push(await setField('#software_urls_attributes_0_url', PAYLOAD.url0));

  const save = await evalJs(`(() => {
    const btn = document.querySelector('#software-save');
    if (!btn) return { found: false, clicked: false };
    btn.click();
    return { found: true, clicked: true, text: (btn.textContent || btn.value || '').trim() };
  })()`);

  await sleep(4000);

  const editInfo = JSON.parse(out(await call('browser_page_info', {})));

  await call('browser_navigate', { url: PUBLIC_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 30000 });

  const publicInfo = JSON.parse(out(await call('browser_page_info', {})));

  const checks = await evalJs(`(() => {
    const body = (document.body?.innerText || '').replace(/\\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      hasAEOQuestion: /Q:\s*What does ScreenHand do\?/i.test(body),
      hasAEOAnswer: /A:\s*It lets AI agents observe and control/i.test(body),
      hasGEORefs: /modelcontextprotocol\.io|github\.com\/manushi4\/Screenhand|npmjs\.com\/package\/screenhand/i.test(body),
      hasKeywordCluster: /AI agent desktop automation|MCP server|cross-app workflow automation/i.test(body)
    };
  })()`);

  console.log(JSON.stringify({ updates, save, editInfo, publicInfo, checks }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
