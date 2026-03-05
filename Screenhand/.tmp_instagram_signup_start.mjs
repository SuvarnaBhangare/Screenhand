import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-start', version: '1.0.0' }, { capabilities: {} });

const logs = [];
const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
  logs.push(`[${name}] ${text}`);
  return text;
};

await client.connect(transport);

await run('launch', { bundleId: 'com.google.Chrome' });
await run('focus', { bundleId: 'com.google.Chrome' });
await sleep(600);
await run('key', { combo: 'cmd+l' });
await sleep(150);
await run('type_text', { text: 'https://www.instagram.com/accounts/emailsignup/' });
await sleep(150);
await run('key', { combo: 'enter' });
await sleep(5000);
const shot = await run('screenshot_file', {});

console.log(JSON.stringify({ ok: true, screenshot: shot, logs }, null, 2));
await client.close();
