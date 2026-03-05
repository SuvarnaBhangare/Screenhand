import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-input-attrs', version: '1.0.0' }, { capabilities: {} });

const code = `(() => {
  const els = Array.from(document.querySelectorAll('input, button, [role="button"], [role="combobox"]')).slice(0, 200);
  return els.map((el, i) => ({
    i,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    type: el.getAttribute('type'),
    id: el.id || null,
    name: el.getAttribute('name'),
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    text: (el.textContent || '').trim().slice(0, 120),
    disabled: !!el.disabled,
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  }));
})()`;

await client.connect(transport);
const result = await client.callTool({ name: 'browser_js', arguments: { code } });
const text = result?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(result);
console.log(text);
await client.close();
