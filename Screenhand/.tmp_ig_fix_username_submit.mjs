import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-username-fix-submit', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const code = `(() => {
  const setNativeValue = (el, value) => {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);

  const usernameInput = Array.from(document.querySelectorAll('input')).find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');
  if (!usernameInput) return { ok: false, reason: 'username-input-not-found' };

  setNativeValue(usernameInput, 'screenhand_manu97');

  const submit = Array.from(document.querySelectorAll('[role="button"], button, div'))
    .find((e) => visible(e) && (e.textContent || '').trim() === 'Submit');

  if (submit) submit.click();

  return { ok: true, username: usernameInput.value, submitFound: !!submit };
})()`;

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });
const step = await client.callTool({ name: 'browser_js', arguments: { code } });
await sleep(6000);
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });
console.log('STEP=' + textOf(step));
console.log('SHOT=' + textOf(shot));
await client.close();
