import CDP from 'chrome-remote-interface';

const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(Runtime, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const rr = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (rr?.result?.value === 'complete' || rr?.result?.value === 'interactive') return true;
    await sleep(250);
  }
  return false;
}

async function evalValue(Runtime, expression) {
  const out = await Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
  if (out?.exceptionDetails) {
    const msg = out.exceptionDetails?.exception?.description || out.exceptionDetails?.text || 'runtime error';
    throw new Error(msg);
  }
  return out?.result?.value;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /x\.com|twitter\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page');
  if (!target) throw new Error('No Chrome page target on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: 'https://x.com/screenhand_' });
  await waitReady(Runtime, 30000);
  await sleep(1300);

  // Open edit profile + edit photo by text click in DOM
  await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const clickText = (re) => {
      const els = Array.from(document.querySelectorAll('button,a,[role="button"],div,span'));
      const el = els.find((n)=>re.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||clean(n.getAttribute('title'))));
      if (el) { el.click(); return true; }
      return false;
    };
    clickText(/^edit profile$/i);
    return true;
  })()`);
  await sleep(1000);

  await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const els = Array.from(document.querySelectorAll('button,a,[role="button"],div,span'));
    const el = els.find((n)=>/^edit photo$/i.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||clean(n.getAttribute('title'))));
    if (el) { el.click(); return true; }
    return false;
  })()`);
  await sleep(1200);

  const probe = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const root = document.querySelector('div[role="dialog"]') || document;
    const buttons = Array.from(root.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="file"],input[type="submit"]')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || null,
        text: clean(el.textContent),
        aria: clean(el.getAttribute('aria-label')),
        title: clean(el.getAttribute('title')),
        placeholder: clean(el.getAttribute('placeholder')),
        name: clean(el.getAttribute('name')),
        dt: clean(el.getAttribute('data-testid')),
        accept: clean(el.getAttribute('accept')),
        visible: r.width > 2 && r.height > 2,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      };
    });

    const inputs = Array.from(root.querySelectorAll('input,textarea')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || null,
        text: clean(el.value || ''),
        placeholder: clean(el.getAttribute('placeholder')),
        aria: clean(el.getAttribute('aria-label')),
        name: clean(el.getAttribute('name')),
        dt: clean(el.getAttribute('data-testid')),
        accept: clean(el.getAttribute('accept')),
        visible: r.width > 2 && r.height > 2,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      };
    });

    const txt = clean(root.innerText || '').slice(0, 2000);
    return { url: location.href, title: document.title, buttons, inputs, text: txt };
  })()`);

  console.log(JSON.stringify(probe, null, 2));
} catch (e) {
  console.error('X_IMAGINE_PROBE_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
