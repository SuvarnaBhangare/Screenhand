import CDP from 'chrome-remote-interface';

const PORT = 9222;
const PROFILE_URL = 'https://x.com/screenhand_';
const SETTINGS_URL = 'https://x.com/settings/profile';
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

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /x\.com|twitter\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page');
  if (!target) throw new Error('No Chrome page target on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, DOM, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  console.log('[1/8] Open profile settings page');
  await Page.navigate({ url: SETTINGS_URL });
  await waitReady(Runtime, 30000);
  await sleep(1300);

  const before = await evalValue(Runtime, `(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height)
    }));
    const avatar = imgs.find(i => /profile|avatar|screenhand_/i.test(i.alt) && i.w >= 48 && i.h >= 48) || imgs.find(i => i.w >= 72 && i.h >= 72) || null;
    return { url: location.href, title: document.title, avatar, imgCount: imgs.length };
  })()`);
  console.log('Before:', JSON.stringify(before, null, 2));

  console.log('[2/8] Ensure profile editor is active');
  await sleep(1200);

  console.log('[3/8] Click Add avatar photo');
  const avatarBtn = await evalValue(Runtime, `(() => {
    const btn = document.querySelector('button[aria-label="Add avatar photo"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  })()`);
  if (!avatarBtn) throw new Error('Add avatar photo button not found');

  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: avatarBtn.x, y: avatarBtn.y });
  await sleep(40);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: avatarBtn.x, y: avatarBtn.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: avatarBtn.x, y: avatarBtn.y, button: 'left', clickCount: 1 });
  await sleep(900);

  console.log('[4/8] Find file inputs and set image');
  let fileNodeIds = [];
  for (let i = 0; i < 5; i++) {
    const doc = await DOM.getDocument({ depth: -1, pierce: true });
    const q = await DOM.querySelectorAll({ nodeId: doc.root.nodeId, selector: 'input[type="file"],input[accept*="image"]' });
    fileNodeIds = [...new Set(q?.nodeIds || [])];
    if (fileNodeIds.length) break;
    await sleep(400);
  }
  if (!fileNodeIds.length) throw new Error('No file input found after Add avatar photo click');

  let setCount = 0;
  for (const nodeId of fileNodeIds) {
    try {
      await DOM.setFileInputFiles({ nodeId, files: [IMAGE_PATH] });
      setCount++;
      await sleep(500);
    } catch {}
  }
  if (!setCount) throw new Error('Failed to set files on discovered inputs');

  console.log('[5/8] Confirm crop/apply if present');
  await evalValue(Runtime, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],a'));
    const btn = candidates.find((n)=>/^(apply|done|save)$/i.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||''));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await sleep(1200);

  console.log('[6/8] Save profile modal');
  const saved = await evalValue(Runtime, `(() => {
    const save = document.querySelector('[data-testid="Profile_Save_Button"]');
    if (save) { save.click(); return true; }
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const alt = Array.from(document.querySelectorAll('button,[role="button"],a')).find((n)=>/^save$/i.test(clean(n.textContent)||clean(n.getAttribute('aria-label'))||''));
    if (alt) { alt.click(); return true; }
    return false;
  })()`);
  if (!saved) throw new Error('Save button not found in profile modal');
  await sleep(2600);

  console.log('[7/8] Re-open profile and verify');
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
    const avatar = imgs.find(i => /profile|avatar|screenhand_/i.test(i.alt) && i.w >= 48 && i.h >= 48) || imgs.find(i => i.w >= 72 && i.h >= 72) || null;
    return { url: location.href, title: document.title, avatar, imgCount: imgs.length };
  })()`);

  const changed = !!(before?.avatar?.src && after?.avatar?.src && before.avatar.src !== after.avatar.src);

  console.log('[8/8] Done');
  console.log(JSON.stringify({ success: true, image: IMAGE_PATH, before, after, changed, fileInputsUsed: setCount }, null, 2));
} catch (e) {
  console.error('X_SET_AVATAR_FILEINPUT_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
