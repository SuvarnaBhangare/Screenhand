import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'x-ui-probe-post', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function chromePids(appsText) {
  return (appsText || '').split('\n')
    .filter((l) => l.includes('Google Chrome (com.google.Chrome) pid='))
    .map((l) => Number((l.match(/pid=(\d+)/) || [])[1]))
    .filter(Boolean);
}

try {
  await client.connect(transport);
  const focus = await call('focus', { bundleId: 'com.google.Chrome' });
  const apps = await call('apps', {});
  const pids = chromePids(apps.text || '');
  const out = { focus, pids, probes: [] };

  for (const pid of pids) {
    const item = { pid, find: {} };
    for (const title of ['Post', 'What’s happening?', "What's happening?", 'Home', 'Compose']) {
      item.find[title] = await call('ui_find', { pid, title });
    }
    item.tree = await call('ui_tree', { pid, maxDepth: 2 });
    out.probes.push(item);
  }

  console.log(JSON.stringify({ ok: true, out }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
