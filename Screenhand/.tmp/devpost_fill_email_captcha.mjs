import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SIGNUP_URL = "https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"],
});

const client = new Client({ name: "screenhand-devpost-fill-captcha", version: "1.0.0" }, { capabilities: {} });

const t = (r) => r?.content?.find?.((c) => c.type === "text")?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(res) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

try {
  await client.connect(transport);

  await call("focus", { app: "Google Chrome" });
  await call("browser_navigate", { url: SIGNUP_URL });
  await call("browser_wait", { condition: 'document.readyState === "complete"', timeoutMs: 20000 });

  // Ensure email form is visible.
  await call("browser_js", {
    code: `(() => {
      const input = document.querySelector('#user_email');
      if (input) return { emailFormVisible: true };
      const cands = Array.from(document.querySelectorAll('a,button,[role="button"]'));
      const el = cands.find(e => /sign up with email/i.test((e.textContent||'').trim()));
      if (el) el.click();
      return { emailFormVisible: !!document.querySelector('#user_email'), clicked: !!el };
    })()`,
  });

  await sleep(1200);

  const fillRes = await call("browser_js", {
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

      const values = {
        first: document.querySelector('#user_first_name')?.value || null,
        last: document.querySelector('#user_last_name')?.value || null,
        email: document.querySelector('#user_email')?.value || null,
        passwordLen: (document.querySelector('#user_password')?.value || '').length,
      };

      const submit = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(e => /sign up with email|sign up|join/i.test((e.textContent||e.value||'').trim()));

      const sr = submit ? submit.getBoundingClientRect() : null;

      return {
        out,
        values,
        submit: submit ? {
          text: (submit.textContent||submit.value||'').trim(),
          disabled: !!submit.disabled,
          rect: { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) }
        } : null
      };
    })()`,
  });

  // Attempt CAPTCHA by clicking reCAPTCHA iframe area.
  const recaptchaInfo = await call("browser_js", {
    code: `(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const rec = frames.filter(f => /recaptcha/i.test((f.title||'') + ' ' + (f.src||'')));
      const mapped = rec.map((f, i) => {
        const r = f.getBoundingClientRect();
        return {
          i,
          title: f.title || null,
          src: f.src || null,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        };
      });
      return { count: mapped.length, recaptchaFrames: mapped };
    })()`,
  });

  const captchaClick = await call("browser_click", { selector: 'iframe[title*="reCAPTCHA"], iframe[title*="recaptcha"]' });
  await sleep(3500);

  const captchaState = await call("browser_js", {
    code: `(() => {
      const token = document.querySelector('#g-recaptcha-response')?.value || '';
      const challengeFrames = Array.from(document.querySelectorAll('iframe')).filter(f => /challenge|bframe|recaptcha/i.test((f.title||'') + ' ' + (f.src||''))).map(f => {
        const r = f.getBoundingClientRect();
        return {
          title: f.title || null,
          src: f.src || null,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        };
      });
      return {
        tokenLength: token.length,
        hasToken: token.length > 0,
        challengeFrames
      };
    })()`,
  });

  console.log(JSON.stringify({
    fillRes,
    recaptchaInfo,
    captchaClick,
    captchaState
  }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
