import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/desktop-automation/mcp-desktop.ts'],
});
const client = new Client({ name: 'desktop-camera-shot-verify', version: '1.0.0' }, { capabilities: {} });
const out = [];

const run = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
  out.push(`[${name}] ${t}`);
  return t;
};

await client.connect(transport);
const apps = await run('apps', {});
if (!apps.includes('Photo Booth') && !apps.includes('PhotoBooth')) {
  await run('applescript', { script: 'tell application "Photo Booth" to activate' });
} else {
  await run('focus', { bundleId: 'com.apple.PhotoBooth' });
}
await sleep(4000);
await run('key', { combo: 'space' });
await sleep(1500);
await run('windows', {});
console.log(out.join('\n\n'));
await client.close();
