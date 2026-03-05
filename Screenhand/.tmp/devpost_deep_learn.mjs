import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'],
});

const client = new Client({ name: 'screenhand-devpost-deep-learn', version: '1.0.0' }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pages = [
  'https://devpost.com/',
  'https://devpost.com/hackathons',
  'https://devpost.com/software',
  'https://devpost.com/settings',
  'https://devpost.com/portfolio/redirect?page=projects',
  'https://info.devpost.com/',
  'https://info.devpost.com/product/public-hackathons',
  'https://info.devpost.com/product/devpost-for-teams',
  'https://help.devpost.com/',
];

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function scanPage(url) {
  const nav = await call('browser_navigate', { url });
  if (!nav.ok) return { url, error: nav.error, stage: 'navigate' };

  await call('browser_wait', { condition: 'document.readyState === "complete"', timeoutMs: 25000 });
  await sleep(1800);

  const info = await call('browser_page_info', {});
  const summary = await call('browser_js', {
    code: `(() => {
      try {
        const normalize = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const uniqBy = (arr, keyFn) => {
          const seen = new Set();
          const out = [];
          for (const item of arr) {
            const k = keyFn(item);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(item);
          }
          return out;
        };

        const bodyText = normalize(document.body ? document.body.innerText : '');

        const headings = uniqBy(
          Array.from(document.querySelectorAll('h1,h2,h3')).map((el) => normalize(el.textContent)).filter(Boolean),
          (x) => x.toLowerCase()
        ).slice(0, 30);

        const links = uniqBy(
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            text: normalize(a.textContent).slice(0, 100),
            href: a.href || ''
          })).filter((x) => x.href),
          (x) => x.href + '|' + x.text.toLowerCase()
        ).slice(0, 50);

        const ctas = uniqBy(
          Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"]')).map((el) => {
            const tx = normalize(el.textContent || el.value || '');
            if (!tx) return null;
            return { text: tx.slice(0, 100), href: el.href || null };
          }).filter(Boolean),
          (x) => (x.text + '|' + (x.href || '')).toLowerCase()
        ).filter((x) => /join|host|submit|create|add|start|get started|register|sign up|login|log in|settings|projects|hackathon|portfolio/i.test(x.text)).slice(0, 30);

        const keywordCount = (w) => (bodyText.match(new RegExp('\\\\b' + w + '\\b', 'ig')) || []).length;
        const keywords = {
          hackathon: keywordCount('hackathon'),
          project: keywordCount('project'),
          submit: keywordCount('submit'),
          host: keywordCount('host'),
          team: keywordCount('team'),
          prize: keywordCount('prize'),
          ai: keywordCount('ai'),
        };

        const doc = document.documentElement;
        const totalHeight = Math.max(
          doc ? doc.scrollHeight : 0,
          document.body ? document.body.scrollHeight : 0,
          doc ? doc.offsetHeight : 0,
          document.body ? document.body.offsetHeight : 0
        );
        const viewport = window.innerHeight || 0;
        const maxY = Math.max(0, totalHeight - viewport);
        const steps = Math.max(1, Math.ceil(maxY / Math.max(1, Math.floor(viewport * 0.8))));
        const marks = [];

        for (let i = 0; i <= steps; i++) {
          const y = steps === 0 ? 0 : Math.round((i / steps) * maxY);
          window.scrollTo(0, y);

          const visibleHeads = uniqBy(
            Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((el) => {
              const r = el.getBoundingClientRect();
              if (r.bottom < 0 || r.top > window.innerHeight) return null;
              const tx = normalize(el.textContent);
              if (!tx) return null;
              return tx.slice(0, 100);
            }).filter(Boolean),
            (x) => x.toLowerCase()
          ).slice(0, 6);

          marks.push({ i, y, visibleHeads });
          if (marks.length >= 20) break;
        }

        window.scrollTo(0, 0);

        return {
          ok: true,
          title: document.title,
          url: location.href,
          totalHeight,
          viewport,
          scrollSteps: steps,
          headings,
          ctas,
          links,
          keywords,
          topSnippet: bodyText.slice(0, 1200),
          tailSnippet: bodyText.slice(-700),
          scrollMarks: marks,
        };
      } catch (err) {
        return { ok: false, error: String(err), title: document.title, url: location.href };
      }
    })()`,
  });

  return {
    requestedUrl: url,
    pageInfo: info.ok ? info.text : { error: info.error },
    summary: summary.ok ? summary.text : { error: summary.error },
  };
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });

  const results = [];
  for (const url of pages) {
    const r = await scanPage(url);
    results.push(r);
  }

  const tabs = await call('browser_tabs', {});

  console.log(JSON.stringify({ scannedAt: new Date().toISOString(), pages, results, tabs }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
