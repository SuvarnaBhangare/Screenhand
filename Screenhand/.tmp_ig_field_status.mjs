import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-field-status', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
const code = `(() => {
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
    id: i.id,
    type: i.type,
    ariaLabel: i.getAttribute('aria-label'),
    value: i.value,
    valid: i.getAttribute('aria-invalid') !== 'true',
    ariaInvalid: i.getAttribute('aria-invalid'),
    classes: (i.className || '').toString().slice(0,120),
    rect: (() => { const r = i.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
  }));

  const statusText = Array.from(document.querySelectorAll('span,div,p'))
    .map((e) => (e.textContent || '').trim())
    .filter((t) => /^Input\s/i.test(t) || /not available|invalid|valid|required/i.test(t))
    .filter(Boolean)
    .slice(0, 50);

  const submit = Array.from(document.querySelectorAll('[role="button"],button,div'))
    .find((e) => visible(e) && (e.textContent || '').trim() === 'Submit');

  return {
    url: location.href,
    inputs,
    statusText,
    submitClass: submit ? (submit.className || '').toString().slice(0,120) : null,
    submitAriaDisabled: submit ? submit.getAttribute('aria-disabled') : null,
  };
})()`;
const res = await client.callTool({ name: 'browser_js', arguments: { code } });
console.log(textOf(res));
await client.close();
