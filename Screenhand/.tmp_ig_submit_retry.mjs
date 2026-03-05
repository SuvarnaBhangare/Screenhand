import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});
const client = new Client({ name: 'screenhand-instagram-submit-retry', version: '1.0.0' }, { capabilities: {} });
const textOf = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);

const code = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);

  let clicked = false;
  let attempts = 0;
  while (!clicked && attempts < 5) {
    attempts++;

    const submitCandidates = Array.from(document.querySelectorAll('[role="button"], button, div'))
      .filter(visible)
      .filter((e) => (e.textContent || '').trim() === 'Submit');

    const submit = submitCandidates[0] || null;
    if (submit) {
      submit.scrollIntoView({ block: 'center' });
      await wait(200);
      submit.click();
      clicked = true;
      break;
    }
    window.scrollBy(0, 250);
    await wait(300);
  }

  await wait(3000);
  return {
    clicked,
    attempts,
    url: location.href,
    title: document.title,
  };
})()`;

await client.connect(transport);
await client.callTool({ name: 'focus', arguments: { bundleId: 'com.google.Chrome' } });
const step = await client.callTool({ name: 'browser_js', arguments: { code } });
await sleep(3000);
const shot = await client.callTool({ name: 'screenshot_file', arguments: {} });
console.log('STEP=' + textOf(step));
console.log('SHOT=' + textOf(shot));
await client.close();
