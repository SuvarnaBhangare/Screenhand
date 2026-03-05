import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const OUT = '/Users/khushi/Documents/Automator/Screenhand/.tmp/x_normal_functions_smoke_test_report.json';
const DRAFT_REPLY = 'ScreenHand smoke test draft reply (not sent).';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-normal-functions-smoke-test', version: '1.0.0' }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(r);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTabs(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
    return m ? { id: m[1], title: m[2], url: m[3], raw: line } : null;
  }).filter(Boolean);
}

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res), raw: res };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

const report = {
  startedAt: new Date().toISOString(),
  mode: 'safe-smoke-test',
  notes: [
    'No DM sent',
    'No reply submitted',
    'Like/bookmark toggled back when possible'
  ],
  steps: [],
  errors: []
};

async function step(name, fn) {
  const result = await fn();
  report.steps.push({ step: name, result });
  return result;
}

try {
  await client.connect(transport);

  await step('focusChrome', () => call('focus', { bundleId: 'com.google.Chrome' }));

  const tabsRes = await step('tabs', () => call('browser_tabs', {}));
  if (!tabsRes.ok) throw new Error('browser_tabs failed');
  const xTab = parseTabs(tabsRes.text || '').find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!xTab) throw new Error('No X tab found');
  report.xTab = xTab;

  await step('stealth', () => call('browser_stealth', { tabId: xTab.id }));

  // 1) Home capabilities snapshot
  await step('home:navigate', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/home' }));
  await step('home:wait', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 80', timeoutMs: 30000 }));

  const caps = await step('home:caps', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const q = (s) => document.querySelectorAll(s).length;
      return {
        url: location.href,
        articles: document.querySelectorAll('article').length,
        replyButtons: q('[data-testid="reply"]'),
        likeButtons: q('[data-testid="like"]'),
        unlikeButtons: q('[data-testid="unlike"]'),
        repostButtons: q('[data-testid="retweet"], [data-testid="unretweet"]'),
        bookmarkButtons: q('[data-testid="bookmark"], [data-testid="removeBookmark"]'),
        shareButtons: q('[aria-label*="Share"], [data-testid="share"]')
      };
    })()`
  }));
  report.capabilities = caps.ok ? j(caps.text || '{}') : null;

  // 2) Like toggle test (reversible)
  const likeTest = await step('home:likeToggle', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const first = document.querySelector('article');
      if (!first) return { ok:false, reason:'no-article' };

      const beforeLike = !!first.querySelector('[data-testid="like"]');
      const beforeUnlike = !!first.querySelector('[data-testid="unlike"]');
      const btn = first.querySelector('[data-testid="like"], [data-testid="unlike"]');
      if (!btn) return { ok:false, reason:'no-like-button' };

      btn.click();
      const after1Like = !!first.querySelector('[data-testid="like"]');
      const after1Unlike = !!first.querySelector('[data-testid="unlike"]');

      // Revert state if toggled to unlike
      const revertBtn = first.querySelector('[data-testid="unlike"]');
      let reverted = false;
      if (revertBtn) {
        revertBtn.click();
        reverted = true;
      }

      const finalLike = !!first.querySelector('[data-testid="like"]');
      const finalUnlike = !!first.querySelector('[data-testid="unlike"]');
      return {
        ok:true,
        before: { like: beforeLike, unlike: beforeUnlike },
        afterFirstClick: { like: after1Like, unlike: after1Unlike },
        reverted,
        final: { like: finalLike, unlike: finalUnlike }
      };
    })()`
  }));
  report.likeTest = likeTest.ok ? j(likeTest.text || '{}') : likeTest;

  // 3) Bookmark toggle test (reversible)
  const bookmarkTest = await step('home:bookmarkToggle', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const first = document.querySelector('article');
      if (!first) return { ok:false, reason:'no-article' };

      const beforeSave = !!first.querySelector('[data-testid="bookmark"]');
      const beforeRemove = !!first.querySelector('[data-testid="removeBookmark"]');
      const btn = first.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
      if (!btn) return { ok:false, reason:'no-bookmark-button' };

      btn.click();
      const after1Save = !!first.querySelector('[data-testid="bookmark"]');
      const after1Remove = !!first.querySelector('[data-testid="removeBookmark"]');

      const revertBtn = first.querySelector('[data-testid="removeBookmark"]');
      let reverted = false;
      if (revertBtn) {
        revertBtn.click();
        reverted = true;
      }

      const finalSave = !!first.querySelector('[data-testid="bookmark"]');
      const finalRemove = !!first.querySelector('[data-testid="removeBookmark"]');
      return {
        ok:true,
        before: { bookmark: beforeSave, removeBookmark: beforeRemove },
        afterFirstClick: { bookmark: after1Save, removeBookmark: after1Remove },
        reverted,
        final: { bookmark: finalSave, removeBookmark: finalRemove }
      };
    })()`
  }));
  report.bookmarkTest = bookmarkTest.ok ? j(bookmarkTest.text || '{}') : bookmarkTest;

  // 4) Comment/reply draft test (no submit)
  const replyPrep = await step('reply:openComposerNoSend', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const first = document.querySelector('article');
      if (!first) return { ok:false, reason:'no-article' };
      const replyBtn = first.querySelector('[data-testid="reply"]');
      if (!replyBtn) return { ok:false, reason:'no-reply-button' };
      replyBtn.click();
      return { ok:true };
    })()`
  }));

  await sleep(450);

  const replyType = await step('reply:typeDraftNoSend', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const box = document.querySelector('[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]');
      if (!box) return { ok:false, reason:'reply-editor-not-found' };
      const text = ${JSON.stringify(DRAFT_REPLY)};
      box.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, text);

      const preview = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);

      // Close composer safely without sending
      const closeBtn = document.querySelector('[aria-label="Close"], [data-testid="app-bar-close"], button[aria-label*="Close"]');
      if (closeBtn) closeBtn.click();

      return { ok:true, draftPreview: preview, sent: false };
    })()`
  }));
  report.replyTest = {
    opened: replyPrep.ok ? j(replyPrep.text || '{}') : replyPrep,
    typed: replyType.ok ? j(replyType.text || '{}') : replyType
  };

  // 5) DM capability and draft test (no send)
  await step('dm:navigate', () => call('browser_navigate', { tabId: xTab.id, url: 'https://x.com/messages' }));
  await step('dm:wait', () => call('browser_wait', { tabId: xTab.id, condition: 'document.body && document.body.innerText.length > 60', timeoutMs: 30000 }));

  const dmCaps = await step('dm:caps', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const ex = (s) => !!document.querySelector(s);
      return {
        url: location.href,
        newMessage: ex('[data-testid="DM_New_Direct_Message_Button"], a[href="/messages/compose"], [aria-label*="New message"]'),
        searchPeople: ex('input[data-testid="searchPeople"], input[placeholder*="Search"], input[aria-label*="Search"]'),
        composer: ex('[data-testid="dmComposerTextInput"], div[role="textbox"][data-testid="dmComposerTextInput"], div[role="textbox"][contenteditable="true"]'),
        sendButton: ex('[data-testid="dmComposerSendButton"], [aria-label="Send"]')
      };
    })()`
  }));
  report.dmCapabilities = dmCaps.ok ? j(dmCaps.text || '{}') : null;

  const dmDraft = await step('dm:openDraftNoSend', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const openBtn = document.querySelector('[data-testid="DM_New_Direct_Message_Button"], a[href="/messages/compose"], [aria-label*="New message"]');
      if (!openBtn) return { ok:false, reason:'new-message-button-not-found' };
      openBtn.click();

      const box = document.querySelector('div[role="textbox"][contenteditable="true"], [data-testid="dmComposerTextInput"], input[placeholder*="Search people"]');
      if (box) {
        box.focus();
        document.execCommand('insertText', false, 'screenhand smoke test draft');
      }

      const close = document.querySelector('[aria-label="Close"], button[aria-label*="Close"]');
      if (close) close.click();

      return { ok:true, draftAttempted: !!box, sent: false, closed: !!close, page: location.href, snippet: clean(document.body?.innerText || '').slice(0, 240) };
    })()`
  }));
  report.dmDraft = dmDraft.ok ? j(dmDraft.text || '{}') : dmDraft;

  // 6) Other: repost/share availability only (no click)
  const otherCaps = await step('home:otherAvailabilityNoAction', () => call('browser_js', {
    tabId: xTab.id,
    code: `(() => {
      const q = (s) => document.querySelectorAll(s).length;
      return {
        url: location.href,
        repostButtons: q('[data-testid="retweet"], [data-testid="unretweet"]'),
        shareButtons: q('[aria-label*="Share"], [data-testid="share"]'),
        profileMenuButtons: q('[data-testid="AppTabBar_More_Menu"]')
      };
    })()`
  }));
  report.otherAvailability = otherCaps.ok ? j(otherCaps.text || '{}') : null;

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, summary: {
    capabilities: report.capabilities,
    likeTest: report.likeTest,
    bookmarkTest: report.bookmarkTest,
    replyTest: report.replyTest,
    dmCapabilities: report.dmCapabilities,
    dmDraft: report.dmDraft,
    otherAvailability: report.otherAvailability
  }}, null, 2));
} catch (err) {
  report.errors.push(String(err?.message || err));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, out: OUT, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
