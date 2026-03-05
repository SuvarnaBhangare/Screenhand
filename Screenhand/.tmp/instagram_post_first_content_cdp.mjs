import CDP from 'chrome-remote-interface';

const PORT = 9222;
const IMAGE_PATH = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets/screenhand-first-post-1080x1350.jpg';
const CAPTION = `Launching ScreenHand today.\n\nAI agents should do real desktop work, not just chat.\n\nScreenHand gives AI eyes + hands:\n- See the screen (OCR + UI tree)\n- Click, type, and navigate across apps\n- Automate Chrome + native tools through MCP\n\nBuilt for founders, ops, QA, and growth teams that want repeatable workflows.\n\nOpen source: github.com/manushi4/Screenhand\n\nComment \"demo\" and we will share real workflows.\n\n#ScreenHand #AIAgents #MCP #Automation #DesktopAutomation #BuildInPublic #OpenSource`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(Runtime, expression, timeoutMs = 30000, intervalMs = 300) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await Runtime.evaluate({ expression: `!!(${expression})`, returnByValue: true });
      if (r?.result?.value) return true;
    } catch {}
    await sleep(intervalMs);
  }
  return false;
}

async function evalJSON(Runtime, expression) {
  const res = await Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
  if (res?.exceptionDetails) {
    const msg = res.exceptionDetails?.exception?.description || res.exceptionDetails?.text || 'Runtime evaluation failed';
    throw new Error(msg);
  }
  return res?.result?.value;
}

async function clickAt(Input, x, y) {
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await sleep(40);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function clickElementByText(Runtime, Input, regexSource, withinDialog = false) {
  const expr = `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const root = ${withinDialog ? "document.querySelector('div[role=\\\"dialog\\\"]') || document" : 'document'};
    const nodes = Array.from(root.querySelectorAll('button, a, [role="button"]'));
    const candidates = nodes
      .map((el) => {
        const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
        if (!text || !re.test(text)) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 16 && r.height > 16 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
        if (!visible) return null;
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          text,
          tag: el.tagName.toLowerCase(),
          area: r.width * r.height
        };
      })
      .filter(Boolean);
    candidates.sort((a, b) => {
      const aLong = a.text.length > 120 ? 1 : 0;
      const bLong = b.text.length > 120 ? 1 : 0;
      if (aLong !== bLong) return aLong - bLong;
      return a.area - b.area;
    });
    return candidates[0] || null;
  })()`;

  const target = await evalJSON(Runtime, expr);
  if (!target) return null;
  await clickAt(Input, target.x, target.y);
  return target;
}

async function clickCreateTrigger(Runtime, Input) {
  const expr = `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const svg = document.querySelector('svg[aria-label="New post"]');
    const preferred = svg ? svg.closest('a,button,[role="button"]') : null;
    if (preferred) {
      const r = preferred.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: clean(preferred.textContent) || 'New post', tag: preferred.tagName.toLowerCase(), source: 'svg-aria' };
      }
    }

    const nodes = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const candidates = nodes.map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!/new post|create/i.test(text)) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 12 && r.height > 12 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      const area = r.width * r.height;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, tag: el.tagName.toLowerCase(), area, href: el.getAttribute('href') || null };
    }).filter(Boolean);

    candidates.sort((a, b) => {
      const aNew = /new post/i.test(a.text) ? 0 : 1;
      const bNew = /new post/i.test(b.text) ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const aHref = a.href === '#' ? 0 : 1;
      const bHref = b.href === '#' ? 0 : 1;
      if (aHref !== bHref) return aHref - bHref;
      return a.area - b.area;
    });
    return candidates[0] || null;
  })()`;

  const target = await evalJSON(Runtime, expr);
  if (!target) return null;
  await clickAt(Input, target.x, target.y);
  return target;
}

async function setCaption(Runtime, captionText) {
  const expr = `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const dialog = document.querySelector('div[role="dialog"]') || document;
    const textareas = Array.from(dialog.querySelectorAll('textarea'));

    let field = textareas.find((el) => {
      const m = (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '');
      return /caption/i.test(m);
    }) || textareas[0] || null;

    if (field) {
      field.focus();
      field.value = ${JSON.stringify(captionText)};
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, mode: 'textarea' };
    }

    const edits = Array.from(dialog.querySelectorAll('[contenteditable="true"]'));
    const editable = edits.find((el) => {
      const m = clean(el.getAttribute('aria-label')) + ' ' + clean(el.getAttribute('placeholder')) + ' ' + clean(el.textContent);
      return /caption|write|post/i.test(m);
    }) || edits[0] || null;

    if (!editable) return { ok: false, reason: 'No caption field found' };

    editable.focus();
    editable.textContent = ${JSON.stringify(captionText)};
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, mode: 'contenteditable' };
  })()`;

  return evalJSON(Runtime, expr);
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const igTarget = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || ''));
  const target = igTarget || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome page target found on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, DOM, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  console.log('[1/7] Navigate to Instagram home');
  await Page.navigate({ url: 'https://www.instagram.com/' });
  await waitUntil(Runtime, "document.readyState === 'complete' || document.readyState === 'interactive'", 30000);
  await waitUntil(Runtime, 'document.body && document.body.innerText.length > 120', 30000);
  await sleep(1200);

  console.log('[2/7] Open create/new post composer');
  let create = await clickCreateTrigger(Runtime, Input);
  if (!create) create = await clickElementByText(Runtime, Input, '^new post$|new post|create', false);
  if (!create) throw new Error('Create trigger not found');
  console.log('Create trigger:', create);

  console.log('[3/7] Wait for file input and upload image');
  const hasFileInput = await waitUntil(Runtime, "!!document.querySelector('input[type=\\\"file\\\"]')", 20000);
  if (!hasFileInput) throw new Error('File input did not appear after clicking create');

  const doc = await DOM.getDocument({ depth: -1, pierce: true });
  const fileNode = await DOM.querySelector({ nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  if (!fileNode?.nodeId) throw new Error('Could not locate file input node');
  await DOM.setFileInputFiles({ nodeId: fileNode.nodeId, files: [IMAGE_PATH] });
  await sleep(2200);

  console.log('[4/7] Advance composer (Next steps)');
  for (let i = 0; i < 3; i += 1) {
    const next = await clickElementByText(Runtime, Input, '^next$', true);
    if (!next) break;
    console.log(`Clicked Next (${i + 1})`);
    await sleep(1500);
  }

  console.log('[5/7] Fill caption');
  const cap = await setCaption(Runtime, CAPTION);
  if (!cap?.ok) throw new Error(`Caption not set: ${cap?.reason || 'unknown'}`);
  console.log('Caption mode:', cap.mode);
  await sleep(1000);

  console.log('[6/7] Click Share');
  const share = await clickElementByText(Runtime, Input, '^share$', true);
  if (!share) throw new Error('Share button not found');
  console.log('Share button:', share);

  console.log('[7/7] Wait for post publish state');
  const published = await waitUntil(
    Runtime,
    "(/shared|posted|your post/i.test(document.body.innerText) || !document.querySelector('div[role=\\\"dialog\\\"]'))",
    45000,
    500
  );

  const finalState = await evalJSON(Runtime, `(() => ({
    url: location.href,
    title: document.title,
    hasDialog: !!document.querySelector('div[role="dialog"]'),
    bodySnippet: (document.body?.innerText || '').slice(0, 600)
  }))()`);

  console.log(JSON.stringify({
    success: !!published,
    image: IMAGE_PATH,
    captionLength: CAPTION.length,
    finalState
  }, null, 2));
} catch (err) {
  console.error('INSTAGRAM_POST_FAILED:', err?.message || String(err));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
