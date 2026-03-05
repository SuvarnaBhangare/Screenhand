import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'screenhand-tabid-check', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
const tabs = textOf(await client.callTool({ name: 'browser_tabs', arguments: {} }));
const firstLine = tabs.split('\n').find(Boolean) || '';
const m = firstLine.match(/^\[([^\]]+)\]/);
const shortId = m ? m[1] : null;

let info = '';
if (shortId) {
  try {
    info = textOf(await client.callTool({ name: 'browser_page_info', arguments: { tabId: shortId } }));
  } catch (e) {
    info = 'ERROR: ' + (e instanceof Error ? e.message : String(e));
  }
}

console.log(JSON.stringify({ tabs, shortId, info }, null, 2));
await client.close();
