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
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const rr = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (rr?.result?.value === 'complete' || rr?.result?.value === 'interactive') break;
    await sleep(250);
  }
  await sleep(1800);

  const out = await Runtime.evaluate({
    expression: `(() => {
      const b = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      const low = b.toLowerCase();
      const ta = document.querySelector('textarea[aria-label="Add a comment…"], textarea[placeholder="Add a comment…"], textarea');
      return {
        url: location.href,
        hasNoComments: low.includes('no comments yet'),
        hasLaunchPhrase: low.includes('ai that can see, click, type'),
        hasGithub: low.includes('github.com/manushi4/screenhand'),
        textareaValue: ta ? ta.value : null,
        snippet: b.slice(0, 1200)
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify(out?.result?.value || {}, null, 2));
} catch (e) {
  console.error('CHECK_COMMENT_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
