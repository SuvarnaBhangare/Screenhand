import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-fresh-full', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const logs = [];
const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = textOf(res);
  logs.push(`[${name}] ${text}`);
  return text;
};

const safeRun = async (name, args = {}) => {
  try {
    return await run(name, args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[${name}] ERROR: ${msg}`);
    return `ERROR: ${msg}`;
  }
};

await client.connect(transport);

await safeRun('launch', { bundleId: 'com.google.Chrome' });
await safeRun('focus', { bundleId: 'com.google.Chrome' });

// Open signup page in fresh tab context
await safeRun('browser_open', { url: 'https://www.instagram.com/accounts/emailsignup/' });
await sleep(6000);

// Fill static fields + birthday
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

  if (textInputs[0]) setNativeValue(textInputs[0], '7413930993');
  if (passwordInput) setNativeValue(passwordInput, 'Deoli@2026');
  if (textInputs[1]) setNativeValue(textInputs[1], 'manu singhal');

  async function pickCombo(labelPart, valueText) {
    const combo = Array.from(document.querySelectorAll('[role="combobox"]')).find((e) => ((e.getAttribute('aria-label') || '').toLowerCase().includes(labelPart)));
    if (!combo) return { ok: false, reason: 'combobox-not-found:' + labelPart };

    combo.click();
    await wait(250);

    const option = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"], div, span'))
      .filter(visible)
      .find((e) => (e.textContent || '').trim() === valueText);

    if (!option) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: false, reason: 'option-not-found:' + valueText };
    }

    option.click();
    await wait(150);
    return { ok: true };
  }

  const month = await pickCombo('month', 'May');
  const day = await pickCombo('day', '28');
  const year = await pickCombo('year', '1997');

  return {
    ok: true,
    month,
    day,
    year,
    inputIds: inputs.map((i) => ({ id: i.id, type: i.type, aria: i.getAttribute('aria-label') })),
  };
})()`;

await safeRun('browser_js', { code: fillCode });

// Username attempt with fallback
const uniqueSuffix = String(Date.now()).slice(-5);
const usernameCandidates = [
  'screenhand',
  'screenhand_manu97',
  'screenhand_manu7413',
  `screenhand_manu${uniqueSuffix}`,
];

let chosenUsername = null;
for (const uname of usernameCandidates) {
  const usernameCode = `(() => {
    const setNativeValue = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    const u = Array.from(document.querySelectorAll('input')).find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');
    if (!u) return { ok: false, reason: 'username-input-not-found' };
    setNativeValue(u, ${JSON.stringify(uname)});
    return { ok: true, username: u.value };
  })()`;

  await safeRun('browser_js', { code: usernameCode });
  await sleep(1800);

  const checkCode = `(() => {
    const u = Array.from(document.querySelectorAll('input')).find((i) => (i.getAttribute('aria-label') || '').toLowerCase() === 'username' || i.type === 'search');
    const value = u ? u.value : null;
    const text = (document.body?.innerText || '').toLowerCase();
    const notAvail = text.includes('username ' + (value || '').toLowerCase() + ' is not available') || text.includes('not available');
    const invalid = text.includes('input username is invalid');
    const valid = text.includes('input username is valid');
    return { value, notAvail, invalid, valid };
  })()`;

  const checkRaw = await safeRun('browser_js', { code: checkCode });
  let check;
  try { check = JSON.parse(checkRaw); } catch { check = { value: uname, notAvail: true, invalid: true, valid: false }; }

  if (check.valid && !check.notAvail && !check.invalid) {
    chosenUsername = check.value;
    logs.push(`[username] chosen=${chosenUsername}`);
    break;
  }
}

if (!chosenUsername) {
  logs.push('[username] no fully valid candidate confirmed; continuing with last candidate');
}

// Find exact submit rect in current page and do mouse click there
const submitProbeCode = `(() => {
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const btn = Array.from(document.querySelectorAll('[role="button"], button, div')).filter(visible).find((e) => (e.textContent || '').trim() === 'Submit');
  if (!btn) return { ok: false, reason: 'submit-not-found' };
  btn.scrollIntoView({ block: 'center', inline: 'center' });
  const r = btn.getBoundingClientRect();
  return { ok: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } };
})()`;

const probeRaw = await safeRun('browser_js', { code: submitProbeCode });
let probe;
try { probe = JSON.parse(probeRaw); } catch { probe = { ok: false, raw: probeRaw }; }

if (probe.ok && probe.center) {
  await safeRun('click', { x: probe.center.x, y: probe.center.y });
  logs.push(`[submit] clicked_at=(${probe.center.x},${probe.center.y})`);
} else {
  logs.push('[submit] submit button not found for coordinate click');
}

await sleep(7000);

const pageInfo = await safeRun('browser_page_info', {});
const shot = await safeRun('screenshot_file', {});

console.log(JSON.stringify({
  ok: true,
  chosenUsername,
  probe,
  pageInfo,
  screenshot: shot,
  logs,
}, null, 2));

await client.close();
