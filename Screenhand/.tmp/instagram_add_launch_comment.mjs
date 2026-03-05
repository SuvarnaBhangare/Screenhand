import CDP from 'chrome-remote-interface';

const PORT = 9222;
const URL = 'https://www.instagram.com/screenhand_/p/DVf2aU7k-8Y/';
const COMMENT = `ScreenHand = AI that can see, click, type, and automate real desktop workflows via MCP.\n\nOpen source: github.com/manushi4/Screenhand\n\nComment \"demo\" if you want the full automation workflows.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(Runtime, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (r?.result?.value === 'complete' || r?.result?.value === 'interactive') return true;
    await sleep(250);
  }
  return false;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: URL });
  await waitReady(Runtime, 30000);
  await sleep(1400);

  const prep = await Runtime.evaluate({
    expression: `(() => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      let ta = document.querySelector('textarea[aria-label="Add a comment…"]') ||
               document.querySelector('textarea[placeholder="Add a comment…"]') ||
               Array.from(document.querySelectorAll('textarea')).find(el => /comment/i.test((el.getAttribute('aria-label')||'') + ' ' + (el.placeholder||'')));
      if (!ta) return { ok: false, reason: 'comment textarea not found' };
      ta.focus();
      const r = ta.getBoundingClientRect();
      return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, value: ta.value || '' };
    })()`,
    returnByValue: true,
  });

  const v = prep?.result?.value;
  if (!v?.ok) throw new Error(v?.reason || 'Comment box not found');

  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: v.x, y: v.y });
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });

  await Runtime.evaluate({
    expression: `(() => {
      const ta = document.querySelector('textarea[aria-label="Add a comment…"]') || document.querySelector('textarea[placeholder="Add a comment…"]') || document.querySelector('textarea');
      if (!ta) return { ok: false, reason: 'textarea missing at set' };
      ta.value = ${JSON.stringify(COMMENT)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`,
    returnByValue: true,
  });

  await sleep(400);

  const postBtn = await Runtime.evaluate({
    expression: `(() => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const btn = Array.from(document.querySelectorAll('button,[role="button"]')).find(el => /^post$/i.test(clean(el.textContent)));
      if (!btn) return { ok: false, reason: 'Post button not found' };
      const r = btn.getBoundingClientRect();
      return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
    returnByValue: true,
  });

  const b = postBtn?.result?.value;
  if (b?.ok) {
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x: b.x, y: b.y });
    await Input.dispatchMouseEvent({ type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  } else {
    // Fallback: submit via Enter on focused textarea.
    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter' });
    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  }

  await sleep(2400);

  const verify = await Runtime.evaluate({
    expression: `(() => {
      const t = (document.body?.innerText || '').toLowerCase();
      return {
        url: location.href,
        hasNoCommentsText: t.includes('no comments yet'),
        hasLaunchKeyword: t.includes('screenhand') || t.includes('github.com/manushi4/screenhand')
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify({ ok: true, commentLength: COMMENT.length, verify: verify?.result?.value }, null, 2));
} catch (e) {
  console.error('ADD_COMMENT_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
