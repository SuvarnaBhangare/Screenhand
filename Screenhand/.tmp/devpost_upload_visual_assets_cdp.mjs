import CDP from 'chrome-remote-interface';

const PORT = 9222;
const EDIT_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot/edit';
const PUBLIC_URL = 'https://devpost.com/software/screenhand-ai-desktop-automation-copilot';

const THUMBNAIL = '/Users/khushi/Documents/Automator/Screenhand/.tmp/devpost-assets/screenhand-thumbnail-seo.jpg';
const GALLERY = [
  '/Users/khushi/Documents/Automator/Screenhand/.tmp/devpost-assets/screenhand-gallery-01-architecture.jpg',
  '/Users/khushi/Documents/Automator/Screenhand/.tmp/devpost-assets/screenhand-gallery-02-workflow.jpg',
  '/Users/khushi/Documents/Automator/Screenhand/.tmp/devpost-assets/screenhand-gallery-03-use-cases.jpg'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(Runtime, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const res = await Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (res?.result?.value === 'complete' || res?.result?.value === 'interactive') return true;
    await sleep(250);
  }
  return false;
}

let client;
try {
  const targets = await CDP.List({ port: PORT });
  const page = targets.find((t) => t.type === 'page') || targets[0];
  if (!page) throw new Error('No Chrome page target found on :9222');

  client = await CDP({ port: PORT, target: page.id });
  const { Page, Runtime, DOM } = client;
  await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);

  await Page.navigate({ url: EDIT_URL });
  await waitReady(Runtime, 30000);
  await sleep(1500);

  const doc = await DOM.getDocument({ depth: -1, pierce: true });

  const thumbNode = await DOM.querySelector({ nodeId: doc.root.nodeId, selector: '#software-thumbnail-file-input' });
  if (!thumbNode.nodeId) throw new Error('Thumbnail input not found');
  await DOM.setFileInputFiles({ nodeId: thumbNode.nodeId, files: [THUMBNAIL] });

  const galleryNode = await DOM.querySelector({ nodeId: doc.root.nodeId, selector: '#software_photo_data' });
  if (!galleryNode.nodeId) throw new Error('Gallery input not found');
  await DOM.setFileInputFiles({ nodeId: galleryNode.nodeId, files: GALLERY });

  // Let upload handlers process files.
  await sleep(9000);

  await Runtime.evaluate({
    expression: `(() => {
      const save = document.querySelector('#software-save');
      if (save) save.click();
      return { clickedSave: !!save };
    })()`,
    returnByValue: true,
  });

  await sleep(7000);

  const editState = await Runtime.evaluate({
    expression: `(() => {
      const thumb = document.querySelector('#software-thumbnail-image')?.getAttribute('src') || null;
      const galleryItems = Array.from(document.querySelectorAll('.image-gallery-list li, .image-gallery-list .gallery-item, #image-gallery img'));
      const galleryPreview = galleryItems.map((el) => {
        const img = el.tagName.toLowerCase() === 'img' ? el : el.querySelector('img');
        return img ? (img.getAttribute('src') || null) : null;
      }).filter(Boolean).slice(0, 12);
      const videoUrl = document.querySelector('#software_video_url')?.value || null;
      return {
        url: location.href,
        title: document.title,
        thumbnailSrc: thumb,
        galleryCount: galleryItems.length,
        galleryPreview,
        videoUrl
      };
    })()`,
    returnByValue: true,
  });

  await Page.navigate({ url: PUBLIC_URL });
  await waitReady(Runtime, 30000);
  await sleep(2500);

  const publicState = await Runtime.evaluate({
    expression: `(() => {
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
      const tw = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || null;
      const imgs = Array.from(document.querySelectorAll('img')).map(i => i.getAttribute('src') || '').filter(Boolean);
      const photoImgs = imgs.filter(s => /software|photo|cloudfront|d112y698adiu2z/i.test(s));
      const hasVideoEmbed = !!document.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="loom"], video');
      return {
        url: location.href,
        title: document.title,
        ogImage: og,
        twitterImage: tw,
        imageCount: imgs.length,
        softwareImageCount: photoImgs.length,
        sampleSoftwareImages: photoImgs.slice(0, 10),
        hasVideoEmbed
      };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify({
    thumbnailFile: THUMBNAIL,
    galleryFiles: GALLERY,
    editState: editState?.result?.value,
    publicState: publicState?.result?.value
  }, null, 2));
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
