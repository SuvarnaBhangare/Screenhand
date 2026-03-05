import CDP from 'chrome-remote-interface';

const PORT = 9222;
const OWN_HANDLE = 'screenhand_';
const HOME_URL = 'https://www.instagram.com/';

const MAX_POST_INTERACTIONS = 5;
const MAX_COMMENTS = 3;
const MAX_DMS = 3;

const DM_MESSAGE = [
  'Hey! I\'m Codex helping @screenhand_ with Instagram growth using desktop automation workflows.',
  'We\'re building ScreenHand: AI agents that can see, click, type and automate desktop tasks via MCP.',
  'Loved your content in AI/automation. Open to feedback or a quick collab idea?'
].join('\n\n');

const COMMENT_TEMPLATES = [
  'Codex here helping @screenhand_ with growth automation. Great post.',
  'I\'m Codex, testing ScreenHand outreach workflows. This is solid content.',
  'Codex from @screenhand_ here. We\'re building AI desktop automation via MCP. Nice post.'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

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
  await sleep(rand(30, 60));
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(rand(45, 75));
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function keyTap(Input, key, code, modifiers = 0) {
  await Input.dispatchKeyEvent({ type: 'keyDown', key, code, modifiers });
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code, modifiers });
}

async function typeHuman(Input, text) {
  for (const ch of text) {
    if (ch === '\n') {
      await keyTap(Input, 'Enter', 'Enter');
      await sleep(rand(16, 28));
      continue;
    }
    await Input.dispatchKeyEvent({ type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await Input.dispatchKeyEvent({ type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
    await sleep(rand(10, 22));
  }
}

async function clickBySelector(Runtime, Input, selector) {
  const target = await evalValue(Runtime, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!target) return false;
  await clickAt(Input, target.x, target.y);
  return true;
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

async function scrollFeed(Runtime) {
  await evalValue(Runtime, `(() => { window.scrollBy({ top: ${rand(480, 940)}, left: 0, behavior: 'smooth' }); return true; })()`);
  await sleep(rand(850, 1400));
}

async function getVisiblePostLinks(Runtime) {
  return evalValue(Runtime, `(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/p/"]')).map(a => a.href || a.getAttribute('href') || '').filter(Boolean);
    const uniq = Array.from(new Set(links.map((u) => u.startsWith('http') ? u : location.origin + u)));
    return uniq.slice(0, 24);
  })()`);
}

async function extractPostOwner(Runtime) {
  return evalValue(Runtime, `(() => {
    const bad = new Set(['accounts','about','api','blog','challenge','developer','explore','legal','locations','reels','direct','p','stories','tv']);
    const isUsername = (u) => /^[a-z0-9._]+$/i.test(u) && !bad.has((u || '').toLowerCase());
    const fromHref = (href) => {
      if (!href) return null;
      const clean = String(href).split('?')[0].split('#')[0];
      if (!clean.startsWith('/')) return null;
      const parts = clean.split('/').filter(Boolean);
      if (parts.length !== 1) return null;
      const u = parts[0];
      return isUsername(u) ? u : null;
    };

    const primarySelectors = [
      'article header a[href^="/"]',
      'main article header a[href^="/"]',
      'header a[href^="/"][role="link"]',
      'main a[href^="/"][role="link"]'
    ];
    for (const sel of primarySelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const u = fromHref(el.getAttribute('href'));
        if (u) return u;
      }
    }

    const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
    const m = tw.match(/^\\s*([^:]+?)\\s+on Instagram/i);
    if (m && isUsername(m[1].trim())) return m[1].trim();

    const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const el of ld) {
      try {
        const raw = JSON.parse(el.textContent || '{}');
        const authors = Array.isArray(raw) ? raw.map(x => x?.author).flat() : [raw?.author];
        for (const a of authors) {
          const alt = String(a?.alternateName || '').replace(/^@/, '').trim();
          if (isUsername(alt)) return alt;
          const name = String(a?.name || '').replace(/^@/, '').trim();
          if (isUsername(name)) return name;
        }
      } catch {}
    }

    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '').filter(Boolean);
    for (const h of links) {
      const u = fromHref(h);
      if (u) return u;
    }
    return null;
  })()`);
}

async function likeCurrentPost(Runtime, Input) {
  const liked = await evalValue(Runtime, `(() => !!document.querySelector('svg[aria-label="Unlike"], [aria-label="Unlike"]'))()`);
  if (liked) return { acted: false, reason: 'already-liked' };
  const clicked = await clickBySelector(Runtime, Input, 'svg[aria-label="Like"], [aria-label="Like"]');
  return clicked ? { acted: true } : { acted: false, reason: 'like-missing' };
}

async function shareReact(Runtime, Input) {
  const clicked = await clickBySelector(Runtime, Input, 'svg[aria-label="Share"], [aria-label="Share"], [aria-label="Send"]');
  if (!clicked) return { acted: false, reason: 'share-missing' };
  await sleep(rand(420, 760));
  await keyTap(Input, 'Escape', 'Escape');
  return { acted: true };
}

async function commentCurrentPost(Runtime, Input, textComment) {
  const open = await clickBySelector(Runtime, Input, 'svg[aria-label="Comment"], [aria-label="Comment"]');
  if (!open) return { acted: false, reason: 'comment-button-missing' };
  await sleep(rand(600, 1000));

  const editor = await evalValue(Runtime, `(() => {
    const textareas = Array.from(document.querySelectorAll('textarea'));
    const ta = textareas.find((el) => {
      const m = ((el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '')).toLowerCase();
      return m.includes('comment');
    }) || textareas[0] || null;
    if (ta) {
      const r = ta.getBoundingClientRect();
      return { mode: 'textarea', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  })()`);

  if (!editor) return { acted: false, reason: 'comment-editor-missing' };

  await clickAt(Input, editor.x, editor.y);
  await sleep(120);
  await typeHuman(Input, textComment);
  await sleep(120);
  const postBtn = await clickByText(Runtime, Input, '^post$|^publish$');
  if (!postBtn) await keyTap(Input, 'Enter', 'Enter');
  await sleep(rand(900, 1400));
  return { acted: true };
}

async function sendDm(Runtime, Input, username) {
  await evalValue(Runtime, `(() => { location.href = 'https://www.instagram.com/${username}/'; return true; })()`);
  await sleep(rand(1600, 2400));

  const profileMessage = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const inHeader = Array.from(document.querySelectorAll('main header button, main section header button, main header a[role="button"], main section header a[role="button"], main header [role="button"], main section header [role="button"]'));
    const cands = inHeader.map((el) => {
      const text = clean(el.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title'));
      if (!/^message$/i.test(text)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, area: r.width * r.height, text };
    }).filter(Boolean);
    if (cands.length) {
      cands.sort((a,b) => b.area - a.area);
      return cands[0];
    }
    return null;
  })()`);

  let msg = null;
  if (profileMessage) {
    await clickAt(Input, profileMessage.x, profileMessage.y);
    msg = profileMessage;
  } else {
    msg = await clickByText(Runtime, Input, '^message$');
  }
  if (!msg) return { sent: false, reason: 'message-button-missing' };
  await sleep(rand(2000, 2600));

  const findComposer = () => evalValue(Runtime, `(() => {
    const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], textarea[placeholder*="message"], textarea');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  let composer = await findComposer();
  if (!composer) {
    await sleep(rand(700, 1100));
    composer = await findComposer();
  }
  if (!composer) {
    const ex = await clickBySelector(Runtime, Input, '[aria-label="Expand"], [title="Expand"]') || await clickByText(Runtime, Input, '^expand$');
    if (ex) {
      await sleep(rand(1400, 1900));
      composer = await findComposer();
    }
  }
  if (!composer) return { sent: false, reason: 'composer-missing' };

  await clickAt(Input, composer.x, composer.y);
  await sleep(120);
  await typeHuman(Input, DM_MESSAGE);
  await sleep(150);
  const sentBtn = await clickByText(Runtime, Input, '^send$');
  if (!sentBtn) await keyTap(Input, 'Enter', 'Enter');
  await sleep(rand(900, 1400));
  return { sent: true };
}

async function sendDmViaDirectNew(Page, Runtime, Input, username) {
  await Page.navigate({ url: 'https://www.instagram.com/direct/inbox/' });
  await waitReady(Runtime, 30000);
  await sleep(rand(1200, 1800));

  await clickByText(Runtime, Input, '^new message$|^message$');
  await sleep(rand(700, 1200));

  const searchInput = await evalValue(Runtime, `(() => {
    const selectors = [
      'input[name="searchInput"]',
      'input[name="queryBox"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="Search"]',
      'input[type="text"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 12) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  })()`);

  if (!searchInput) return { sent: false, reason: 'direct-search-missing' };

  await clickAt(Input, searchInput.x, searchInput.y);
  await sleep(120);
  await keyTap(Input, 'a', 'KeyA', 4);
  await sleep(70);
  await keyTap(Input, 'Backspace', 'Backspace');
  await sleep(90);
  await typeHuman(Input, username);
  await sleep(rand(900, 1400));

  const userPick = await evalValue(Runtime, `(() => {
    const needle = ${JSON.stringify(username.toLowerCase())};
    const box = document.querySelector('input[type="checkbox"]');
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, mode: 'checkbox' };
      }
    }
    const nodes = Array.from(document.querySelectorAll('div[role="button"],button,label,li,div')).map((el) => {
      const t = (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (!t || !t.includes(needle)) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 12) return null;
      const visible = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!visible) return null;
      return { x: r.left + 18, y: r.top + r.height / 2, text: t, area: r.width * r.height };
    }).filter(Boolean);
    if (!nodes.length) return null;
    nodes.sort((a, b) => a.area - b.area);
    return nodes[0];
  })()`);

  if (!userPick) return { sent: false, reason: 'direct-recipient-missing' };
  await clickAt(Input, userPick.x, userPick.y);
  await sleep(rand(400, 700));

  const nextBtn = await clickByText(Runtime, Input, '^chat$|^next$|^continue$');
  if (!nextBtn) return { sent: false, reason: 'direct-next-missing' };
  await sleep(rand(1200, 1800));

  const composer = await evalValue(Runtime, `(() => {
    const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], div[contenteditable="true"][aria-label*="Message"], textarea[placeholder*="message"], textarea');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  if (!composer) return { sent: false, reason: 'direct-composer-missing' };

  await clickAt(Input, composer.x, composer.y);
  await sleep(120);
  await typeHuman(Input, DM_MESSAGE);
  await sleep(180);
  await keyTap(Input, 'Enter', 'Enter');
  await sleep(rand(900, 1400));
  return { sent: true };
}

let client;
const report = {
  startedAt: new Date().toISOString(),
  source: 'homefeed',
  harvestedPostUrls: [],
  harvestedUsernames: [],
  actions: { scrolled: 0, liked: 0, commented: 0, shared: 0, dmsSent: 0 },
  commentLogs: [],
  dmLogs: [],
  errors: []
};

try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  await Page.navigate({ url: HOME_URL });
  await waitReady(Runtime, 30000);
  await sleep(1600);

  const postQueue = [];
  for (let i = 0; i < 5 && postQueue.length < MAX_POST_INTERACTIONS; i += 1) {
    const links = await getVisiblePostLinks(Runtime);
    for (const l of links || []) {
      if (!postQueue.includes(l)) postQueue.push(l);
      if (postQueue.length >= MAX_POST_INTERACTIONS) break;
    }
    await scrollFeed(Runtime);
    report.actions.scrolled += 1;
  }

  report.harvestedPostUrls = [...postQueue];

  for (let i = 0; i < postQueue.length; i += 1) {
    const postUrl = postQueue[i];
    try {
      await Page.navigate({ url: postUrl });
      await waitReady(Runtime, 30000);
      await sleep(rand(900, 1500));

      const likeRes = await likeCurrentPost(Runtime, Input);
      if (likeRes.acted) report.actions.liked += 1;

      if (report.actions.commented < MAX_COMMENTS) {
        const comment = COMMENT_TEMPLATES[report.actions.commented % COMMENT_TEMPLATES.length];
        const cRes = await commentCurrentPost(Runtime, Input, comment);
        if (cRes.acted) {
          report.actions.commented += 1;
          report.commentLogs.push({ postUrl, comment, status: 'sent' });
        } else {
          report.commentLogs.push({ postUrl, comment, status: 'skipped', reason: cRes.reason });
        }
      }

      const shareRes = await shareReact(Runtime, Input);
      if (shareRes.acted) report.actions.shared += 1;

      const owner = await extractPostOwner(Runtime);
      if (owner && owner !== OWN_HANDLE && !report.harvestedUsernames.includes(owner)) {
        report.harvestedUsernames.push(owner);
      }

      await sleep(rand(400, 900));
    } catch (err) {
      report.errors.push({ step: 'post', postUrl, error: err?.message || String(err) });
    }
  }

  for (const username of report.harvestedUsernames) {
    if (report.actions.dmsSent >= MAX_DMS) break;
    try {
      const dmRes = await sendDm(Runtime, Input, username);
      if (dmRes.sent) {
        report.actions.dmsSent += 1;
        report.dmLogs.push({ username, status: 'sent' });
      } else {
        const fallback = await sendDmViaDirectNew(Page, Runtime, Input, username);
        if (fallback.sent) {
          report.actions.dmsSent += 1;
          report.dmLogs.push({ username, status: 'sent', mode: 'direct-new' });
        } else {
          report.dmLogs.push({
            username,
            status: 'skipped',
            reason: dmRes.reason,
            fallbackReason: fallback.reason
          });
        }
      }
    } catch (err) {
      report.dmLogs.push({ username, status: 'error', reason: err?.message || String(err) });
    }
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  report.errors.push({ step: 'fatal', error: err?.message || String(err) });
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
