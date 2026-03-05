import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-refill-no-submit', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const logs = [];
const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = textOf(res);
  logs.push(`[${name}] ${text}`);
  return text;
};
const safeRun = async (name, args = {}) => {
  try { return await run(name, args); }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[${name}] ERROR: ${msg}`);
    return `ERROR: ${msg}`;
  }
};

await client.connect(transport);
await safeRun('launch', { bundleId: 'com.google.Chrome' });
await safeRun('focus', { bundleId: 'com.google.Chrome' });
await safeRun('browser_open', { url: 'https://www.instagram.com/accounts/emailsignup/' });
await sleep(5000);

const fillCode = `(async () => {
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
  const passwordInput = inputs.find((i) => i.type === 'password');
  const usernameInput = inputs.find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');

  if (textInputs[0]) setNativeValue(textInputs[0], '9024981802');
  if (passwordInput) setNativeValue(passwordInput, 'Deoli@2026');
  if (textInputs[1]) setNativeValue(textInputs[1], 'manu singhal');

  async function pickCombo(labelPart, valueText) {
    const combo = Array.from(document.querySelectorAll('[role="combobox"]')).find((e) => ((e.getAttribute('aria-label') || '').toLowerCase().includes(labelPart)));
    if (!combo) return { ok: false, reason: 'combobox-not-found:' + labelPart };
    combo.click();
    await wait(220);
    const option = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"], div, span'))
      .filter(visible)
      .find((e) => (e.textContent || '').trim() === valueText);
    if (!option) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: false, reason: 'option-not-found:' + valueText };
    }
    option.click();
    await wait(160);
    return { ok: true };
  }

  const month = await pickCombo('month', 'May');
  const day = await pickCombo('day', '28');
  const year = await pickCombo('year', '1997');

  const usernameCandidates = [
    'screenhand_manu97',
    'screenhand_manu7413',
    'screenhand_manu' + String(Date.now()).slice(-5),
  ];

  let chosenUsername = usernameInput ? usernameInput.value : '';
  let usernameStatus = { valid: false, notAvail: false, invalid: false };

  if (usernameInput) {
    for (const u of usernameCandidates) {
      setNativeValue(usernameInput, u);
      await wait(1300);
      const txt = (document.body?.innerText || '').toLowerCase();
      usernameStatus = {
        valid: txt.includes('input username is valid'),
        notAvail: txt.includes('not available'),
        invalid: txt.includes('input username is invalid'),
      };
      chosenUsername = u;
      if (usernameStatus.valid && !usernameStatus.notAvail && !usernameStatus.invalid) {
        break;
      }
    }
  }

  const submit = Array.from(document.querySelectorAll('[role="button"], button, div'))
    .filter(visible)
    .find((e) => (e.textContent || '').trim() === 'Submit');

  let submitProbe = null;
  if (submit) {
    submit.scrollIntoView({ block: 'center', inline: 'center' });
    const r = submit.getBoundingClientRect();
    submitProbe = {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
    };
  }

  return {
    ok: true,
    filled: {
      mobile: textInputs[0]?.value || null,
      passwordSet: !!passwordInput,
      name: textInputs[1]?.value || null,
      username: chosenUsername,
      usernameStatus,
    },
    month,
    day,
    year,
    submitProbe,
  };
})()`;

const fill = await safeRun('browser_js', { code: fillCode });
await sleep(1200);
const shot = await safeRun('screenshot_file', {});

console.log(JSON.stringify({ ok: true, fill, screenshot: shot, logs }, null, 2));
await client.close();
