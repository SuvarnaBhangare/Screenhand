import CDP from 'chrome-remote-interface';

const PORT = 9222;
const URL = 'https://www.instagram.com/screenhand_/p/DVf2aU7k-8Y/';
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

async function clickAt(Input, x, y) {
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await sleep(40);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
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

  const more = await evalValue(Runtime, `(() => {
    const svg = document.querySelector('svg[aria-label="More options"]');
    const btn = svg ? svg.closest('button,[role="button"],a,div,span') : null;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!more) throw new Error('More options not found');
  await clickAt(Input, more.x, more.y);
  await sleep(900);

  const edit = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const nodes = Array.from(document.querySelectorAll('button,a,[role="button"],div,span')).map(el => {
      const txt = clean(el.textContent) || clean(el.getAttribute('aria-label'));
      if (!/^edit$/i.test(txt)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, txt };
    }).filter(Boolean);
    return nodes[0] || null;
  })()`);
  if (!edit) throw new Error('Edit not found');
  await clickAt(Input, edit.x, edit.y);
  await sleep(1200);

  const dump = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const dialog = document.querySelector('div[role="dialog"]');
    const root = dialog || document;
    const fields = Array.from(root.querySelectorAll('textarea,input,[contenteditable="true"],div[role="textbox"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        role: el.getAttribute('role') || null,
        contenteditable: el.getAttribute('contenteditable') || null,
        aria: el.getAttribute('aria-label') || null,
        placeholder: el.getAttribute('placeholder') || null,
        id: el.id || null,
        name: el.name || null,
        class: (el.className || '').toString().slice(0, 120),
        visible: r.width > 8 && r.height > 8,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        value: (el.value || '').slice(0, 120),
        text: clean(el.textContent).slice(0, 120)
      };
    });

    const actions = Array.from(root.querySelectorAll('button,a,[role="button"],div,span')).map((el) => {
      const txt = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      const r = el.getBoundingClientRect();
      if (!txt || r.width < 10 || r.height < 10) return null;
      return { text: txt.slice(0,120), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || null, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    }).filter(Boolean).slice(0, 160);

    return {
      url: location.href,
      title: document.title,
      hasDialog: !!dialog,
      fields,
      actions
    };
  })()`);

  console.log(JSON.stringify(dump, null, 2));
} catch (e) {
  console.error('EDIT_DIALOG_PROBE_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
