import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-ig-reopen-precise-click', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

// Force navigate active tab back to Instagram signup
await client.callTool({ name: 'browser_navigate', arguments: { url: 'https://www.instagram.com/accounts/emailsignup/' } });
await sleep(5000);

// Find exact Submit rect and center
const probeCode = `(() => {
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);

  const btn = Array.from(document.querySelectorAll('[role="button"], button, div'))
    .filter(visible)
    .find((e) => (e.textContent || '').trim() === 'Submit');

  if (!btn) return { ok: false, reason: 'submit-not-found' };

  btn.scrollIntoView({ block: 'center', inline: 'center' });
  const r = btn.getBoundingClientRect();
  return {
    ok: true,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
    text: (btn.textContent || '').trim(),
    className: (btn.className || '').toString().slice(0, 160),
  };
})()`;

const probeRes = await client.callTool({ name: 'browser_js', arguments: { code: probeCode } });
let probe;
try { probe = JSON.parse(textOf(probeRes)); } catch { probe = { ok: false, raw: textOf(probeRes) }; }

if (!probe.ok) {
  const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });
  console.log(JSON.stringify({ ok: false, probe, screenshot: textOf(shot) }, null, 2));
  await client.close();
  process.exit(0);
}

const x = probe.center.x;
const y = probe.center.y;

// One precise mouse click at center
const clickRes = await client.callTool({ name: 'click', arguments: { x, y } });
await sleep(6000);

const info = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  ok: true,
  submitProbe: probe,
  click: textOf(clickRes),
  pageInfo: textOf(info),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
