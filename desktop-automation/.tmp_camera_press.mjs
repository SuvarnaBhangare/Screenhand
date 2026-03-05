import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/desktop-automation/mcp-desktop.ts'],
});
const client = new Client({ name: 'desktop-camera-ui-press', version: '1.0.0' }, { capabilities: {} });

const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return textOf(r);
};

await client.connect(transport);
const appsText = await call('apps', {});
const line = appsText.split('\n').find((l) => l.includes('Photo Booth'));
if (!line) throw new Error('Photo Booth not found in running apps');
const m = line.match(/pid=(\d+)/);
if (!m) throw new Error('Could not parse Photo Booth pid');
const pid = Number(m[1]);

await call('focus', { bundleId: 'com.apple.PhotoBooth' });
await sleep(800);

const candidates = ['Take Photo', 'Photo', 'Camera', 'Capture', 'Take'];
let success = null;
for (const title of candidates) {
  const res = await call('ui_press', { pid, title });
  if (!res.startsWith('Error:')) {
    success = { title, res };
    break;
  }
}

await sleep(1500);
const shot = await call('screenshot_file', {});
console.log(JSON.stringify({ pid, success, screenshot: shot }, null, 2));
await client.close();
