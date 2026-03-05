import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command:"npx", args:["tsx","/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name:"screenhand-devpost-check-welcome", version:"1.0.0" }, { capabilities:{} });
const t=(r)=>r?.content?.find?.(c=>c.type==='text')?.text||JSON.stringify(r);

function parseTabs(text) {
  return text.split(/\n/).map((line)=>{
    const m = line.match(/^\[([A-F0-9]+)\]\s+(.*?)\s+—\s+(https?:\/\/.*)$/);
    if (!m) return null;
    return { id:m[1], title:m[2], url:m[3] };
  }).filter(Boolean);
}

try {
  await client.connect(transport);

  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });
  const tabsRes = await client.callTool({ name:'browser_tabs', arguments:{} });
  const tabsText = t(tabsRes);
  const tabs = parseTabs(tabsText);

  const welcome = tabs.find(x => /\/users\/welcome/.test(x.url));
  const signup = tabs.find(x => /\/users\/register/.test(x.url));

  const checkTab = async (tab) => {
    if (!tab) return null;
    const info = await client.callTool({ name:'browser_js', arguments:{ tabId: tab.id, code:`(() => {
      const accountHints = [
        !!document.querySelector('a[href*="/logout"]'),
        !!document.querySelector('a[href*="/settings"]'),
        !!document.querySelector('a[href*="/users/"] img'),
        !!document.querySelector('.user-menu, [data-test*="avatar"], .avatar')
      ];

      const text = document.body ? document.body.innerText : '';
      const snippets = text.split(/\n/).map(s=>s.trim()).filter(Boolean)
        .filter(s=>/welcome|profile|dashboard|hackathon|start|submit|project|logged|log out|settings/i.test(s))
        .slice(0,25);

      return {
        url: location.href,
        title: document.title,
        accountHints,
        loggedLikely: accountHints.some(Boolean),
        snippets
      };
    })()` } });
    return { tab, data: JSON.parse(t(info)) };
  };

  const welcomeData = await checkTab(welcome);
  const signupData = await checkTab(signup);

  // Bring welcome tab to front if present
  if (welcome) {
    await client.callTool({ name:'browser_js', arguments:{ tabId: welcome.id, code:'(() => { window.focus(); return { ok:true, url: location.href }; })()' } });
  }

  console.log(JSON.stringify({ tabs, welcomeData, signupData }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
