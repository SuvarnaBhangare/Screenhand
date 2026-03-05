import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});

const client = new Client({ name: 'screenhand-ig-strict-submit', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

// Step 1: find and center the exact Submit element, then compute precise center coordinates
const probeCode = `(() => {
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const candidates = Array.from(document.querySelectorAll('[role="button"], button, div'))
    .filter(visible)
    .filter((e) => (e.textContent || '').trim() === 'Submit');

  const btn = candidates[0] || null;
  if (!btn) return { ok: false, reason: 'submit-not-found', count: candidates.length };

  btn.scrollIntoView({ block: 'center', inline: 'center' });
  const r = btn.getBoundingClientRect();

  return {
    ok: true,
    count: candidates.length,
    tag: btn.tagName.toLowerCase(),
    role: btn.getAttribute('role'),
    className: (btn.className || '').toString().slice(0, 180),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
    text: (btn.textContent || '').trim(),
  };
})()`;

const probeRes = await client.callTool({ name: 'browser_js', arguments: { code: probeCode } });
const probeText = textOf(probeRes);

let probe;
try { probe = JSON.parse(probeText); } catch { probe = { ok: false, raw: probeText }; }

if (!probe.ok || !probe.center) {
  const shotFail = await client.callTool({ name: 'screenshot_file', arguments: {} });
  console.log(JSON.stringify({ ok: false, probe, screenshot: textOf(shotFail) }, null, 2));
  await client.close();
  process.exit(0);
}

const x = probe.center.x;
const y = probe.center.y;

// Step 2: wait so user can visually confirm cursor placement timing
await sleep(1500);

// Step 3: single exact click at computed center
const clickRes = await client.callTool({ name: 'click', arguments: { x, y } });

// Step 4: observe page change
await sleep(6000);
const pageInfo = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  ok: true,
  submitProbe: probe,
  click: textOf(clickRes),
  pageInfo: textOf(pageInfo),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
