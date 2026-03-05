import CDP from 'chrome-remote-interface';

const PORT = 9222;
const PROFILE_URL = 'https://x.com/screenhand_';
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
      const visible = r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text, area: r.width * r.height };
    }).filter(Boolean);
    if (!nodes.length) return null;
    nodes.sort((a, b) => a.area - b.area);
    return nodes[0];
  })()`);

  if (!target) return null;
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: target.x, y: target.y });
  await sleep(35);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  return target;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /x\.com|twitter\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page');
  if (!target) throw new Error('No Chrome page target on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, DOM, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  console.log('[1/7] Open profile page');
  await Page.navigate({ url: PROFILE_URL });
  await waitReady(Runtime, 30000);
  await sleep(1200);

  const before = await evalValue(Runtime, `(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height)
    }));
    const profile = imgs.find(i => /screenhand_|profile|avatar/i.test(i.alt) && i.w >= 48 && i.h >= 48) || imgs.find(i => i.w >= 72 && i.h >= 72) || null;
    return { url: location.href, title: document.title, profileImg: profile, imgCount: imgs.length };
  })()`);
  console.log('Before:', JSON.stringify(before, null, 2));

  console.log('[2/7] Open Edit profile');
  let edit = await clickByText(Runtime, Input, '^edit profile$');
  if (!edit) {
    // fallback: click the profile menu button by aria if text click fails
    edit = await clickByText(Runtime, Input, 'edit');
  }
  if (!edit) throw new Error('Edit profile button not found in DOM');
  await sleep(1200);

  console.log('[3/7] Find file inputs in edit modal/page');
  const doc = await DOM.getDocument({ depth: -1, pierce: true });
  let fileNodes = [];
  for (const sel of ['input[type="file"]', 'input[accept*="image"]']) {
    const q = await DOM.querySelectorAll({ nodeId: doc.root.nodeId, selector: sel });
    if (q?.nodeIds?.length) fileNodes.push(...q.nodeIds);
  }
  fileNodes = [...new Set(fileNodes)];
  if (!fileNodes.length) {
    // Sometimes file input appears only after clicking avatar/photo controls
    await clickByText(Runtime, Input, 'edit photo|add photo|profile photo|avatar', true);
    await sleep(900);
    const doc2 = await DOM.getDocument({ depth: -1, pierce: true });
    const q2 = await DOM.querySelectorAll({ nodeId: doc2.root.nodeId, selector: 'input[type="file"],input[accept*="image"]' });
    fileNodes = [...new Set(q2?.nodeIds || [])];
  }
  if (!fileNodes.length) throw new Error('No file input found after opening edit profile');
  console.log('fileInputs:', fileNodes.length);

  console.log('[4/7] Set image file on file input');
  let applied = 0;
  for (const nid of fileNodes) {
    try {
      await DOM.setFileInputFiles({ nodeId: nid, files: [IMAGE_PATH] });
      applied++;
      await sleep(700);
    } catch (e) {
      // continue
    }
  }
  if (!applied) throw new Error('Failed to apply image to any file input');

  console.log('[5/7] Confirm crop/apply + save');
  await clickByText(Runtime, Input, '^apply$|^done$|save|crop|next', true);
  await sleep(1000);
  await clickByText(Runtime, Input, '^save$');
  await sleep(2200);

  console.log('[6/7] Re-open profile and verify');
  await Page.navigate({ url: PROFILE_URL });
  await waitReady(Runtime, 30000);
  await sleep(1500);

  const after = await evalValue(Runtime, `(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height)
    }));
    const profile = imgs.find(i => /screenhand_|profile|avatar/i.test(i.alt) && i.w >= 48 && i.h >= 48) || imgs.find(i => i.w >= 72 && i.h >= 72) || null;
    return { url: location.href, title: document.title, profileImg: profile, imgCount: imgs.length };
  })()`);

  const changed = !!(before?.profileImg?.src && after?.profileImg?.src && before.profileImg.src !== after.profileImg.src);

  console.log('[7/7] Done');
  console.log(JSON.stringify({ success: true, image: IMAGE_PATH, before, after, changed, fileInputsUsed: applied }, null, 2));
} catch (e) {
  console.error('X_SET_PROFILE_PIC_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
