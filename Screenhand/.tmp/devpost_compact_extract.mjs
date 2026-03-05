import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-compact-extract', version:'1.0.0' }, { capabilities:{} });
const t = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const pages = [
  'https://devpost.com/',
  'https://devpost.com/hackathons',
  'https://devpost.com/software',
  'https://devpost.com/settings',
  'https://devpost.com/portfolio/redirect?page=projects',
  'https://info.devpost.com/',
  'https://info.devpost.com/product/public-hackathons',
  'https://info.devpost.com/product/devpost-for-teams',
  'https://help.devpost.com/'
];

async function call(name, args={}) {
  try {
    const r = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(r) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });

  const out = [];
  for (const url of pages) {
    await call('browser_navigate', { url });
    await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 25000 });
    await sleep(1200);

    const summary = await call('browser_js', {
      code: `(() => {
        const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

        const title = document.title;
        const currentUrl = location.href;
        const headings = uniq(Array.from(document.querySelectorAll('h1,h2,h3')).map(el => norm(el.textContent))).slice(0, 8);

        const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: norm(a.textContent).slice(0, 80),
          href: a.href || ''
        })).filter(l => l.href);

        const usefulLinks = links.filter(l => {
          const x = (l.text + ' ' + l.href).toLowerCase();
          return /settings|portfolio|projects|hackathons|software|submit|host|help|guides|notifications|account|password|privacy|preferences|eligibility|team|demo|pricing|judg/i.test(x);
        }).slice(0, 12);

        const body = norm(document.body ? document.body.innerText : '');
        const snippet = body.slice(0, 550);

        const fields = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
          name: el.getAttribute('name') || null,
          id: el.id || null,
          type: el.getAttribute('type') || el.tagName.toLowerCase(),
          visible: !!(el.offsetParent !== null),
          required: !!el.required
        })).filter(f => f.visible).slice(0, 20);

        const ctas = uniq(Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"]')).map(el => norm(el.textContent || el.value || '')).filter(s => /join|host|submit|create|add|save|continue|settings|project|portfolio|demo|login|log out|help/i.test(s))).slice(0, 12);

        return { title, url: currentUrl, headings, usefulLinks, ctas, visibleFieldCount: fields.length, fields, snippet };
      })()`
    });

    out.push({ requested: url, data: summary.ok ? JSON.parse(summary.text) : { error: summary.error } });
  }

  console.log(JSON.stringify(out, null, 2));
} finally {
  try { await client.close(); } catch {}
}
