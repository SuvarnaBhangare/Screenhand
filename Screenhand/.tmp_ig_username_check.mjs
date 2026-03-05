import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-ig-username-check', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

const code = `(() => {
  const usernameInput = Array.from(document.querySelectorAll('input'))
    .find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');
  const value = usernameInput ? usernameInput.value : null;

  const allText = Array.from(document.querySelectorAll('span,div,p'))
    .map((e) => (e.textContent || '').trim())
    .filter(Boolean);

  const errs = allText
    .filter((t) => /username|taken|available|required|another|letters|numbers|valid|enter/i.test(t))
    .slice(0, 40);

  return { usernameValue: value, relatedText: errs };
})()`;

const res = await client.callTool({ name: 'browser_js', arguments: { code } });
const text = res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
console.log(text);

await client.close();
