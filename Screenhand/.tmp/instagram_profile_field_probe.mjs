import CDP from 'chrome-remote-interface';

const PORT = 9222;
const URL = 'https://www.instagram.com/accounts/edit/';
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
  await sleep(1400);

  const out = await Runtime.evaluate({
    expression: `(() => {
      const clean = (s) => (s || '').replace(/\\s+/g,' ').trim();
      const fields = Array.from(document.querySelectorAll('input,textarea,select')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        aria: el.getAttribute('aria-label') || null,
        value: (el.value || '').slice(0,200),
        visible: (() => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; })()
      }));

      const submit = Array.from(document.querySelectorAll('button')).map((b) => {
        const r = b.getBoundingClientRect();
        return { text: clean(b.textContent), type: b.type || null, disabled: !!b.disabled, visible: r.width > 8 && r.height > 8 };
      }).filter((b) => b.visible);

      const profileLink = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .find((h) => /^\/[A-Za-z0-9._]+\/$/.test(h || '') && !['/accounts/','/explore/','/reels/','/direct/'].includes(h || '')) || null;

      return {
        url: location.href,
        title: document.title,
        profileLink,
        fields,
        submit
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify(out?.result?.value || {}, null, 2));
} catch (e) {
  console.error('PROFILE_FIELD_PROBE_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
