import CDP from 'chrome-remote-interface';

const PORT = 9222;
const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const PUBLIC_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot';
const IMAGE_PATH = '/Users/khushi/Documents/Automator/Screenhand/.tmp/screenhand-devpost-cover.jpg';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitReady(Runtime, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (r?.result?.value === 'complete' || r?.result?.value === 'interactive') return true;
    await sleep(250);
  }
  return false;
}

async function getText(Runtime, expression) {
  const r = await Runtime.evaluate({ expression, returnByValue: true });
  return r?.result?.value;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const page = targets.find(t => t.type === 'page') || targets[0];
  if (!page) throw new Error('No Chrome target found on :9222');

  client = await CDP({ port: PORT, target: page.id });
  const { Page, Runtime, DOM } = client;

  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  await Page.navigate({ url: EDIT_URL });
  await waitReady(Runtime, 25000);

  // Ensure target elements are available
  await Runtime.evaluate({ expression: `(() => {
    const input = document.querySelector('#software-thumbnail-file-input');
    const btn = document.querySelector('#software-thumbnail-button');
    const save = document.querySelector('#software-save');
    return {
      url: location.href,
      hasInput: !!input,
      hasButton: !!btn,
      hasSave: !!save,
      currentThumb: document.querySelector('#software-thumbnail-image')?.getAttribute('src') || null
    };
  })()`, returnByValue: true });

  const doc = await DOM.getDocument({ depth: -1, pierce: true });
  const q = await DOM.querySelector({ nodeId: doc.root.nodeId, selector: '#software-thumbnail-file-input' });
  if (!q.nodeId || q.nodeId === 0) throw new Error('thumbnail file input not found');

  await DOM.setFileInputFiles({ nodeId: q.nodeId, files: [IMAGE_PATH] });

  // Wait for frontend handlers to process selected file and render preview.
  await sleep(3000);

  await Runtime.evaluate({ expression: `(() => {
    const save = document.querySelector('#software-save');
    if (save) save.click();
    return { clicked: !!save };
  })()`, returnByValue: true });

  await sleep(3500);

  const editState = await Runtime.evaluate({ expression: `(() => {
    const thumb = document.querySelector('#software-thumbnail-image');
    const src = thumb?.getAttribute('src') || null;
    const isPlaceholder = !!src && /thumbnail-placeholder/i.test(src);
    return {
      url: location.href,
      title: document.title,
      thumbnailSrc: src,
      isPlaceholder
    };
  })()`, returnByValue: true });

  await Page.navigate({ url: PUBLIC_URL });
  await waitReady(Runtime, 25000);
  await sleep(1200);

  const publicState = await Runtime.evaluate({ expression: `(() => {
    const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
    const tw = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || null;
    const body = (document.body?.innerText || '').replace(/\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      ogImage: og,
      twitterImage: tw,
      hasStory: /Inspiration|What it does|How we built it/i.test(body)
    };
  })()`, returnByValue: true });

  console.log(JSON.stringify({
    editState: editState.result.value,
    publicState: publicState.result.value
  }, null, 2));
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
