import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});

const client = new Client({ name: 'screenhand-save-devpost-memory', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);

try {
  await client.connect(transport);

  const save = await client.callTool({
    name: 'memory_save',
    arguments: {
      task: 'Devpost account setup: signup, CAPTCHA handoff, onboarding completion, settings update, and posting-readiness verification',
      tags: ['devpost', 'signup', 'onboarding', 'settings', 'portfolio', 'automation']
    }
  });

  const recall = await client.callTool({
    name: 'memory_recall',
    arguments: {
      task: 'Create and setup a new Devpost account quickly',
      limit: 3
    }
  });

  const stats = await client.callTool({
    name: 'memory_stats',
    arguments: {}
  });

  console.log('=== MEMORY_SAVE ===');
  console.log(text(save));
  console.log('\n=== MEMORY_RECALL ===');
  console.log(text(recall));
  console.log('\n=== MEMORY_STATS ===');
  console.log(text(stats));
} finally {
  try { await client.close(); } catch {}
}
