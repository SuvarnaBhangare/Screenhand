import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-ig-mouse-submit-ocr', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

const windows = await client.callTool({ name: 'windows', arguments: {} });
const winText = textOf(windows);
const chromeLine = winText.split('\n').find((l) => l.includes('Chrome')) || '';
const m = chromeLine.match(/^\[(\d+)\]/);
const windowId = m ? Number(m[1]) : null;

let clickRes = 'window-id-not-found';
if (windowId) {
  clickRes = textOf(await client.callTool({ name: 'click_text', arguments: { windowId, text: 'Submit' } }));
  await sleep(800);
  // second click to ensure trigger
  clickRes += ' | ' + textOf(await client.callTool({ name: 'click_text', arguments: { windowId, text: 'Submit' } }));
}

await sleep(5000);
const info = await client.callTool({ name: 'browser_page_info', arguments: {} });
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  ok: true,
  windowId,
  clickRes,
  pageInfo: textOf(info),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
