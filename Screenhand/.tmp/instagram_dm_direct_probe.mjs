import CDP from 'chrome-remote-interface';

const PORT = 9222;
const USERNAME = process.argv[2] || 'natashandadeola';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(Runtime, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const rr = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
      if (rr?.result?.value === 'complete' || rr?.result?.value === 'interactive') return true;
    } catch {}
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
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function keyTap(Input, key, code, modifiers = 0) {
  await Input.dispatchKeyEvent({ type: 'keyDown', key, code, modifiers });
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code, modifiers });
}

async function clickByText(Runtime, Input, regexSource) {
  const target = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const nodes = Array.from(document.querySelectorAll('button,a,[role="button"],div,span')).map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!text || !re.test(text)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return null;
      const visible = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, area: r.width * r.height };
    }).filter(Boolean);
    if (!nodes.length) return null;
    nodes.sort((a,b) => a.area - b.area);
    return nodes[0];
  })()`);
  if (!target) return null;
  await clickAt(Input, target.x, target.y);
  return target;
}

async function typeHuman(Input, text) {
  for (const ch of text) {
    await Input.dispatchKeyEvent({ type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await Input.dispatchKeyEvent({ type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
    await sleep(14);
  }
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: 'https://www.instagram.com/direct/new/' });
  await waitReady(Runtime, 30000);
  await sleep(1400);

  const initial = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    return {
      url: location.href,
      title: document.title,
      inputs: Array.from(document.querySelectorAll('input,textarea')).slice(0,20).map((el)=>({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        aria: el.getAttribute('aria-label') || null
      })),
      buttons: Array.from(document.querySelectorAll('button,[role="button"]')).slice(0,40).map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'')
    };
  })()`);

  const newMsgClicked = await clickByText(Runtime, Input, '^new message$|^message$');
  await sleep(1200);

  const afterNewMessageClick = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    return {
      url: location.href,
      title: document.title,
      inputs: Array.from(document.querySelectorAll('input,textarea')).slice(0,20).map((el)=>({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        aria: el.getAttribute('aria-label') || null
      })),
      buttons: Array.from(document.querySelectorAll('button,[role="button"]')).slice(0,50).map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'')
    };
  })()`);

  const search = await evalValue(Runtime, `(() => {
    const selectors = ['input[name="searchInput"]','input[name="queryBox"]','input[placeholder*="Search"]','input[aria-label*="Search"]','input[type="text"]'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 12) continue;
      return { selector: s, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  })()`);

  if (search) {
    await clickAt(Input, search.x, search.y);
    await sleep(120);
    await keyTap(Input, 'a', 'KeyA', 4);
    await keyTap(Input, 'Backspace', 'Backspace');
    await sleep(100);
    await typeHuman(Input, USERNAME);
    await sleep(1600);
  }

  const afterType = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const u = ${JSON.stringify(USERNAME.toLowerCase())};
    const candidates = Array.from(document.querySelectorAll('div,button,label,li,[role="button"]')).map((el) => {
      const t = clean(el.textContent).toLowerCase();
      if (!t || !t.includes(u)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 12) return null;
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        text: clean(el.textContent).slice(0,180),
        aria: el.getAttribute('aria-label') || null,
        className: (el.className || '').toString().slice(0,140),
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        width: r.width,
        height: r.height
      };
    }).filter(Boolean).slice(0,30);

    const allButtons = Array.from(document.querySelectorAll('button,[role="button"]')).map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,60);
    return { url: location.href, candidates, allButtons };
  })()`);

  console.log(JSON.stringify({ username: USERNAME, newMsgClicked, search, initial, afterNewMessageClick, afterType }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err?.message || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
