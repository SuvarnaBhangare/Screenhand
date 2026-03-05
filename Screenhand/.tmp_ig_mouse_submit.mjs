import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-ig-mouse-submit', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

// Find submit button center using DOM rect
const dom = await client.callTool({ name: 'browser_dom', arguments: { selector: '[role="button"],button,div', limit: 120 } });
const items = JSON.parse(textOf(dom));
const submit = items.find((i) => (i.text || '').trim() === 'Submit');
if (!submit?.rect) {
  console.log(JSON.stringify({ ok: false, reason: 'submit-not-found' }, null, 2));
  await client.close();
  process.exit(0);
}

const cx = Math.round(submit.rect.x + submit.rect.w / 2);
const cy = Math.round(submit.rect.y + submit.rect.h / 2);

// Human-like click sequence
const clicks = [
  { x: cx - 4, y: cy + 2 },
  { x: cx + 3, y: cy - 1 },
  { x: cx, y: cy },
];

const clickLogs = [];
for (const p of clicks) {
  const r = await client.callTool({ name: 'click', arguments: { x: p.x, y: p.y } });
  clickLogs.push(textOf(r));
  await sleep(900);
}

await sleep(5000);
const info = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  ok: true,
  submitCenter: { x: cx, y: cy },
  clickLogs,
  pageInfo: textOf(info),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
