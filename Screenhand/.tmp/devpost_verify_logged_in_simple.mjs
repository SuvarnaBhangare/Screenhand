import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-verify-simple", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });

  await client.callTool({ name:'browser_navigate', arguments:{ url:'https://secure.devpost.com/users/welcome' } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });
  await sleep(1500);

  const state = await client.callTool({ name:'browser_js', arguments:{ code:`(() => {
    const url = location.href;
    const title = document.title;
    const text = (document.body?.innerText || '');
    const snippets = text.split(/\n/).map(s=>s.trim()).filter(Boolean)
      .filter(s=>/welcome|hackathon|profile|dashboard|project|log out|settings|account|join devpost|sign up/i.test(s))
      .slice(0,30);

    const loggedSignals = {
      logoutLink: !!document.querySelector('a[href*="/logout"]'),
      settingsLink: !!document.querySelector('a[href*="/settings"]'),
      avatar: !!document.querySelector('img[alt*="avatar" i], .avatar, .user-menu'),
      welcomePath: /\/users\/welcome/.test(url),
    };

    return {
      url,
      title,
      snippets,
      loggedSignals,
      likelyLoggedIn: Object.values(loggedSignals).some(Boolean) && !/\/users\/register|\/users\/login/.test(url)
    };
  })()` } });

  const info = await client.callTool({ name:'browser_page_info', arguments:{} });
  console.log(JSON.stringify({ state: JSON.parse(t(state)), info: JSON.parse(t(info)) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
