import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/desktop-automation/mcp-desktop.ts'],
});

const client = new Client({ name: 'desktop-open-camera-and-shot', version: '1.0.0' }, { capabilities: {} });
const logs = [];

const run = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
  logs.push(`[${name}] ${t}`);
  return t;
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
await safeRun('launch', { bundleId: 'com.apple.PhotoBooth' });
await safeRun('focus', { bundleId: 'com.apple.PhotoBooth' });
await sleep(1200);

const appsText = await safeRun('apps', {});
const line = appsText.split('\n').find((l) => l.includes('Photo Booth')) || '';
const pidMatch = line.match(/pid=(\d+)/);
const pid = pidMatch ? Number(pidMatch[1]) : 0;

let triggerMethod = 'key:space';
if (pid > 0) {
  for (const title of ['Take Photo', 'Photo', 'Capture', 'Camera']) {
    const res = await safeRun('ui_press', { pid, title });
    if (!String(res).startsWith('ERROR:')) {
      triggerMethod = `ui_press:${title}`;
      break;
    }
  }
}

if (triggerMethod === 'key:space') {
  await safeRun('key', { combo: 'space' });
}

await sleep(5000);
const screenshotPath = await safeRun('screenshot_file', {});

console.log(JSON.stringify({
  ok: true,
  pid,
  triggerMethod,
  screenshotPath,
  logs,
}, null, 2));

await client.close();
