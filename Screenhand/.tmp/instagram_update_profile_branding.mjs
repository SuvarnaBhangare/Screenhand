import CDP from 'chrome-remote-interface';

const PORT = 9222;
const EDIT_URL = 'https://www.instagram.com/accounts/edit/';
const PROFILE_URL = 'https://www.instagram.com/screenhand_/';
const WEBSITE = 'https://screenhand.com';
const BIO = 'AI agents with eyes + hands on desktop.\nMCP automation for Chrome + native apps.\nOpen source: github.com/manushi4/Screenhand';

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
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome tab available on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  console.log('[1/5] Open edit profile');
  await Page.navigate({ url: EDIT_URL });
  await waitReady(Runtime, 30000);
  await sleep(1400);

  const pre = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const submit = document.querySelector('button[type="submit"], input[type="submit"]') ||
      Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
        .find((el) => /submit|save/i.test(clean(el.textContent || el.value || '')));
    const website = document.querySelector('input[placeholder="Website"]');
    const bio = document.querySelector('textarea#pepBio, textarea[placeholder="Bio"]');
    return {
      url: location.href,
      title: document.title,
      hasWebsite: !!website,
      hasBio: !!bio,
      hasSubmit: !!submit,
      submitTag: submit ? submit.tagName.toLowerCase() : null,
      currentWebsite: website ? website.value : null,
      currentBio: bio ? bio.value : null
    };
  })()`);
  console.log('Pre-check:', JSON.stringify(pre, null, 2));

  if (!pre?.hasWebsite || !pre?.hasBio || !pre?.hasSubmit) {
    throw new Error('Required edit-profile fields not available');
  }

  console.log('[2/5] Set website + bio');
  const setRes = await evalValue(Runtime, `(() => {
    function setField(el, value) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      const setter = desc && desc.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const website = document.querySelector('input[placeholder="Website"]');
    const bio = document.querySelector('textarea#pepBio, textarea[placeholder="Bio"]');
    if (!website || !bio) return { ok: false, reason: 'fields missing' };

    website.focus();
    setField(website, ${JSON.stringify(WEBSITE)});

    bio.focus();
    setField(bio, ${JSON.stringify(BIO)});

    return { ok: true, website: website.value, bio: bio.value };
  })()`);
  console.log('Set result:', JSON.stringify(setRes, null, 2));

  console.log('[3/5] Submit changes');
  const submitPos = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const btn = document.querySelector('button[type="submit"], input[type="submit"]') ||
      Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
        .find((el) => /submit|save/i.test(clean(el.textContent || el.value || '')));
    if (!btn) return { ok:false, reason:'submit missing' };
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    return { ok:true, x:r.left + r.width/2, y:r.top + r.height/2, disabled: !!btn.disabled, text: clean(btn.textContent || btn.value || '') };
  })()`);

  if (!submitPos?.ok) throw new Error(submitPos?.reason || 'submit unavailable');
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: submitPos.x, y: submitPos.y });
  await Input.dispatchMouseEvent({ type: 'mousePressed', x: submitPos.x, y: submitPos.y, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: submitPos.x, y: submitPos.y, button: 'left', clickCount: 1 });
  await sleep(2200);

  const post = await evalValue(Runtime, `(() => {
    const website = document.querySelector('input[placeholder="Website"]');
    const bio = document.querySelector('textarea#pepBio, textarea[placeholder="Bio"]');
    return {
      url: location.href,
      title: document.title,
      website: website ? website.value : null,
      bio: bio ? bio.value : null
    };
  })()`);
  console.log('Post-save fields:', JSON.stringify(post, null, 2));

  console.log('[4/5] Verify on public profile');
  await Page.navigate({ url: PROFILE_URL });
  await waitReady(Runtime, 30000);
  await sleep(1600);

  const verify = await evalValue(Runtime, `(() => {
    const txt = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    const low = txt.toLowerCase();
    return {
      url: location.href,
      title: document.title,
      hasBioLine1: low.includes('ai agents with eyes + hands on desktop'),
      hasBioLine2: low.includes('mcp automation for chrome + native apps'),
      hasGithub: low.includes('github.com/manushi4/screenhand'),
      hasWebsite: low.includes('screenhand.com'),
      hasManuSinghal: low.includes('manu singhal'),
      snippet: txt.slice(0, 1200)
    };
  })()`);

  console.log('[5/5] Done');
  console.log(JSON.stringify({ success: true, website: WEBSITE, bio: BIO, verify }, null, 2));
} catch (e) {
  console.error('PROFILE_BRANDING_UPDATE_FAILED:', e?.message || String(e));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
