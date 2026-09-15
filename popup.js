const $ = id => document.getElementById(id);
const DEFAULTS = { namespace: 'gti43', tag: 'qwen', password: '', apiKey: '',
                   autofill: true, autosubmit: false, lastEmail: '', lastTag: '' };

// TestMail JSON API endpoint (must include /json — /api alone redirects and drops the query)
const API_URL = 'https://api.testmail.app/api/json';

document.addEventListener('DOMContentLoaded', async () => {
  const cfg = { ...DEFAULTS, ...(await browser.storage.local.get(DEFAULTS)) };
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

async function save() { await browser.storage.local.set(readForm()); flash('Settings saved ✔'); }

function makeEmail(cfg) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => chars[b % chars.length]).join('');
  const tag = (cfg.tag || 'qwen') + rnd(8);
  return { email: `${cfg.namespace}.${tag}@inbox.testmail.app`, tag };
}

async function sendToTab(msg) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('no active tab');
  try { return await browser.tabs.sendMessage(tab.id, msg); }
  catch {
    await browser.tabs.executeScript(tab.id, { file: 'content.js' });
    return await browser.tabs.sendMessage(tab.id, msg);
  }
}

async function fillNow(submit) {
  try {
    const cfg = readForm();
    await browser.storage.local.set(cfg);
    const { email, tag } = makeEmail(cfg);
    await browser.storage.local.set({ lastEmail: email, lastTag: tag });
    $('lastemail').textContent = email;
    const res = await sendToTab({ type: 'FILL', email, password: cfg.password, autosubmit: submit });
    flash(res?.ok ? `Filled ${email}${submit ? ' → submitting' : ''}`
                  : `Fill failed — is this a qwen.ai tab?`);
  } catch (e) { flash('Error: ' + e.message); }
}

/* Safe fetch for Tor Browser — surfaces real server errors */
async function fetchJson(url) {
  try {
    const r   = await fetch(url, { 
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    if (!r.ok) {
      const raw = await r.text();
      throw new Error(`TestMail API HTTP ${r.status}: ${raw ? raw.slice(0, 150) : 'empty response'}`);
    }
    const data = await r.json();
    return data || { emails: [] };
  } catch (e) {
    if (e.message.includes('HTTP')) throw e;
    throw new Error(`Fetch failed: ${e.message}. Check API key & network.`);
  }
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
    await browser.storage.local.set(cfg);
    if (!cfg.apiKey) return flash('Add your TestMail API key from testmail.app dashboard');
    const { lastEmail, lastTag } = await browser.storage.local.get(['lastEmail', 'lastTag']);
    if (!lastEmail) return flash('Fill the form first to generate an email');

    // Build API URL with proper encoding for Tor Browser compatibility
    const base = `${API_URL}?apikey=${encodeURIComponent(cfg.apiKey)}`
               + `&namespace=${encodeURIComponent(cfg.namespace)}`
               + `&tag=${encodeURIComponent(lastTag || cfg.tag)}`;

    // Helper to extract recipient addresses from email object
    const toStr = e => {
      if (Array.isArray(e.to)) {
        return e.to.map(x => typeof x === 'string' ? x : (x?.address || '')).filter(Boolean).join(' ');
      }
      return (e.to?.address || e.to || '').toString();
    };

    let target = null;
    // Poll up to 5 times with 3-second intervals
    for (let attempt = 1; attempt <= 5 && !target; attempt++) {
      flash(attempt === 1 ? 'Fetching emails from TestMail…' : `Still waiting… (attempt ${attempt}/5)`);
      
      let list = [];
      try {
        // First try with tag filter
        const response = await fetchJson(base);
        list = response.emails || [];
      } catch (tagErr) {
        // If tag filter fails, try fetching all emails in namespace and filter locally
        console.log('Tag filter failed, falling back to namespace-only query:', tagErr.message);
        try {
          const nsUrl = `${API_URL}?apikey=${encodeURIComponent(cfg.apiKey)}&namespace=${encodeURIComponent(cfg.namespace)}`;
          const response = await fetchJson(nsUrl);
          list = response.emails || [];
        } catch (nsErr) {
          return flash(`API Error: ${nsErr.message}`);
        }
      }

      // Sort by newest first
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Find matching email: either sent to our generated address or related to qwen signup
      target = list.find(e => {
        const recipients = toStr(e).toLowerCase();
        return recipients.includes(lastEmail.toLowerCase());
      }) || list.find(e => {
        const context = `${e.from || ''} ${e.subject || ''}`.toLowerCase();
        return /qwen|verification|signup|register/.test(context);
      });

      if (!target) {
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    if (!target) {
      return flash('No verification email received yet. Try again in ~10 seconds.');
    }

    // Extract verification code from email content
    const emailBody = `${target.subject || ''}\n${target.text || ''}`;
    const htmlText = target.html ? String(target.html).replace(/<[^>]+>/g, ' ') : '';
    const fullText = `${emailBody}\n${htmlText}`;

    // Multiple regex patterns to catch various code formats
    const codeMatch = 
      fullText.match(/(?:verification\s*code|otp|your\s*code|验证码)[:\s]*(\d{4,8})/i) ||
      fullText.match(/(?:code|otp|verif\w*)[:\s]*(\d{4,8})/i) ||
      fullText.match(/(?:^|\s|\D)(\d{6})(?:\s|$|\D)/) ||  // exactly 6 digits
      fullText.match(/\b(\d{4,8})\b/);  // fallback: any 4-8 digit number

    if (!codeMatch) {
      return flash('Email found but no code detected. Check manually in TestMail dashboard.');
    }

    const code = codeMatch[1];
    
    // Fill the code into the page and copy to clipboard
    try { await sendToTab({ type: 'FILL_CODE', code, autosubmit: cfg.autosubmit }); } catch (fillErr) {
      console.log('Auto-fill failed:', fillErr);
    }
    try { await navigator.clipboard.writeText(code); } catch (clipErr) {
      console.log('Clipboard copy failed:', clipErr);
    }
    
    $('manualcode').value = code;
    flash(`✓ Code ${code} extracted! Filled & copied.`);
  } catch (e) {
    flash(`Error: ${e.message}`);
    console.error('getCode error:', e);
  }
}

const flash = msg => $('status').textContent = msg;