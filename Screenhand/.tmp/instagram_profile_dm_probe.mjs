import CDP from 'chrome-remote-interface';

const PORT = 9222;
const USERNAME = process.argv[2] || 'alimasadia_';

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

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: `https://www.instagram.com/${USERNAME}/` });
  await waitReady(Runtime, 30000);
  await sleep(1600);

  const before = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    return {
      url: location.href,
      title: document.title,
      profileButtons: Array.from(document.querySelectorAll('button,[role="button"],a')).map(el => clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,80)
    };
  })()`);

  const clicked = await clickByText(Runtime, Input, '^message$');
  await sleep(2200);

  const after = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).map((el)=>({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      aria: el.getAttribute('aria-label') || null,
      text: clean(el.textContent).slice(0,120)
    })).slice(0,20);
    const textareas = Array.from(document.querySelectorAll('textarea,input[type="text"]')).map((el)=>({
      tag: el.tagName.toLowerCase(),
      name: el.name || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null
    })).slice(0,20);
    const btns = Array.from(document.querySelectorAll('button,[role="button"],a')).map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,120);
    return { url: location.href, title: document.title, editables, textareas, btns };
  })()`);

  const expandClicked = await clickByText(Runtime, Input, '^expand$');
  await sleep(1800);

  const afterExpand = await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).map((el)=>({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      aria: el.getAttribute('aria-label') || null,
      text: clean(el.textContent).slice(0,120)
    })).slice(0,20);
    const textareas = Array.from(document.querySelectorAll('textarea,input[type="text"]')).map((el)=>({
      tag: el.tagName.toLowerCase(),
      name: el.name || null,
      placeholder: el.placeholder || null,
      aria: el.getAttribute('aria-label') || null
    })).slice(0,20);
    const btns = Array.from(document.querySelectorAll('button,[role="button"],a')).map((el)=>clean(el.textContent)||clean(el.getAttribute('aria-label'))||'').filter(Boolean).slice(0,120);
    const iframes = Array.from(document.querySelectorAll('iframe')).map((f)=>({
      src: f.src || null,
      title: f.title || null,
      name: f.name || null
    }));
    return { url: location.href, title: document.title, editables, textareas, btns, iframes };
  })()`);

  console.log(JSON.stringify({ username: USERNAME, clicked, before, after, expandClicked, afterExpand }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err?.message || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
