import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const src = fs.readFileSync('/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_explore_features.mjs', 'utf8');
const marker = 'const pageProbeCode = `';
const start = src.indexOf(marker);
if (start < 0) throw new Error('pageProbeCode marker not found');
const from = start + marker.length;
const end = src.indexOf('`;\n\nconst routes = [', from);
if (end < 0) throw new Error('pageProbeCode end not found');
const code = src.slice(from, end);

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'ig-probe-full-debug', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parseTabs = (t) =>
  t.split('\n')
    .map((l) => {
      const m = l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
      return m ? { id: m[1], url: m[3] } : null;
    })
    .filter(Boolean);

try {
  await client.connect(transport);
  const tabsText = text(await client.callTool({ name: 'browser_tabs', arguments: {} }));
  const ig = parseTabs(tabsText).find((t) => /instagram\.com/.test(t.url));
  if (!ig) throw new Error('No Instagram tab found');

  const out = text(await client.callTool({ name: 'browser_js', arguments: { tabId: ig.id, code } }));
  console.log('RAW_OUTPUT_START');
  console.log(out);
  console.log('RAW_OUTPUT_END');
  if (out.startsWith('JS Error')) {
    console.log('CODE_PREVIEW_START');
    console.log(code.slice(0, 2000));
    console.log('CODE_PREVIEW_END');
  }
} catch (e) {
  console.error('DEBUG_FAILED:', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
