import CDP from 'chrome-remote-interface';

const PORT = 9222;
const START_URL = 'https://accountscenter.instagram.com/profiles/';
const TARGET_NAME = 'ScreenHand';
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

async function clickByText(Runtime, Input, regexSource) {
  const target = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const nodes = Array.from(document.querySelectorAll('button,a,[role="button"],div,span')).map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!text || !re.test(text)) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 10 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, tag: el.tagName.toLowerCase(), area: r.width * r.height };
    }).filter(Boolean);
    nodes.sort((a,b) => a.area - b.area);
    return nodes[0] || null;
  })()`);

  if (!target) return null;
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: target.x, y: target.y });
  await sleep(40);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  return target;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /accountscenter\.instagram\.com|instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  console.log('[1/6] Open accounts center profiles');
  await Page.navigate({ url: START_URL });
  await waitReady(Runtime, 30000);
  await sleep(1600);

  const state1 = await evalValue(Runtime, `(() => ({ url: location.href, title: document.title, snippet: (document.body?.innerText||'').slice(0,800) }))()`);
  console.log('State1:', JSON.stringify(state1, null, 2));

  console.log('[2/6] Click profile row (screenhand_)');
  let clicked = await clickByText(Runtime, Input, '^screenhand_$|screenhand_');
  console.log('Clicked profile:', clicked);
  await sleep(1800);

  const state2 = await evalValue(Runtime, `(() => ({ url: location.href, title: document.title, snippet: (document.body?.innerText||'').slice(0,1000) }))()`);
  console.log('State2:', JSON.stringify(state2, null, 2));

  console.log('[3/6] Open Name editor if present');
  let clickedName = await clickByText(Runtime, Input, '^name$|full name|display name');
  if (!clickedName) {
    clickedName = await clickByText(Runtime, Input, 'personal details');
  }
  console.log('Clicked name/personal details:', clickedName);
  await sleep(1800);

  const state3 = await evalValue(Runtime, `(() => ({ url: location.href, title: document.title, snippet: (document.body?.innerText||'').slice(0,1000) }))()`);
  console.log('State3:', JSON.stringify(state3, null, 2));

  console.log('[4/6] Set name field to ScreenHand');
  const setName = await evalValue(Runtime, `(() => {
    function setField(el, value) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      const setter = desc && desc.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const inputs = Array.from(document.querySelectorAll('input,textarea')).filter((el) => {
      const m = ((el.id||'') + ' ' + (el.name||'') + ' ' + (el.placeholder||'') + ' ' + (el.getAttribute('aria-label')||'')).toLowerCase();
      return /name|full name|display/.test(m);
    });

    const target = inputs[0] || Array.from(document.querySelectorAll('input[type="text"], textarea')).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 20;
    }) || null;

    if (!target) return { ok:false, reason:'no editable name input found', inputsCount: inputs.length };

    target.focus();
    setField(target, ${JSON.stringify(TARGET_NAME)});
    return { ok:true, value: target.value || target.textContent || null };
  })()`);
  console.log('Set name result:', JSON.stringify(setName, null, 2));

  console.log('[5/6] Save');
  const saveBtn = await clickByText(Runtime, Input, '^save$|^done$|continue|next');
  console.log('Clicked save/done:', saveBtn);
  await sleep(1800);

  console.log('[6/6] Verify on Instagram profile page');
  await Page.navigate({ url: 'https://www.instagram.com/screenhand_/' });
  await waitReady(Runtime, 30000);
  await sleep(1500);

  const verify = await evalValue(Runtime, `(() => {
    const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    const low = txt.toLowerCase();
    return {
      url: location.href,
      title: document.title,
      hasScreenHandName: low.includes('screenhand'),
      hasManuSinghal: low.includes('manu singhal'),
      snippet: txt.slice(0, 1200)
    };
  })()`);

  console.log(JSON.stringify({ success: true, targetName: TARGET_NAME, setName, verify }, null, 2));
} catch (e) {
  console.error('AC_NAME_UPDATE_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
