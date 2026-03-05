import CDP from 'chrome-remote-interface';

const PORT = 9222;
const OWN_HANDLE = 'screenhand_';
const HASHTAG_URLS = [
  'https://www.instagram.com/explore/tags/automation/',
  'https://www.instagram.com/explore/tags/aitools/',
  'https://www.instagram.com/explore/tags/buildinpublic/'
];

const MAX_POST_INTERACTIONS = 6;
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
  await sleep(rand(35, 65));
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(rand(45, 80));
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
      await sleep(rand(16, 30));
      continue;
    }
    await Input.dispatchKeyEvent({ type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await Input.dispatchKeyEvent({ type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
    await sleep(rand(10, 24));
  }
}

async function clickBySelector(Runtime, Input, selector, rootDialogOnly = false) {
  const target = await evalValue(Runtime, `(() => {
    const root = ${rootDialogOnly ? "document.querySelector('div[role=\\\"dialog\\\"]') || document" : 'document'};
    const el = root.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const visible = r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    if (!visible) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!target) return false;
  await clickAt(Input, target.x, target.y);
  return true;
}

async function clickByText(Runtime, Input, regexSource, rootDialogOnly = false) {
  const target = await evalValue(Runtime, `(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const root = ${rootDialogOnly ? "document.querySelector('div[role=\\\"dialog\\\"]') || document" : 'document'};
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
  await clickAt(Input, target.x, target.y);
  return target;
}

async function scrollFeed(Runtime) {
  await evalValue(Runtime, `(() => { window.scrollBy({ top: ${rand(420, 860)}, left: 0, behavior: 'smooth' }); return true; })()`);
  await sleep(rand(700, 1300));
}

async function getPostLinksOnPage(Runtime, limit = 8) {
  return evalValue(Runtime, `(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/p/"]')).map(a => a.href || a.getAttribute('href') || '').filter(Boolean);
    const uniq = Array.from(new Set(links.map((u) => u.startsWith('http') ? u : (location.origin + u))));
    return uniq.slice(0, ${limit});
  })()`);
}

async function extractPostOwner(Runtime) {
  return evalValue(Runtime, `(() => {
    const bad = new Set(['accounts','explore','reels','direct','p','stories','tv']);
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '').filter(Boolean);
    for (const h of links) {
      if (!h.startsWith('/')) continue;
      const parts = h.split('/').filter(Boolean);
      if (parts.length !== 1) continue;
      const u = parts[0].toLowerCase();
      if (bad.has(u)) continue;
      if (/^[a-z0-9._]+$/.test(u)) return u;
    }
    return null;
  })()`);
}

async function likeCurrentPost(Runtime, Input) {
  const likedAlready = await evalValue(Runtime, `(() => !!document.querySelector('svg[aria-label="Unlike"], [aria-label="Unlike"]'))()`);
  if (likedAlready) return { acted: false, reason: 'already-liked' };
  const clicked = await clickBySelector(Runtime, Input, 'svg[aria-label="Like"], [aria-label="Like"]');
  return clicked ? { acted: true } : { acted: false, reason: 'like-button-missing' };
}

async function shareReact(Runtime, Input) {
  const clicked = await clickBySelector(Runtime, Input, 'svg[aria-label="Share"], [aria-label="Share"], [aria-label="Send"]');
  if (!clicked) return { acted: false, reason: 'share-missing' };
  await sleep(rand(450, 900));
  await keyTap(Input, 'Escape', 'Escape');
  return { acted: true };
}

async function commentCurrentPost(Runtime, Input, textComment) {
  const opened = await clickBySelector(Runtime, Input, 'svg[aria-label="Comment"], [aria-label="Comment"]');
  if (!opened) return { acted: false, reason: 'comment-button-missing' };

  await sleep(rand(600, 1100));

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

    const editable = Array.from(document.querySelectorAll('[contenteditable="true"], div[role="textbox"]')).find((el) => {
      const m = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      return m.includes('comment') || m.includes('reply');
    }) || null;

    if (editable) {
      const r = editable.getBoundingClientRect();
      return { mode: 'contenteditable', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    return null;
  })()`);

  if (!editor) return { acted: false, reason: 'comment-editor-missing' };

  await clickAt(Input, editor.x, editor.y);
  await sleep(160);
  await typeHuman(Input, textComment);
  await sleep(180);

  const postBtn = await clickByText(Runtime, Input, '^post$|^publish$', false);
  if (!postBtn) {
    await keyTap(Input, 'Enter', 'Enter');
  }

  await sleep(rand(900, 1500));
  return { acted: true };
}

async function trySendDm(Runtime, Input, username) {
  await evalValue(Runtime, `(() => { location.href = 'https://www.instagram.com/${username}/'; return true; })()`);
  await sleep(rand(1400, 2100));

  const msgBtn = await clickByText(Runtime, Input, '^message$');
  if (!msgBtn) return { sent: false, reason: 'message-button-missing' };

  await sleep(rand(1100, 1700));

  const composer = await evalValue(Runtime, `(() => {
    const box = document.querySelector('div[contenteditable="true"][role="textbox"], div[role="textbox"][contenteditable="true"], textarea[placeholder*="message" i], textarea');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  if (!composer) return { sent: false, reason: 'composer-missing' };

  await clickAt(Input, composer.x, composer.y);
  await sleep(130);
  await typeHuman(Input, DM_MESSAGE);
  await sleep(140);
  await keyTap(Input, 'Enter', 'Enter');
  await sleep(rand(800, 1400));

  return { sent: true };
}

let client;
const report = {
  startedAt: new Date().toISOString(),
  hashtagsVisited: [],
  harvestedPostUrls: [],
  harvestedUsernames: [],
  actions: {
    scrolled: 0,
    liked: 0,
    commented: 0,
    shared: 0,
    dmsSent: 0
  },
  commentLogs: [],
  dmLogs: [],
  errors: []
};

try {
  const targets = await CDP.List({ port: PORT });
  const target = targets.find((t) => t.type === 'page' && /instagram\.com/i.test(t.url || '')) || targets.find((t) => t.type === 'page') || targets[0];
  if (!target) throw new Error('No Chrome target on :9222');

  client = await CDP({ port: PORT, target: target.id });
  const { Page, Runtime, Input } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  const postQueue = [];

  for (const tagUrl of HASHTAG_URLS) {
    if (postQueue.length >= MAX_POST_INTERACTIONS) break;

    report.hashtagsVisited.push(tagUrl);
    await Page.navigate({ url: tagUrl });
    await waitReady(Runtime, 30000);
    await sleep(rand(1000, 1800));

    await scrollFeed(Runtime);
    report.actions.scrolled += 1;

    const links = await getPostLinksOnPage(Runtime, 8);
    for (const l of links || []) {
      if (postQueue.length >= MAX_POST_INTERACTIONS) break;
      if (!postQueue.includes(l)) postQueue.push(l);
    }
  }

  report.harvestedPostUrls = [...postQueue];

  for (let i = 0; i < postQueue.length; i += 1) {
    const postUrl = postQueue[i];
    try {
      await Page.navigate({ url: postUrl });
      await waitReady(Runtime, 30000);
      await sleep(rand(900, 1700));

      await scrollFeed(Runtime);
      report.actions.scrolled += 1;

      const likeRes = await likeCurrentPost(Runtime, Input);
      if (likeRes.acted) report.actions.liked += 1;
      await sleep(rand(300, 700));

      if (report.actions.commented < MAX_COMMENTS) {
        const commentText = COMMENT_TEMPLATES[report.actions.commented % COMMENT_TEMPLATES.length];
        const cRes = await commentCurrentPost(Runtime, Input, commentText);
        if (cRes.acted) {
          report.actions.commented += 1;
          report.commentLogs.push({ postUrl, comment: commentText, status: 'sent' });
        } else {
          report.commentLogs.push({ postUrl, comment: commentText, status: 'skipped', reason: cRes.reason });
        }
      }

      const shareRes = await shareReact(Runtime, Input);
      if (shareRes.acted) report.actions.shared += 1;

      const owner = await extractPostOwner(Runtime);
      if (owner && owner !== OWN_HANDLE && !report.harvestedUsernames.includes(owner)) {
        report.harvestedUsernames.push(owner);
      }
    } catch (err) {
      report.errors.push({ step: 'post-interaction', postUrl, error: err?.message || String(err) });
    }
  }

  for (const username of report.harvestedUsernames) {
    if (report.actions.dmsSent >= MAX_DMS) break;
    try {
      const dm = await trySendDm(Runtime, Input, username);
      if (dm.sent) {
        report.actions.dmsSent += 1;
        report.dmLogs.push({ username, status: 'sent' });
      } else {
        report.dmLogs.push({ username, status: 'skipped', reason: dm.reason });
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
