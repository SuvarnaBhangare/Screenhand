import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name: "screenhand-devpost-reopen-fill-captcha", version: "1.0.0" }, { capabilities: {} });
const t = (r) => r?.content?.find?.(c => c.type === "text")?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getChromeWindowId(windowsText) {
  const line = windowsText.split(/\n/).find((ln) => /Google Chrome/i.test(ln) && /Devpost/i.test(ln)) ||
               windowsText.split(/\n/).find((ln) => /Google Chrome/i.test(ln));
  const m = line?.match(/^\[(\d+)\]/);
  return { line, id: m ? Number(m[1]) : undefined };
}

try {
  await client.connect(transport);

  await client.callTool({ name: "focus", arguments: { app: "Google Chrome" } });
  await sleep(300);
  await client.callTool({ name: "browser_navigate", arguments: { url: "https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button" } });
  await client.callTool({ name: "browser_wait", arguments: { condition: 'document.readyState === "complete"', timeoutMs: 20000 } });

  const windowsRes = await client.callTool({ name: "windows", arguments: {} });
  const windowsText = t(windowsRes);
  const win = getChromeWindowId(windowsText);

  let openEmailText = "window-not-found";
  if (win.id !== undefined) {
    const r = await client.callTool({ name: "click_text", arguments: { windowId: win.id, text: "sign up with email" } });
    openEmailText = t(r);
  }

  await sleep(1500);

  const fill = await client.callTool({
    name: "browser_js",
    arguments: {
      code: `(() => {
        const set = (sel, value) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };

        const out = {
          first: set('#user_first_name', 'Manu'),
          last: set('#user_last_name', 'Singhal'),
          email: set('#user_email', 'singhaldeoli106@gmail.com'),
          password: set('#user_password', 'Deoli@2026'),
        };

        const rec = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
        if (rec) rec.scrollIntoView({ block: 'center' });

        return {
          out,
          values: {
            first: document.querySelector('#user_first_name')?.value || null,
            last: document.querySelector('#user_last_name')?.value || null,
            email: document.querySelector('#user_email')?.value || null,
            passwordLen: (document.querySelector('#user_password')?.value || '').length
          },
          hasRecaptchaIframe: !!rec
        };
      })()`
    }
  });

  await sleep(1200);

  let captchaClick = "not-attempted";
  if (win.id !== undefined) {
    const r = await client.callTool({ name: "click_text", arguments: { windowId: win.id, text: "I'm not a robot" } });
    captchaClick = t(r);
  }

  await sleep(3500);

  const state = await client.callTool({
    name: "browser_js",
    arguments: {
      code: `(() => {
        const token = document.querySelector('#g-recaptcha-response')?.value || '';
        const rec = Array.from(document.querySelectorAll('iframe')).filter(f => /recaptcha|challenge|bframe/i.test((f.title||'') + ' ' + (f.src||''))).map(f => {
          const r = f.getBoundingClientRect();
          return { title: f.title || null, src: f.src || null, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
        });
        return { tokenLength: token.length, hasToken: token.length > 0, recaptchaFrames: rec };
      })()`
    }
  });

  console.log(JSON.stringify({
    windowLine: win.line,
    windowId: win.id,
    openEmailText,
    fill: t(fill),
    captchaClick,
    captchaState: t(state)
  }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
