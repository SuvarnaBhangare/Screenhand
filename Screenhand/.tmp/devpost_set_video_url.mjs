import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const VIDEO_URL = process.argv[2];
if (!VIDEO_URL) {
  console.error('Usage: node .tmp/devpost_set_video_url.mjs <youtube_or_vimeo_or_loom_url>');
  process.exit(1);
}

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-set-video-url', version:'1.0.0' }, { capabilities:{} });
const t = (r)=> r?.content?.find?.(c=>c.type==='text')?.text || JSON.stringify(r);

async function call(name, args={}) { return client.callTool({ name, arguments: args }); }

try {
  await client.connect(transport);
  await call('focus', { bundleId:'com.google.Chrome' });
  await call('browser_navigate', { url:'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit' });
  await call('browser_wait', { condition:'document.readyState === "complete"', timeoutMs:30000 });

  const set = await call('browser_js', { code:`(() => {
    const el = document.querySelector('#software_video_url');
    if (!el) return { ok:false, reason:'video_input_not_found' };
    const val = ${JSON.stringify('@@VIDEO_URL@@')}.replace('@@VIDEO_URL@@', ${JSON.stringify(VIDEO_URL)});
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val); else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
    const save = document.querySelector('#software-save');
    if (save) save.click();
    return { ok:true, value: el.value, clickedSave: !!save };
  })()` });

  console.log(t(set));
} finally {
  try { await client.close(); } catch {}
}
