import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-dom-modal-probe', version: '1.0.0' }, { capabilities: {} });
const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

const parseTabs = (text) => (text || '').split('\n').map((line) => {
  const m = line.match(/^\[([^\]]+)\]\s*(.*?)\s+—\s+(.*)$/);
  return m ? { id: m[1], title: m[2], url: m[3] } : null;
}).filter(Boolean);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return t(res);
}

try {
  await client.connect(transport);
  await call('focus', { bundleId: 'com.google.Chrome' });
  const tabs = parseTabs(await call('browser_tabs', {}));
  const tab = tabs.find((x) => /(x\.com|twitter\.com)/i.test(x.url));
  if (!tab) throw new Error('No X tab');

  const out = j(await call('browser_js', {
    tabId: tab.id,
    code: `(() => {
      const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
      const text = clean(document.body?.innerText || '');
      const save = Array.from(document.querySelectorAll('button,[role="button"]')).find((el)=>/save/i.test(clean(el.textContent)||clean(el.getAttribute('aria-label'))||''));
      const fields = Array.from(document.querySelectorAll('input,textarea,div[role="textbox"][contenteditable="true"]')).map((el)=>({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type')||null,
        name: el.getAttribute('name')||null,
        id: el.id||null,
        placeholder: el.getAttribute('placeholder')||null,
        aria: el.getAttribute('aria-label')||null,
        dt: el.getAttribute('data-testid')||null,
        value: (el.value ?? el.textContent ?? '').toString().slice(0,200),
      })).slice(0,100);
      return {
        url: location.href,
        title: document.title,
        bodyLen: text.length,
        hasEditProfileText: /edit profile/i.test(text),
        hasBioKeywordOnPage: /desktop automation|screenhand\.com|open-source/i.test(text.toLowerCase()),
        saveFound: !!save,
        saveDisabled: save ? !!save.disabled : null,
        saveAriaDisabled: save ? save.getAttribute('aria-disabled') : null,
        fieldCount: fields.length,
        fields,
        textSnippet: text.slice(0, 2000)
      };
    })()`
  }));

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
