import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name: "screenhand-devpost-captcha-click-text2", version: "1.0.0" }, { capabilities: {} });
const t = (r) => r?.content?.find?.(c => c.type === "text")?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try {
  await client.connect(transport);

  await client.callTool({ name: "focus", arguments: { app: "Google Chrome" } });
  await sleep(400);

  const windowsRes = await client.callTool({ name: "windows", arguments: {} });
  const windowsText = t(windowsRes);
  const line = windowsText
    .split(/\n/)
    .find((ln) => /Google Chrome/i.test(ln) && /Devpost/i.test(ln))
    || windowsText.split(/\n/).find((ln) => /Google Chrome/i.test(ln));

  const m = line?.match(/^\[(\d+)\]/);
  const windowId = m ? Number(m[1]) : undefined;

  let clickResult = "No Chrome window id parsed";
  if (windowId !== undefined) {
    const r = await client.callTool({ name: "click_text", arguments: { windowId, text: "I'm not a robot" } });
    clickResult = t(r);
  }

  await sleep(3500);

  const state = await client.callTool({
    name: "browser_js",
    arguments: {
      code: `(() => {
        const token = document.querySelector('#g-recaptcha-response')?.value || '';
        const ifr = Array.from(document.querySelectorAll('iframe')).filter(f => /recaptcha|challenge|bframe/i.test((f.title||'') + ' ' + (f.src||''))).map(f => {
          const r = f.getBoundingClientRect();
          return { title: f.title || null, src: f.src || null, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
        });
        return { tokenLength: token.length, hasToken: token.length > 0, iframes: ifr };
      })()`
    }
  });

  console.log(JSON.stringify({ windowLine: line, windowId, clickResult, captchaState: t(state) }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
