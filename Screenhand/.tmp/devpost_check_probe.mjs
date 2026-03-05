import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'screenhand-devpost-check-probe', version: '1.0.0' }, { capabilities: {} });
const out = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);
try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:30000 } });
  const res = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const body = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      hasQuestion: body.includes('Q: What does ScreenHand do?'),
      hasAnswer: body.includes('A: It lets AI agents observe and control'),
      hasRefs: body.includes('modelcontextprotocol.io') || body.includes('github.com/manushi4/Screenhand') || body.includes('npmjs.com/package/screenhand'),
      hasKeywords: body.includes('AI agent desktop automation') || body.includes('MCP server')
    };
  })()` } });
  console.log(out(res));
} finally {
  try { await client.close(); } catch {}
}
