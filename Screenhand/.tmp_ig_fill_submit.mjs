import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-fill-submit', version: '1.0.0' }, { capabilities: {} });

const logs = [];
const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
  logs.push(`[${name}] ${text}`);
  return text;
};

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

  const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
  const textInputs = inputs.filter((i) => i.type === 'text').sort((a,b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
  const passwordInput = inputs.find((i) => i.type === 'password');
  const usernameInput = inputs.find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');

  // Order on this form: [mobile/email, full name]
  if (textInputs[0]) setNativeValue(textInputs[0], '7413930993');
  if (passwordInput) setNativeValue(passwordInput, 'Deoli@2026');
  if (textInputs[1]) setNativeValue(textInputs[1], 'manu singhal');
  if (usernameInput) setNativeValue(usernameInput, 'screenhand');

  return {
    textInputs: textInputs.map((i) => ({ id: i.id, y: Math.round(i.getBoundingClientRect().y), type: i.type })),
    passwordId: passwordInput?.id || null,
    usernameId: usernameInput?.id || null,
  };
})()`;

const pickCode = `async (() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);

  async function pickCombo(labelPart, valueText) {
    const combo = Array.from(document.querySelectorAll('[role="combobox"]')).find((e) => (e.getAttribute('aria-label') || '').toLowerCase().includes(labelPart.toLowerCase()));
    if (!combo) return { ok: false, reason: 'combobox-not-found:' + labelPart };
    combo.click();
    await sleep(250);

    const candidates = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"], div, span'))
      .filter(visible)
      .filter((e) => (e.textContent || '').trim() === valueText);

    const option = candidates.find((e) => e !== combo) || null;
    if (!option) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: false, reason: 'option-not-found:' + valueText };
    }
    option.click();
    await sleep(150);
    return { ok: true };
  }

  const month = await pickCombo('month', 'May');
  const day = await pickCombo('day', '28');
  const year = await pickCombo('year', '1997');

  const submit = Array.from(document.querySelectorAll('[role="button"], button, div')).find((e) => (e.textContent || '').trim() === 'Submit' && visible(e));
  if (submit) {
    submit.click();
    await sleep(300);
  }

  return {
    month,
    day,
    year,
    submitFound: !!submit,
  };
})()`;

await client.connect(transport);
await run('focus', { bundleId: 'com.google.Chrome' });
await run('browser_js', { code });
await run('browser_js', { code: pickCode });
await sleep(5000);
const shot = await run('screenshot_file', {});
console.log(JSON.stringify({ ok: true, screenshot: shot, logs }, null, 2));
await client.close();
