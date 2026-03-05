import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-set-devpp-brand', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });

const code = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
  const textInputs = inputs.filter((i) => i.type === 'text').sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
  const usernameInput = inputs.find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');

  // Name field is usually second text input on this form
  if (textInputs[1]) setNativeValue(textInputs[1], 'Dev++');

  const suffix = String(Date.now()).slice(-4);
  const candidates = [
    'devpp',
    'devpp_official',
    'devpp_global',
    'devpp_india',
    'devpp_' + suffix,
  ];

  let chosen = null;
  let status = null;

  if (usernameInput) {
    for (const u of candidates) {
      setNativeValue(usernameInput, u);
      await wait(1300);
      const txt = (document.body?.innerText || '').toLowerCase();
      const s = {
        valid: txt.includes('input username is valid'),
        notAvail: txt.includes('not available'),
        invalid: txt.includes('input username is invalid'),
      };
      status = s;
      chosen = u;
      if (s.valid && !s.notAvail && !s.invalid) break;
    }
  }

  const submit = Array.from(document.querySelectorAll('[role="button"], button, div')).filter(visible).find((e) => (e.textContent || '').trim() === 'Submit');
  let submitProbe = null;
  if (submit) {
    submit.scrollIntoView({ block: 'center', inline: 'center' });
    const r = submit.getBoundingClientRect();
    submitProbe = {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
    };
  }

  const cooldown = (document.body?.innerText || '').includes('Please wait a few minutes before you try again.');

  return {
    ok: true,
    nameValue: textInputs[1] ? textInputs[1].value : null,
    usernameValue: chosen,
    usernameStatus: status,
    cooldown,
    submitProbe,
  };
})()`;

const result = await client.callTool({ name: 'browser_js', arguments: { code } });
await sleep(1200);
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log(JSON.stringify({
  result: textOf(result),
  screenshot: textOf(shot),
}, null, 2));

await client.close();
