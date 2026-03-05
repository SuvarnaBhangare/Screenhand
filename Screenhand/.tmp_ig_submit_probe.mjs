import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-submit-probe', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

const probeCode = `(() => {
  const byType = document.querySelector('button[type="submit"]');
  const forms = Array.from(document.querySelectorAll('form')).map((f, i) => ({
    i,
    action: f.getAttribute('action'),
    method: f.getAttribute('method'),
    hasSubmit: !!f.querySelector('button[type="submit"], input[type="submit"], [role="button"]'),
    text: (f.textContent || '').trim().slice(0, 200),
  }));

  const submitCandidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      text: (el.textContent || '').trim(),
      aria: el.getAttribute('aria-label'),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      cls: (el.className || '').toString().slice(0, 120),
      rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }))
    .filter((c) => c.text === 'Submit' || c.type === 'submit');

  return {
    url: location.href,
    hasTypeSubmit: !!byType,
    typeSubmitOuter: byType ? byType.outerHTML.slice(0, 300) : null,
    forms,
    submitCandidates,
  };
})()`;

const probe = await client.callTool({ name: 'browser_js', arguments: { code: probeCode } });
console.log('PROBE=' + textOf(probe));

const clickCode = `(() => {
  const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button, [role="button"], div')).find((e) => (e.textContent || '').trim() === 'Submit');
  if (!btn) return { clicked: false, reason: 'no-submit-button' };
  btn.scrollIntoView({ block: 'center' });
  btn.click();
  return { clicked: true, tag: btn.tagName.toLowerCase(), type: btn.getAttribute('type') || null };
})()`;

const click = await client.callTool({ name: 'browser_js', arguments: { code: clickCode } });
await sleep(5000);
const info = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });
console.log('CLICK=' + textOf(click));
console.log('INFO=' + textOf(info));
console.log('SHOT=' + textOf(shot));

await client.close();
