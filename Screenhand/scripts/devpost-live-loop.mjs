#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_MCP_PATH = "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts";
const SIGNUP_URL = "https://secure.devpost.com/users/register?ref_content=signup_global_nav&ref_feature=signup&ref_medium=button";
const ONBOARD_URL = "https://devpost.com/settings/hackathon-recommendations?return_to=https%3A%2F%2Fdevpost.com%2F";
const SETTINGS_URL = "https://devpost.com/settings";
const PORTFOLIO_URL = "https://devpost.com/portfolio/redirect?page=projects";

const config = {
  mcpPath: process.env.SCREENHAND_MCP_PATH || DEFAULT_MCP_PATH,
  maxSteps: Number(process.env.LOOP_MAX_STEPS || 50),
  pollMs: Number(process.env.LOOP_POLL_MS || 1500),
  saveMemory: process.env.SAVE_MEMORY !== "0",
  profile: {
    firstName: process.env.DEVPOST_FIRST_NAME || "Manu",
    lastName: process.env.DEVPOST_LAST_NAME || "Singhal",
    email: process.env.DEVPOST_EMAIL || "",
    password: process.env.DEVPOST_PASSWORD || "",
    tagline: process.env.DEVPOST_TAGLINE || "Full-stack developer focused on AI and automation",
    github: process.env.DEVPOST_GITHUB || "manushi4",
    website: process.env.DEVPOST_WEBSITE || "https://github.com/manushi4",
    twitter: process.env.DEVPOST_TWITTER || "manu_singhal",
    location: process.env.DEVPOST_LOCATION || "Jaipur, Rajasthan, India",
    skills: process.env.DEVPOST_SKILLS || "JavaScript, Node.js, React, APIs, AI, Automation",
  },
};

const TOOL_ALLOWLIST = new Set([
  "focus",
  "browser_navigate",
  "browser_wait",
  "browser_js",
  "browser_page_info",
  "browser_tabs",
  "memory_save",
  "memory_recall",
  "memory_stats",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseToolText(result) {
  return result?.content?.find?.((c) => c.type === "text")?.text || JSON.stringify(result);
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

class DevpostLiveLoop {
  constructor(cfg) {
    this.cfg = cfg;
    this.transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", cfg.mcpPath],
    });
    this.client = new Client({ name: "screenhand-devpost-live-loop", version: "1.0.0" }, { capabilities: {} });
  }

  async connect() {
    await this.client.connect(this.transport);
  }

  async close() {
    try {
      await this.client.close();
    } catch {}
  }

  async call(tool, args = {}) {
    if (!TOOL_ALLOWLIST.has(tool)) {
      throw new Error(`Tool "${tool}" is not allowlisted in this live loop.`);
    }
    const res = await this.client.callTool({ name: tool, arguments: args });
    return parseToolText(res);
  }

  async js(code) {
    const raw = await this.call("browser_js", { code });
    const parsed = parseMaybeJson(raw);
    if (parsed === null) {
      throw new Error(`browser_js returned non-JSON: ${raw}`);
    }
    return parsed;
  }

  async observe() {
    return this.js(`(() => {
      const url = location.href;
      const title = document.title;
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();

      const findButton = (re) => Array.from(document.querySelectorAll('button,input[type="submit"],a,[role="button"]'))
        .find(el => re.test((el.textContent || el.value || '').trim()));

      const signupBtn = findButton(/sign up with email/i);
      const continueBtn = findButton(/continue|next/i);
      const saveBtn = findButton(/save changes|save|update/i);
      const addProjectBtn = findButton(/add a new project/i);
      const emailLink = findButton(/sign up with email/i);

      const token = document.querySelector('#g-recaptcha-response')?.value || '';
      const hasCaptcha = !!document.querySelector('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], #g-recaptcha-response');
      const isLoggedIn = !!document.querySelector('a[href*="/users/logout"]');

      const isProfilePage = /^https:\\/\\/devpost\\.com\\/[^\\/?#]+\\/?$/.test(url) &&
        !url.includes('/settings') &&
        !url.includes('/hackathons') &&
        !url.includes('/software') &&
        !url.includes('/notifications');

      return {
        url,
        title,
        isLoggedIn,
        hasCaptcha,
        captchaTokenLen: token.length,
        onSignup: url.includes('/users/register'),
        onWelcome: url.includes('/users/welcome'),
        onOnboarding: url.includes('/settings/hackathon-recommendations'),
        onSettings: url.startsWith('https://devpost.com/settings') && !url.includes('/hackathon-recommendations'),
        onPortfolioPage: isProfilePage,
        hasAddProject: !!addProjectBtn,
        hasSignupButton: !!signupBtn,
        hasContinueButton: !!continueBtn,
        hasSaveButton: !!saveBtn,
        hasEmailLink: !!emailLink,
        bodyHint: bodyText.slice(0, 300),
      };
    })()`);
  }

  async ensureFocus() {
    await this.call("focus", { bundleId: "com.google.Chrome" });
  }

  async fillSignupPage() {
    const creds = {
      firstName: this.cfg.profile.firstName,
      lastName: this.cfg.profile.lastName,
      email: this.cfg.profile.email,
      password: this.cfg.profile.password,
    };
    return this.js(`(() => {
      const creds = ${JSON.stringify(creds)};
      const pick = (re) => Array.from(document.querySelectorAll('a,button,[role="button"]'))
        .find(el => re.test((el.textContent || '').trim()));

      const emailLink = pick(/sign up with email/i);
      if (emailLink) emailLink.click();

      const set = (sel, value) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const missing = [];
      if (!creds.email) missing.push('DEVPOST_EMAIL');
      if (!creds.password) missing.push('DEVPOST_PASSWORD');

      const changed = {
        first: creds.firstName ? set('#user_first_name', creds.firstName) : false,
        last: creds.lastName ? set('#user_last_name', creds.lastName) : false,
        email: creds.email ? set('#user_email', creds.email) : false,
        password: creds.password ? set('#user_password', creds.password) : false
      };

      const submit = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(el => /sign up with email/i.test((el.textContent || el.value || '').trim()));

      const token = document.querySelector('#g-recaptcha-response')?.value || '';
      return {
        url: location.href,
        changed,
        missing,
        submitFound: !!submit,
        submitDisabled: submit ? !!submit.disabled : null,
        hasCaptcha: !!document.querySelector('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], #g-recaptcha-response'),
        captchaTokenLen: token.length
      };
    })()`);
  }

  async maybeSubmitSignup() {
    return this.js(`(() => {
      const submit = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(el => /sign up with email/i.test((el.textContent || el.value || '').trim()));
      if (!submit) return { clicked: false, reason: 'submit_not_found', url: location.href };
      if (submit.disabled) return { clicked: false, reason: 'submit_disabled', url: location.href };
      submit.click();
      return { clicked: true, url: location.href };
    })()`);
  }

  async fillOnboardingAndContinue() {
    const payload = {
      location: this.cfg.profile.location,
      skills: this.cfg.profile.skills,
    };
    return this.js(`(() => {
      const payload = ${JSON.stringify(payload)};
      const set = (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const check = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.checked = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const pickSelect = (sel, terms) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const list = Array.from(el.options || []);
        const m = list.find(o => terms.every(t => (o.textContent || '').toLowerCase().includes(t.toLowerCase())));
        if (!m) return false;
        el.value = m.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const actions = {
        specialty: check('#user_employed_as_full-stack_developer'),
        skills: set('#user_tag_list', payload.skills),
        interestAi: check('#user_theme_ids_6'),
        interestWeb: check('#user_theme_ids_25'),
        interestBeginner: check('#user_theme_ids_23'),
        interestOpen: check('#user_theme_ids_22'),
        location: set('#user_address', payload.location),
        timezone: pickSelect('#user_timezone', ['chennai']) || pickSelect('#user_timezone', ['kolkata']) || pickSelect('#user_timezone', ['new delhi']),
        proStatus: check('#user_career_status_professional__post_grad'),
        employedInTech: check('#user_employed_in_software_or_tech_true'),
        companyHackathonsNo: check('#user_company_has_internal_hackathons_false')
      };

      const cont = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(el => /continue|next/i.test((el.textContent || el.value || '').trim()));
      if (cont && !cont.disabled) cont.click();

      const visibleRequired = Array.from(document.querySelectorAll('input[required],select[required],textarea[required]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ id: el.id || null, name: el.name || null, value: (el.value || '').toString() }));

      return {
        url: location.href,
        actions,
        continueClicked: !!(cont && !cont.disabled),
        visibleRequired
      };
    })()`);
  }

  async fillSettingsAndSave() {
    const profile = this.cfg.profile;
    return this.js(`(() => {
      const p = ${JSON.stringify(profile)};
      const set = (sel, val, force = false) => {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return false;
        const cur = (el.value || '').trim();
        if (!force && cur.length > 0) return 'kept_existing';
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const actions = {
        first: set('#user_first_name', p.firstName),
        last: set('#user_last_name', p.lastName),
        tagline: set('#user_user_setting_attributes_tagline', p.tagline),
        github: set('#user_user_setting_attributes_github_login', p.github),
        website: set('#user_user_setting_attributes_website', p.website),
        twitter: set('#user_user_setting_attributes_twitter', p.twitter)
      };

      const save = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]'))
        .find(el => /save changes|save|update/i.test((el.textContent || el.value || '').trim()));

      if (save && !save.disabled) save.click();
      return {
        url: location.href,
        actions,
        saveClicked: !!(save && !save.disabled)
      };
    })()`);
  }

  async saveMemory() {
    if (!this.cfg.saveMemory) return;
    const out = await this.call("memory_save", {
      task: "Devpost live loop: observe-decide-act without screenshots (signup + manual CAPTCHA handoff + onboarding + settings + portfolio check)",
      tags: ["devpost", "live-loop", "no-screenshot", "browser_js", "onboarding", "settings", "portfolio"],
    });
    console.log(`[memory_save] ${out}`);
  }

  async run() {
    await this.ensureFocus();

    for (let step = 1; step <= this.cfg.maxSteps; step += 1) {
      const state = await this.observe();
      console.log(`\\n[step ${step}] ${state.url}`);

      if (!/devpost\.com/.test(state.url)) {
        console.log("[action] Not on Devpost, navigating to signup.");
        await this.call("browser_navigate", { url: SIGNUP_URL });
        await this.call("browser_wait", { condition: "document.readyState === \"complete\"", timeoutMs: 20000 });
        await sleep(this.cfg.pollMs);
        continue;
      }

      if (state.onSignup) {
        const filled = await this.fillSignupPage();
        if (filled.missing.length > 0) {
          console.log(`[wait] Missing env vars: ${filled.missing.join(", ")}. Set them and rerun.`);
          return { status: "needs_credentials", state: filled };
        }

        if (filled.hasCaptcha && filled.captchaTokenLen === 0) {
          console.log("[wait] CAPTCHA needs manual solve. Complete it in browser; loop will continue.");
          await sleep(this.cfg.pollMs);
          continue;
        }

        if (filled.captchaTokenLen > 0) {
          const submit = await this.maybeSubmitSignup();
          console.log(`[action] Signup submit: ${JSON.stringify(submit)}`);
          await sleep(this.cfg.pollMs);
          continue;
        }

        await sleep(this.cfg.pollMs);
        continue;
      }

      if (state.onWelcome) {
        console.log("[action] Welcome page detected, moving to onboarding.");
        await this.call("browser_navigate", { url: ONBOARD_URL });
        await this.call("browser_wait", { condition: "document.readyState === \"complete\"", timeoutMs: 20000 });
        await sleep(this.cfg.pollMs);
        continue;
      }

      if (state.onOnboarding) {
        const onboard = await this.fillOnboardingAndContinue();
        console.log(`[action] Onboarding pass: continueClicked=${onboard.continueClicked}, visibleRequired=${onboard.visibleRequired.length}`);
        await sleep(this.cfg.pollMs);
        continue;
      }

      if (state.onSettings) {
        const settings = await this.fillSettingsAndSave();
        console.log(`[action] Settings saved: ${settings.saveClicked}`);
        await this.call("browser_navigate", { url: PORTFOLIO_URL });
        await this.call("browser_wait", { condition: "document.readyState === \"complete\"", timeoutMs: 20000 });
        await sleep(this.cfg.pollMs);
        continue;
      }

      if (state.onPortfolioPage && state.hasAddProject) {
        console.log("[done] Portfolio ready. Add a new project is visible.");
        await this.saveMemory();
        return { status: "done", state };
      }

      if (state.isLoggedIn) {
        console.log("[action] Logged in but not on target page, going to settings.");
        await this.call("browser_navigate", { url: SETTINGS_URL });
        await this.call("browser_wait", { condition: "document.readyState === \"complete\"", timeoutMs: 20000 });
        await sleep(this.cfg.pollMs);
        continue;
      }

      console.log("[action] Fallback to signup URL.");
      await this.call("browser_navigate", { url: SIGNUP_URL });
      await this.call("browser_wait", { condition: "document.readyState === \"complete\"", timeoutMs: 20000 });
      await sleep(this.cfg.pollMs);
    }

    return { status: "max_steps_reached" };
  }
}

async function main() {
  const loop = new DevpostLiveLoop(config);
  try {
    await loop.connect();
    const result = await loop.run();
    console.log(`\\n[result] ${JSON.stringify(result)}`);
    if (result.status !== "done") process.exitCode = 1;
  } catch (err) {
    console.error(`[error] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await loop.close();
  }
}

await main();
