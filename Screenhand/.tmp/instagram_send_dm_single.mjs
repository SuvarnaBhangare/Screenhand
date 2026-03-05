import CDP from 'chrome-remote-interface';

const PORT = 9222;
const USERNAME = process.argv[2] || 'alysaxliu';
const DM_MESSAGE = [
  "Hey! I'm Codex helping @screenhand_ with Instagram growth workflows.",
  "We build ScreenHand: AI agents that can see, click, type, and automate desktop tasks via MCP.",
  "Loved your content in AI/tech. Open to quick feedback or a collab idea?"
].join('\n\n');

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
    nodes.sort((a,b) => b.area - a.area);
    return nodes[0];
  })()`);
  if (!target) return null;
  await clickAt(Input, target.x, target.y);
  return target;
}

async function typeHuman(Input, text) {
  for (const ch of text) {
    if (ch === '\n') {
      await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter' });
      await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
      await sleep(20);
      continue;
    }
    await Input.dispatchKeyEvent({ type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await Input.dispatchKeyEvent({ type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
    await sleep(14);
  }
}

let client;
const report = { username: USERNAME, sent: false, steps: [], errors: [] };
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: `https://www.instagram.com/${USERNAME}/` });
  await waitReady(Runtime, 30000);
  await sleep(1500);
  report.steps.push('opened-profile');

  const profileMessage = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const inHeader = Array.from(document.querySelectorAll('main header button, main section header button, main header a[role="button"], main section header a[role="button"], main header [role="button"], main section header [role="button"]'));
    const cands = inHeader.map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!/^message$/i.test(text)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }).filter(Boolean);
    return cands[0] || null;
  })()`);
  if (!profileMessage) throw new Error('profile-message-button-missing');
  await clickAt(Input, profileMessage.x, profileMessage.y);
  await sleep(2200);
  report.steps.push('clicked-message');

  let expand = await evalValue(Runtime, `(() => {
    const el = document.querySelector('[aria-label="Expand"], [title="Expand"], button[aria-label="Expand"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (expand) {
    await clickAt(Input, expand.x, expand.y);
  } else {
    expand = await clickByText(Runtime, Input, '^expand$');
  }
  if (expand) {
    await sleep(1400);
    report.steps.push('clicked-expand');
  }

  await clickByText(Runtime, Input, '^not now$');
  await sleep(250);

  const composer = await evalValue(Runtime, `(() => {
    const box = document.querySelector('div[contenteditable="true"][role="textbox"][aria-label*="Message"], div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!composer) throw new Error('composer-missing');
  await clickAt(Input, composer.x, composer.y);
  await sleep(150);
  report.steps.push('focused-composer');

  await typeHuman(Input, DM_MESSAGE);
  await sleep(220);
  report.steps.push('typed-message');

  const sendBtn = await clickByText(Runtime, Input, '^send$');
  if (!sendBtn) {
    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter' });
    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  }
  await sleep(900);
  report.steps.push('submitted');

  report.sent = true;
  report.finalUrl = await evalValue(Runtime, 'location.href');
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  report.errors.push(err?.message || String(err));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
