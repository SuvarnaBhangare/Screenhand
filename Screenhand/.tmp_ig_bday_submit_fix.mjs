import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-bday-submit-fix', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const code = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);

  async function pickCombo(labelPart, valueText) {
    const combo = Array.from(document.querySelectorAll('[role="combobox"]'))
      .find((e) => ((e.getAttribute('aria-label') || '').toLowerCase().includes(labelPart.toLowerCase())));

    if (!combo) return { ok: false, reason: 'combobox-not-found:' + labelPart };

    combo.click();
    await wait(300);

    const candidates = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="button"], div, span'))
      .filter(visible)
      .filter((e) => (e.textContent || '').trim() === valueText);

    const option = candidates.find((e) => e !== combo) || null;
    if (!option) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: false, reason: 'option-not-found:' + valueText };
    }

    option.click();
    await wait(200);
    return { ok: true };
  }

  const month = await pickCombo('month', 'May');
  const day = await pickCombo('day', '28');
  const year = await pickCombo('year', '1997');

  const submit = Array.from(document.querySelectorAll('[role="button"], button, div'))
    .find((e) => visible(e) && (e.textContent || '').trim() === 'Submit');

  if (submit) {
    submit.click();
    await wait(500);
  }

  return { month, day, year, submitFound: !!submit };
})()`;

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });
const step = await client.callTool({ name: 'browser_js', arguments: { code } });
await sleep(5000);
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });

console.log('STEP=' + textOf(step));
console.log('SHOT=' + textOf(shot));

await client.close();
