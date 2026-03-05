import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ONBOARD_URL = 'https://devpost.com/settings/hackathon-recommendations?return_to=https%3A%2F%2Fdevpost.com%2F';

const transport = new StdioClientTransport({ command:'npx', args:['tsx','/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts'] });
const client = new Client({ name:'screenhand-devpost-complete-onboarding', version:'1.0.0' }, { capabilities:{} });
const t = (r) => r?.content?.find?.(c => c.type === 'text')?.text || JSON.stringify(r);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseOrRaw(s) { try { return JSON.parse(s); } catch { return s; } }

async function js(code) {
  const r = await client.callTool({ name:'browser_js', arguments:{ code } });
  return t(r);
}

async function fillPass() {
  const out = await js(`(() => {
    const setVal = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    const setChecked = (sel, checked=true) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.checked = checked;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    const setSelectByText = (sel, terms) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const options = Array.from(el.options || []);
      const termArr = Array.isArray(terms) ? terms : [terms];
      const match = options.find(o => {
        const tx = (o.textContent || '').toLowerCase();
        return termArr.every(term => tx.includes(String(term).toLowerCase()));
      }) || options.find(o => {
        const tx = (o.textContent || '').toLowerCase();
        return termArr.some(term => tx.includes(String(term).toLowerCase()));
      });
      if (!match) return false;
      el.value = match.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    // Specialty and skills
    const specialty = setChecked('#user_employed_as_full-stack_developer', true);
    const skills = setVal('#user_tag_list', 'JavaScript, Node.js, React, APIs, AI, Automation');

    // Interests
    const interests = {
      ai: setChecked('#user_theme_ids_6', true),
      web: setChecked('#user_theme_ids_25', true),
      beginner: setChecked('#user_theme_ids_23', true),
      openEnded: setChecked('#user_theme_ids_22', true)
    };

    // Location + timezone
    const address = setVal('#user_address', 'Jaipur, Rajasthan, India');
    const timezone = setSelectByText('#user_timezone', ['chennai']) || setSelectByText('#user_timezone', ['kolkata']) || setSelectByText('#user_timezone', ['new delhi']);

    // Prefer professional path to bypass school-required inputs
    const careerProfessional = setChecked('#user_career_status_professional__post_grad', true);
    const employedTech = setChecked('#user_employed_in_software_or_tech_true', true);
    const companyHackathonsNo = setChecked('#user_company_has_internal_hackathons_false', true);

    // Fallback populate student fields in case still required by form logic
    const school = setVal('#user_school_name', 'University of Rajasthan');
    const gradMonth = setSelectByText('#user_graduation_date_2i', ['may']);
    const gradYear = setSelectByText('#user_graduation_date_1i', ['2019']) || setSelectByText('#user_graduation_date_1i', ['2020']) || setSelectByText('#user_graduation_date_1i', ['2021']);

    // Optional birth month/year from known DOB (May 1997)
    const birthMonth = setSelectByText('#user_birth_month_2i', ['may']);
    const birthYear = setSelectByText('#user_birth_month_1i', ['1997']);

    const submit = Array.from(document.querySelectorAll('input[type="submit"],button,[role="button"]')).find(el => /continue|next|save|done|finish/i.test((el.value || el.textContent || '').trim()));
    if (submit) submit.scrollIntoView({ block:'center' });

    const visibleRequired = Array.from(document.querySelectorAll('input[required],select[required],textarea[required]')).map(el => ({
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      value: (el.value || '').toString(),
      visible: !!(el.offsetParent !== null)
    })).filter(x => x.visible);

    return {
      url: location.href,
      title: document.title,
      actions: { specialty, skills, interests, address, timezone, careerProfessional, employedTech, companyHackathonsNo, school, gradMonth, gradYear, birthMonth, birthYear },
      submitFound: !!submit,
      submitText: submit ? (submit.value || submit.textContent || '').trim() : null,
      submitDisabled: submit ? !!submit.disabled : null,
      visibleRequired
    };
  })()`);
  return parseOrRaw(out);
}

async function clickContinue() {
  const out = await js(`(() => {
    const btn = Array.from(document.querySelectorAll('input[type="submit"],button,[role="button"]')).find(el => /continue|next|save|done|finish/i.test((el.value || el.textContent || '').trim()));
    if (!btn) return { clicked:false, reason:'not_found', url: location.href };
    if (btn.disabled) return { clicked:false, reason:'disabled', text:(btn.value || btn.textContent || '').trim(), url: location.href };
    btn.click();
    return { clicked:true, text:(btn.value || btn.textContent || '').trim(), url: location.href };
  })()`);
  return parseOrRaw(out);
}

async function statusSnapshot() {
  const out = await js(`(() => {
    const errs = [];
    const textNodes = Array.from(document.querySelectorAll('div,span,p,li,label')).map(e => (e.textContent||'').trim()).filter(Boolean);
    for (const s of textNodes) {
      const low = s.toLowerCase();
      if (low.includes('required') || low.includes('please') || low.includes('invalid') || low.includes('error') || low.includes('select') || low.includes('enter')) {
        errs.push(s.replace(/\\s+/g,' ').slice(0,160));
      }
      if (errs.length >= 30) break;
    }

    const visibleRequired = Array.from(document.querySelectorAll('input[required],select[required],textarea[required]')).map(el => ({
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      value: (el.value || '').toString(),
      visible: !!(el.offsetParent !== null)
    })).filter(x => x.visible);

    const accountHints = {
      logout: !!document.querySelector('a[href*="/logout"]'),
      settings: !!document.querySelector('a[href*="/settings"]'),
      profile: !!document.querySelector('a[href*="/users/"]'),
      avatar: !!document.querySelector('.avatar, .user-menu, img[class*="avatar"]')
    };

    return {
      url: location.href,
      title: document.title,
      errors: errs,
      visibleRequired,
      accountHints,
      likelyOnboardingDone: !location.href.includes('/settings/hackathon-recommendations')
    };
  })()`);
  return parseOrRaw(out);
}

try {
  await client.connect(transport);
  await client.callTool({ name:'focus', arguments:{ bundleId:'com.google.Chrome' } });

  await client.callTool({ name:'browser_navigate', arguments:{ url: ONBOARD_URL } });
  await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });

  const fill1 = await fillPass();
  const click1 = await clickContinue();
  await sleep(3000);
  let snap1 = await statusSnapshot();

  let click2 = null;
  let snap2 = null;

  if (!snap1.likelyOnboardingDone) {
    const fill2 = await fillPass();
    click2 = await clickContinue();
    await sleep(3500);
    snap2 = await statusSnapshot();
    snap1 = { ...snap1, secondFill: fill2 };
  }

  // Open home after onboarding if still in settings flow
  let finalNav = null;
  let finalInfo = null;
  const finalSnap = snap2 || snap1;
  if (finalSnap.likelyOnboardingDone) {
    await client.callTool({ name:'browser_navigate', arguments:{ url:'https://devpost.com/' } });
    await client.callTool({ name:'browser_wait', arguments:{ condition:'document.readyState === "complete"', timeoutMs:20000 } });
    finalNav = 'navigated_home';
  }

  const pageInfo = await client.callTool({ name:'browser_page_info', arguments:{} });
  finalInfo = parseOrRaw(t(pageInfo));

  console.log(JSON.stringify({ fill1, click1, snap1, click2, snap2, finalNav, finalInfo }, null, 2));
} finally {
  try { await client.close(); } catch {}
}
