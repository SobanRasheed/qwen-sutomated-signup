const $ = id => document.getElementById(id);
const DEFAULTS = { namespace: 'gti43', tag: 'qwen', password: '', apiKey: '',
                   autofill: true, autosubmit: false, lastEmail: '', lastTag: '' };

// TestMail JSON API endpoint (must include /json — /api alone redirects and drops the query)
const API_URL = 'https://api.testmail.app/api/json';

document.addEventListener('DOMContentLoaded', async () => {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  $('namespace').value = cfg.namespace;
  $('tag').value       = cfg.tag;
  $('password').value  = cfg.password;
  $('apikey').value    = cfg.apiKey;
  $('autofill').checked   = cfg.autofill;
  $('autosubmit').checked = cfg.autosubmit;
  $('lastemail').textContent = cfg.lastEmail || '—';

  $('showpass').onchange  = e => $('password').type = e.target.checked ? 'text' : 'password';
  $('save').onclick       = save;
  $('fill').onclick       = () => fillNow(false);
  $('fillsubmit').onclick = () => fillNow(true);
  $('getcode').onclick    = getCode;
  $('fillcode').onclick   = fillManualCode;
  $('copy').onclick = async () => {
    const t = $('lastemail').textContent;
    if (t && t !== '—') { await navigator.clipboard.writeText(t); flash('Email copied'); }
  };
});

const readForm = () => ({
  namespace: $('namespace').value.trim() || 'gti43',
  tag:       $('tag').value.trim() || 'qwen',
  password:  $('password').value,
  apiKey:    $('apikey').value.trim(),
  autofill:  $('autofill').checked,
  autosubmit:$('autosubmit').checked,
});

async function save() { await chrome.storage.local.set(readForm()); flash('Settings saved ✔'); }

function makeEmail(cfg) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => chars[b % chars.length]).join('');
  const tag = (cfg.tag || 'qwen') + rnd(8);
  return { email: `${cfg.namespace}.${tag}@inbox.testmail.app`, tag };
}

async function sendToTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('no active tab');
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, msg);
  }
}

async function fillNow(submit) {
  try {
    const cfg = readForm();
    await chrome.storage.local.set(cfg);
    const { email, tag } = makeEmail(cfg);
    await chrome.storage.local.set({ lastEmail: email, lastTag: tag });
    $('lastemail').textContent = email;
    const res = await sendToTab({ type: 'FILL', email, password: cfg.password, autosubmit: submit });
    flash(res?.ok ? `Filled ${email}${submit ? ' → submitting' : ''}`
                  : `Fill failed — is this a qwen.ai tab?`);
  } catch (e) { flash('Error: ' + e.message); }
}

/* NEW: safe fetch — surfaces the real server error instead of a JSON crash */
async function fetchJson(url) {
  const r   = await fetch(url, { cache: 'no-store' });
  const raw = await r.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  if (!data) throw new Error(`TestMail replied HTTP ${r.status}: ${raw ? `"${raw.slice(0, 120)}"` : 'empty body'}`);
  return data;
}

/* NEW: manual fallback — paste the code from the TestMail dashboard */
async function fillManualCode() {
  const code = $('manualcode').value.replace(/\D/g, '');
  if (!code) return flash('Paste the code from the TestMail dashboard first');
  const cfg = readForm();
  try {
    await sendToTab({ type: 'FILL_CODE', code, autosubmit: cfg.autosubmit });
    flash(`Code ${code} filled ✔`);
  } catch (e) { flash('Error: ' + e.message); }
}

async function getCode() {
  try {
    const cfg = readForm();
    await chrome.storage.local.set(cfg);
    if (!cfg.apiKey) return flash('Add your TestMail API key (testmail.app dashboard)');
    const { lastEmail, lastTag } = await chrome.storage.local.get(['lastEmail', 'lastTag']);
    if (!lastEmail) return flash('Fill the form first');

    const base = `${API_URL}?apikey=${encodeURIComponent(cfg.apiKey)}`
               + `&namespace=${encodeURIComponent(cfg.namespace)}`;

    const toStr = e => Array.isArray(e.to)
      ? e.to.map(x => typeof x === 'string' ? x : (x?.address || '')).join(' ')
      : (e.to?.address || e.to || '').toString();

    let target = null;
    for (let i = 1; i <= 5 && !target; i++) {
      flash(i === 1 ? 'Checking inbox…' : `Waiting for email… (try ${i}/5)`);
      let list = [];
      try {
        list = (await fetchJson(`${base}&tag=${encodeURIComponent(lastTag || cfg.tag)}`)).emails || [];
      } catch {
        try {   // tag filter rejected? → query whole namespace, filter locally
          list = (await fetchJson(base)).emails || [];
        } catch (e2) { return flash(e2.message); }   // ← you'll now see the REAL error
      }
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      target = list.find(e => toStr(e).toLowerCase().includes(lastEmail.toLowerCase()))
            || list.find(e => /qwen/i.test(`${e.from || ''} ${e.subject || ''}`));
      if (!target) await new Promise(r => setTimeout(r, 3000));
    }
    if (!target) return flash('No email yet — press again in a few seconds');

    const text = `${target.subject || ''}\n${target.text || String(target.html || '').replace(/<[^>]+>/g, ' ')}`;
    const m = text.match(/(?:code|otp|verif\w*|验证码)\D{0,80}(\d{4,8})/i)
           || text.match(/(?:^|\D)(\d{6})(?:\D|$)/)
           || text.match(/\b(\d{4,8})\b/);
    if (!m) return flash('Email found, but no code detected');

    const code = m[1];
    try { await sendToTab({ type: 'FILL_CODE', code, autosubmit: cfg.autosubmit }); } catch {}
    try { await navigator.clipboard.writeText(code); } catch {}
    $('manualcode').value = code;
    flash(`Code ${code} — filled & copied ✔`);
  } catch (e) { flash('Error: ' + e.message); }
}

const flash = msg => $('status').textContent = msg;