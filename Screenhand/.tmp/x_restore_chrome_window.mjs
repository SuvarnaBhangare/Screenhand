import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-restore-chrome-window', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

try {
  await client.connect(transport);
  const launch = await call('launch', { bundleId: 'com.google.Chrome' });
  const focus = await call('focus', { bundleId: 'com.google.Chrome' });
  const windows = await call('windows', {});
  const tabs = await call('browser_tabs', {});
  console.log(JSON.stringify({ launch, focus, windows, tabs }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
