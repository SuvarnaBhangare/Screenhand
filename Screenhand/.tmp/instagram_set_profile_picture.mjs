import CDP from 'chrome-remote-interface';

const PORT = 9222;
const PROFILE_URL = 'https://www.instagram.com/screenhand_/';
const EDIT_URL = 'https://www.instagram.com/accounts/edit/';
const IMAGE_PATH = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets/screenhand-profile-1080.png';

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

async function clickByText(Runtime, Input, regexSource, withinDialog = false) {
  const target = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const root = ${withinDialog ? "document.querySelector('div[role=\\\"dialog\\\"]') || document" : 'document'};
    const nodes = Array.from(root.querySelectorAll('button,a,[role="button"],div,span')).map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!text || !re.test(text)) return null;
      const r = el.getBoundingClientRect();
      const visible = r.width > 10 && r.height > 10 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, area: r.width * r.height };
    }).filter(Boolean);
    if (!nodes.length) return null;
    nodes.sort((a, b) => a.area - b.area);
    return nodes[0];
  })()`);

  if (!target) return null;
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: target.x, y: target.y });
  await sleep(40);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await sleep(55);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  return target;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, DOM, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  console.log('[1/6] Capture current profile image source');
  await Page.navigate({ url: PROFILE_URL });
  await waitReady(Runtime, 30000);
  await sleep(1400);
  const before = await evalValue(Runtime, `(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height)
    }));
    const profile = imgs.find(i => /profile picture|screenhand_/i.test(i.alt) && i.w >= 80 && i.h >= 80) || imgs.find(i => i.w >= 120 && i.h >= 120) || null;
    return { url: location.href, profileImg: profile, allCount: imgs.length };
  })()`);
  console.log('Before:', JSON.stringify(before, null, 2));

  console.log('[2/6] Open edit profile and upload avatar file');
  await Page.navigate({ url: EDIT_URL });
  await waitReady(Runtime, 30000);
  await sleep(1300);

  const doc = await DOM.getDocument({ depth: -1, pierce: true });
  const filesQuery = await DOM.querySelectorAll({ nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  const fileNodes = filesQuery?.nodeIds || [];
  if (!fileNodes.length) throw new Error('No file input found on edit profile');

  // Try each file input until one triggers photo flow.
  for (const nid of fileNodes) {
    try {
      await DOM.setFileInputFiles({ nodeId: nid, files: [IMAGE_PATH] });
      await sleep(900);
    } catch {}
  }

  console.log('[3/6] Confirm any crop/apply dialog');
  await sleep(1200);
  await clickByText(Runtime, Input, '^apply$|^done$|save photo|crop', true);
  await sleep(1200);

  console.log('[4/6] Wait for update to settle');
  await sleep(3000);

  console.log('[5/6] Verify profile image after upload');
  await Page.navigate({ url: PROFILE_URL });
  await waitReady(Runtime, 30000);
  await sleep(1700);

  const after = await evalValue(Runtime, `(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height)
    }));
    const profile = imgs.find(i => /profile picture|screenhand_/i.test(i.alt) && i.w >= 80 && i.h >= 80) || imgs.find(i => i.w >= 120 && i.h >= 120) || null;
    return { url: location.href, profileImg: profile, allCount: imgs.length };
  })()`);

  const changed = !!(before?.profileImg?.src && after?.profileImg?.src && before.profileImg.src !== after.profileImg.src);

  console.log('[6/6] Done');
  console.log(JSON.stringify({ success: true, image: IMAGE_PATH, before, after, changed }, null, 2));
} catch (e) {
  console.error('SET_PROFILE_PIC_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
