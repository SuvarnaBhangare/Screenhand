import CDP from 'chrome-remote-interface';

const PORT = 9222;
const POST_URL = 'https://www.instagram.com/screenhand_/p/DVf2aU7k-8Y/';
const UNIQUE_CHECK = 'What is ScreenHand?';

const NEW_CAPTION = `What is ScreenHand?\nScreenHand is an open-source desktop automation MCP server that gives AI agents eyes + hands on your computer.\n\nIt can:\n- Read screen + UI tree\n- Click, type, and navigate apps\n- Automate Chrome + native desktop workflows\n\nBest for QA, growth ops, support playbooks, and repetitive cross-app tasks.\n\nOpen source: github.com/manushi4/Screenhand\nWebsite: screenhand.com\n\nComment "demo" and we will share a real workflow.\n\n#ScreenHand #AIAgent #DesktopAutomation #MCP #ModelContextProtocol #WorkflowAutomation #OpenSource #QA #RPA`;

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
  await sleep(50);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function typeTextHuman(Input, text) {
  for (const ch of text) {
    if (ch === '\n') {
      await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter' });
      await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
      await sleep(18);
      continue;
    }
    await Input.dispatchKeyEvent({ type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await Input.dispatchKeyEvent({ type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
    await sleep(14);
  }
}

async function clickByText(Runtime, Input, regexSource, withinDialog = false) {
  const target = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const root = ${withinDialog ? "document.querySelector('div[role=\\\"dialog\\\"]') || document" : 'document'};
    const els = Array.from(root.querySelectorAll('button,a,[role="button"],div,span')).map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!text || !re.test(text)) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 10 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, tag: el.tagName.toLowerCase(), area: r.width * r.height };
    }).filter(Boolean);

    if (!els.length) return null;
    els.sort((a, b) => a.area - b.area);
    return els[0];
  })()`);

  if (!target) return null;
  await clickAt(Input, target.x, target.y);
  return target;
}

async function clickMoreOptions(Runtime, Input) {
  const target = await evalValue(Runtime, `(() => {
    const svg = document.querySelector('svg[aria-label="More options"]');
    const btn = svg ? svg.closest('button,[role="button"],a,div,span') : null;
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, source: 'svg-aria' };
      }
    }

    const els = Array.from(document.querySelectorAll('button,[role="button"],a,div,span')).map((el) => {
      const txt = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      if (!/more options/.test(txt)) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 10 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, source: 'text-fallback', area: r.width * r.height };
    }).filter(Boolean);

    if (!els.length) return null;
    els.sort((a,b) => a.area - b.area);
    return els[0];
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

  console.log('[1/8] Open target post');
  await Page.navigate({ url: POST_URL });
  await waitReady(Runtime, 30000);
  await sleep(1400);

  console.log('[2/8] Open post menu (More options)');
  const more = await clickMoreOptions(Runtime, Input);
  if (!more) throw new Error('More options control not found');
  console.log('More options click:', more);
  await sleep(900);

  console.log('[3/8] Click Edit');
  const editBtn = await clickByText(Runtime, Input, '^edit$', true) || await clickByText(Runtime, Input, '^edit$|edit', false);
  if (!editBtn) throw new Error('Edit action not found in menu');
  console.log('Edit click:', editBtn);
  await sleep(1300);

  console.log('[4/8] Set new caption');
  const setRes = await evalValue(Runtime, `(() => {
    const dialog = document.querySelector('div[role="dialog"]') || document;
    const editable = dialog.querySelector('div[role="textbox"][contenteditable="true"][aria-label*="caption" i]') ||
      dialog.querySelector('div[role="textbox"][contenteditable="true"]') ||
      dialog.querySelector('[contenteditable="true"]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"][aria-label*="caption" i]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]');
    if (editable) {
      const r = editable.getBoundingClientRect();
      editable.focus();
      return { ok: true, mode: 'contenteditable', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    const ta = dialog.querySelector('textarea') || document.querySelector('textarea');
    if (ta) {
      const r = ta.getBoundingClientRect();
      ta.focus();
      return { ok: true, mode: 'textarea', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    return { ok: false, reason: 'caption editor not found' };
  })()`);
  if (!setRes?.ok) throw new Error(setRes?.reason || 'caption not set');
  await clickAt(Input, setRes.x, setRes.y);
  // Select all and clear
  await Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4 });
  await Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
  await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace', code: 'Backspace' });
  await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace', code: 'Backspace' });
  await sleep(120);
  await typeTextHuman(Input, NEW_CAPTION);
  await sleep(250);

  const typedCheck = await evalValue(Runtime, `(() => {
    const dialog = document.querySelector('div[role="dialog"]') || document;
    const editable = dialog.querySelector('div[role="textbox"][contenteditable="true"][aria-label*="caption" i]') ||
      dialog.querySelector('div[role="textbox"][contenteditable="true"]') ||
      dialog.querySelector('[contenteditable="true"]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"][aria-label*="caption" i]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]');
    if (editable) return { mode: 'contenteditable', len: (editable.textContent || '').length, sample: (editable.textContent || '').slice(0, 80) };
    const ta = dialog.querySelector('textarea') || document.querySelector('textarea');
    if (ta) return { mode: 'textarea', len: (ta.value || '').length, sample: (ta.value || '').slice(0, 80) };
    return { mode: 'none', len: 0, sample: '' };
  })()`);
  console.log('Caption typed:', { ...setRes, typedCheck });

  console.log('[5/8] Save edited caption (Done)');
  const done = await clickByText(Runtime, Input, '^done$|^save$', true) || await clickByText(Runtime, Input, '^done$|^save$', false);
  if (!done) throw new Error('Done/Save button not found');
  console.log('Done click:', done);
  await sleep(2200);

  console.log('[6/8] Reload post for verification');
  await Page.navigate({ url: POST_URL });
  await waitReady(Runtime, 30000);
  await sleep(1600);

  console.log('[7/8] Verify updated caption text presence');
  const verify = await evalValue(Runtime, `(() => {
    const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    const low = txt.toLowerCase();
    const h1s = Array.from(document.querySelectorAll('h1')).map(h => (h.innerText || '').trim()).filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      hasUniqueCheck: txt.includes(${JSON.stringify(UNIQUE_CHECK)}),
      hasMcpKeyword: low.includes('mcp'),
      hasDesktopAutomation: low.includes('desktop automation'),
      hasGithub: low.includes('github.com/manushi4/screenhand'),
      headings: h1s.slice(0, 5),
      snippet: txt.slice(0, 1200)
    };
  })()`);

  console.log('[8/8] Done');
  console.log(JSON.stringify({ success: true, post: POST_URL, verify }, null, 2));
} catch (e) {
  console.error('FIX_CAPTION_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
