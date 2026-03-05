import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SIGNUP_URL = "https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"],
});
const client = new Client({ name: "screenhand-devpost-submit-after-verify", version: "1.0.0" }, { capabilities: {} });
const t = (r) => r?.content?.find?.((c) => c.type === "text")?.text || JSON.stringify(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeTool(name, args = {}) {
  try {
    const r = await client.callTool({ name, arguments: args });
    return { ok: true, text: t(r) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

try {
  await client.connect(transport);

  await safeTool("focus", { bundleId: "com.google.Chrome" });

  const beforeInfo = await safeTool("browser_page_info", {});
  const beforeState = await safeTool("browser_js", {
    code: `(() => {
      const token = document.querySelector('#g-recaptcha-response')?.value || '';
      const btn = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(e => /sign up with email|sign up|join/i.test((e.textContent||e.value||'').trim()));
      const msg = Array.from(document.querySelectorAll('div,span,p,li'))
        .map(e => (e.textContent||'').trim())
        .filter(Boolean)
        .filter(s => /captcha|robot|error|invalid|already|verify|verification|welcome|logged in|logout/i.test(s))
        .slice(0, 25);
      return {
        url: location.href,
        tokenLength: token.length,
        hasToken: token.length > 0,
        submitFound: !!btn,
        submitDisabled: btn ? !!btn.disabled : null,
        submitText: btn ? (btn.textContent||btn.value||'').trim() : null,
        messages: msg
      };
    })()`,
  });

  // If we're not on signup and not logged in obvious, navigate to signup first.
  const before = beforeState.ok ? JSON.parse(beforeState.text) : null;
  if (!before || !/devpost\.com/.test(before.url || "")) {
    await safeTool("browser_navigate", { url: SIGNUP_URL });
    await safeTool("browser_wait", { condition: 'document.readyState === "complete"', timeoutMs: 20000 });
  }

  const clickSubmit = await safeTool("browser_js", {
    code: `(() => {
      // Ensure email section is visible in case of collapsed social-only view
      const emailForm = document.querySelector('.row.col-12.email-form');
      if (emailForm) {
        emailForm.classList.remove('hidden');
        emailForm.style.display = 'block';
      }

      const btn = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(e => /sign up with email|sign up|join/i.test((e.textContent||e.value||'').trim()));

      if (!btn) return { clicked:false, reason:'submit_not_found', url: location.href };
      if (btn.disabled) return { clicked:false, reason:'submit_disabled', text:(btn.textContent||btn.value||'').trim(), url: location.href };

      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return { clicked:true, text:(btn.textContent||btn.value||'').trim(), url: location.href };
    })()`,
  });

  await sleep(4000);

  const afterInfo = await safeTool("browser_page_info", {});
  const afterState = await safeTool("browser_js", {
    code: `(() => {
      const token = document.querySelector('#g-recaptcha-response')?.value || '';
      const btn = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(e => /sign up with email|sign up|join/i.test((e.textContent||e.value||'').trim()));
      const msg = Array.from(document.querySelectorAll('div,span,p,li,h1,h2'))
        .map(e => (e.textContent||'').trim())
        .filter(Boolean)
        .filter(s => /captcha|robot|error|invalid|already|verify|verification|welcome|log out|profile|dashboard|submitted/i.test(s))
        .slice(0, 35);

      const accountMenu = !!document.querySelector('a[href*="/logout"], a[href*="/users/"] img, .user-menu, [data-test*="avatar"]');

      return {
        url: location.href,
        title: document.title,
        tokenLength: token.length,
        hasToken: token.length > 0,
        submitFound: !!btn,
        submitDisabled: btn ? !!btn.disabled : null,
        accountMenu,
        messages: msg
      };
    })()`,
  });

  const tabs = await safeTool("browser_tabs", {});

  console.log(JSON.stringify({
    beforeInfo,
    beforeState,
    clickSubmit,
    afterInfo,
    afterState,
    tabs,
  }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
