import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-force-open', version: '1.0.0' }, { capabilities: {} });
const logs = [];

const textOf = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);

const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = textOf(res);
  logs.push(`[${name}] ${text}`);
  return text;
};

const safeRun = async (name, args = {}) => {
  try {
    return await run(name, args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[${name}] ERROR: ${msg}`);
    return `ERROR: ${msg}`;
  }
};

await client.connect(transport);
await safeRun('focus', { bundleId: 'com.google.Chrome' });

const url = 'https://www.instagram.com/accounts/emailsignup/';
const browserOpen = await safeRun('browser_open', { url });
if (String(browserOpen).startsWith('ERROR:')) {
  await safeRun('applescript', {
    script: `tell application "Google Chrome" to open location "${url}"`,
  });
}

await sleep(5000);
const shot = await safeRun('screenshot_file', {});
console.log(JSON.stringify({ ok: true, screenshot: shot, logs }, null, 2));
await client.close();
