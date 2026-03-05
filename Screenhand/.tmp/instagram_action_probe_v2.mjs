import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_action_probe_v2.json';
const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name: 'ig-action-probe-v2', version: '1.0.0' }, { capabilities: {} });
const text = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseTabs = (t) => t.split('\n').map((l)=>{const m=l.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/); return m?{id:m[1],url:m[3]}:null;}).filter(Boolean);

async function js(tabId, code) {
  const raw = text(await client.callTool({ name:'browser_js', arguments:{ tabId, code }}));
  return parse(raw) ?? { raw };
}

const result = { generatedAt: new Date().toISOString() };

try {
  await client.connect(transport);
  const tabs = parseTabs(text(await client.callTool({ name:'browser_tabs', arguments:{} })));
  const ig = tabs.find(t => /instagram\.com/.test(t.url));
  if(!ig) throw new Error('No instagram tab');
  const tabId = ig.id;

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/' }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 80', timeoutMs:12000 }});

  result.home = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    const byText = Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => /new post|create/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
    const commentTargets = Array.from(document.querySelectorAll('[aria-label="Comment"], svg[aria-label="Comment"]'));
    return {
      url: location.href,
      createByHref: !!document.querySelector('a[href="/create/"]'),
      createByText: !!byText,
      createByTextTag: byText ? byText.tagName.toLowerCase() : null,
      createByTextAria: byText ? byText.getAttribute('aria-label') : null,
      commentTargets: commentTargets.length,
      likeTargets: document.querySelectorAll('[aria-label="Like"], svg[aria-label="Like"]').length,
      shareTargets: document.querySelectorAll('[aria-label="Share"], [aria-label="Send"], svg[aria-label="Share"]').length,
      saveTargets: document.querySelectorAll('[aria-label="Save"], svg[aria-label="Save"]').length,
      followTextButtons: Array.from(document.querySelectorAll('button,[role="button"]')).filter(el=>/^follow$/i.test(clean(el.textContent)||'')).length
    };
  })()`);

  try {
    result.commentClick = text(await client.callTool({ name:'browser_click', arguments:{ tabId, selector:'[aria-label="Comment"], svg[aria-label="Comment"]' }}));
    await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.querySelector("textarea[aria-label*=\\"comment\\" i], textarea[placeholder*=\\"comment\\" i], form textarea")', timeoutMs:6000 }});
  } catch (e) {
    result.commentClickError = String(e?.message || e);
  }

  result.commentComposer = await js(tabId, `(() => ({
    url: location.href,
    commentInputCount: document.querySelectorAll('textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], form textarea').length,
    commentInputs: Array.from(document.querySelectorAll('textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], form textarea')).slice(0,6).map(el => ({
      id: el.id || null,
      name: el.name || null,
      aria: el.getAttribute('aria-label') || null,
      placeholder: el.placeholder || null
    }))
  }))()`);

  await client.callTool({ name:'browser_navigate', arguments:{ tabId, url:'https://www.instagram.com/reels/' }});
  await client.callTool({ name:'browser_wait', arguments:{ tabId, condition:'document.body && document.body.innerText.length > 80', timeoutMs:12000 }});

  result.reels = await js(tabId, `(() => {
    const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
    return {
      url: location.href,
      like: document.querySelectorAll('[aria-label="Like"], svg[aria-label="Like"]').length,
      comment: document.querySelectorAll('[aria-label="Comment"], svg[aria-label="Comment"]').length,
      share: document.querySelectorAll('[aria-label="Share"], [aria-label="Send"], svg[aria-label="Share"]').length,
      save: document.querySelectorAll('[aria-label="Save"], svg[aria-label="Save"]').length,
      followButtons: Array.from(document.querySelectorAll('button,[role="button"]')).filter(el=>/^follow$/i.test(clean(el.textContent)||'')).length
    };
  })()`);

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`Saved: ${OUT}`);
} catch (e) {
  console.error('ACTION_PROBE_FAILED', String(e?.message || e));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
