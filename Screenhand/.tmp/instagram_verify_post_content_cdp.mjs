import CDP from 'chrome-remote-interface';

const PORT = 9222;
const URL = 'https://www.instagram.com/screenhand_/p/DVf2aU7k-8Y/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: URL });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const rr = await Runtime.evaluate({ expression: "document.readyState", returnByValue: true });
    if (rr?.result?.value === 'complete' || rr?.result?.value === 'interactive') break;
    await sleep(250);
  }
  await sleep(1200);

  const out = await Runtime.evaluate({
    expression: `(() => {
      const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      const low = txt.toLowerCase();
      return {
        url: location.href,
        title: document.title,
        hasLaunchingText: low.includes('launching screenhand today'),
        hasGithubText: low.includes('github.com/manushi4/screenhand'),
        hasMcp: low.includes('mcp'),
        snippet: txt.slice(0, 1200)
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify(out?.result?.value || {}, null, 2));
} catch (e) {
  console.error('VERIFY_CDP_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
