import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-devpost-signup-open', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const logs = [];
const run = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const t = textOf(res);
  logs.push(`[${name}] ${t}`);
  return t;
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
await safeRun('browser_open', { url: 'https://devpost.com/' });
await sleep(4000);

// Click Sign up by visible text
const clickSignupCode = `(() => {
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const candidates = Array.from(document.querySelectorAll('a,button,[role="button"]')).filter(visible);
  const target = candidates.find((e) => (e.textContent || '').trim().toLowerCase() === 'sign up')
    || candidates.find((e) => (e.textContent || '').trim().toLowerCase().includes('sign up'));
  if (!target) return { ok: false, reason: 'sign-up-link-not-found' };
  target.click();
  return { ok: true, clickedText: (target.textContent || '').trim(), href: target.getAttribute('href') || null };
})()`;
await safeRun('browser_js', { code: clickSignupCode });
await sleep(4000);

const info = await safeRun('browser_page_info', {});
const fields = await safeRun('browser_dom', { selector: 'input,button,select', limit: 80 });
const shot = await safeRun('screenshot_file', {});

console.log(JSON.stringify({ info, fields, screenshot: shot, logs }, null, 2));
await client.close();
