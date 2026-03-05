import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'screenhand-devpost-inspect-current-fields', version: '1.0.0' }, { capabilities: {} });
const out = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);

async function call(name, arguments_ = {}) {
  return client.callTool({ name, arguments: arguments_ });
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  await call('browser_navigate', { url: EDIT_URL });
  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 30000 });

  const res = await call('browser_js', {
    code: `(() => {
      const v = (sel) => {
        const el = document.querySelector(sel);
        return el ? (el.value || '').trim() : null;
      };
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      return {
        url: location.href,
        title: document.title,
        fields: {
          software_name: v('#software_name'),
          software_tagline: v('#software_tagline'),
          software_tag_list: v('#software_tag_list'),
          software_description_len: (v('#software_description') || '').length,
          software_url_0: v('#software_urls_attributes_0_url'),
          software_url_1: v('#software_urls_attributes_1_url'),
          software_url_2: v('#software_urls_attributes_2_url')
        },
        snippets: {
          hasFAQ: /FAQ|What is ScreenHand|Which AI agents can use ScreenHand/i.test(text),
          hasMCP: /MCP|Model Context Protocol/i.test(text),
          hasCrossPlatform: /macOS|Windows/i.test(text)
        }
      };
    })()`
  });

  console.log(out(res));
} finally {
  try { await client.close(); } catch {}
}
