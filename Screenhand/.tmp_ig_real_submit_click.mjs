import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-real-submit-click', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

const dom = await client.callTool({ name: 'browser_dom', arguments: { selector: '[role="button"],button', limit: 50 } });
const domText = textOf(dom);
const items = JSON.parse(domText);
const submit = items.find((i) => (i.text || '').trim() === 'Submit');

if (!submit || !submit.rect) {
  console.log(JSON.stringify({ ok: false, reason: 'submit-not-found', dom: items.slice(0,10) }, null, 2));
  await client.close();
  process.exit(0);
}

const x = Math.round(submit.rect.x + submit.rect.w / 2);
const y = Math.round(submit.rect.y + submit.rect.h / 2);

const clickRes = await client.callTool({ name: 'click', arguments: { x, y } });
await sleep(6000);

const pageInfo = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  ok: true,
  clickAt: { x, y },
  clickResult: textOf(clickRes),
  pageInfo: textOf(pageInfo),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
