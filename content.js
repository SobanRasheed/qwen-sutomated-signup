/* Runs on https://*.qwen.ai/* — detects & fills the signup form (Tor Browser compatible) */
(() => {
  if (window.__qwenAutofillLoaded) return;
  window.__qwenAutofillLoaded = true;

  const EMAIL_HINTS = /mail|email/i;
  const PASS_HINTS  = /pass|pwd/i;
  const CODE_HINTS  = /otp|verif|\bcode\b/i;
  const CONSENT     = /agree|accept|terms|privacy|policy|consent|同意|阅读/i;
  const SIGNUP_CTX  = /sign\s*up|create\s*(an\s*)?account|register|注册/i;
  const SUBMIT_TEXT = /sign\s*up|register|create|continue|next|submit|log\s*in|登录|注册|下一步|提交/i;

  const visible = el => el && !el.disabled && el.getClientRects().length > 0;
  const sigOf   = el => [el.name, el.id, el.placeholder, el.autocomplete,
    el.getAttribute('aria-label'), el.getAttribute('data-testid'),
    typeof el.className === 'string' ? el.className : '']
    .filter(Boolean).join(' ').toLowerCase();

  // React/Ant-style inputs ignore plain .value assignment — use the native setter + events
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
  }

  const containerOf = el =>
    el.closest('form, [role="dialog"], [class*="modal"], [class*="dialog"], [class*="login"], [class*="signup"]') || document.body;

  function labelText(cb) {
    let node = cb.closest('label');
    if (!node && cb.id) node = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
    return (node || cb.parentElement)?.innerText || '';
  }

  function classify() {
    const f = { email: [], password: [], code: [], consent: [] };
    for (const el of document.querySelectorAll('input')) {
      if (!visible(el)) continue;
      const sig = sigOf(el);
      if (el.type === 'checkbox') {
        if (el.required || CONSENT.test(labelText(el))) f.consent.push(el);
      } else if (el.type === 'password' || (el.type === 'text' && PASS_HINTS.test(sig))) {
        f.password.push(el);                      // password + confirm both land here
      } else if (el.type === 'email' || EMAIL_HINTS.test(sig)) {
        f.email.push(el);
      } else if (/captcha|search/i.test(sig)) {
        /* ignore captcha / search boxes */
      } else if (CODE_HINTS.test(sig) ||
                 (el.inputMode === 'numeric' && el.maxLength >= 4 && el.maxLength <= 8)) {
        f.code.push(el);
      }
    }
    return f;
  }

  function fillForm({ email, password }) {
    const f = classify(), did = [];
    if (f.email[0]) { setNativeValue(f.email[0], email); did.push('email'); }
    if (password) {
      f.password.forEach(p => setNativeValue(p, password));
      if (f.password.length) did.push('password x' + f.password.length);
    }
    f.consent.forEach(cb => { if (!cb.checked) cb.click(); });
    return did;
  }

  function fillCode(code) {
    const f = classify();
    if (!f.code.length) return false;
    const boxes = f.code.filter(el => el.maxLength === 1);   // 6 separate digit boxes
    if (boxes.length === code.length) boxes.forEach((el, i) => setNativeValue(el, code[i]));
    else setNativeValue(f.code[0], code);
    return true;
  }

  function clickSubmit() {
    let best = null, bestScore = 0;
    for (const b of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
      if (!visible(b) || b.disabled) continue;
      const txt = `${b.innerText || ''} ${b.value || ''} ${b.getAttribute('aria-label') || ''}`.toLowerCase();
      let s = 0;
      if (SUBMIT_TEXT.test(txt)) s += 5;
      if (b.type === 'submit')  s += 3;
      if (s > bestScore) { best = b; bestScore = s; }
    }
    if (best) { best.click(); return true; }
    return false;
  }

  /* TestMail format: {namespace}.{tag}@inbox.testmail.app
     → the tag carries the randomness; every unique tag lands in gti43 */
  function makeEmail(ns, prefix) {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => chars[b % chars.length]).join('');
    const tag = (prefix || 'qwen') + rnd(8);
    return { email: `${ns || 'gti43'}.${tag}@inbox.testmail.app`, tag };
  }

  /* ---- AUTO MODE: fills whenever a signup form appears ---- */
  let sessionEmail = null;

  async function autoTick() {
    const cfg = await browser.storage.local.get(['autofill','autosubmit','password','namespace','tag']);
    if (!cfg.autofill) return;
    const el = classify().email[0];
    if (!el || el.value.trim()) return;                                   // already filled → don't clobber
    if (!SIGNUP_CTX.test(containerOf(el).innerText || '')) return;        // don't hijack the login form
    if (!sessionEmail) {
      const gen = makeEmail(cfg.namespace, cfg.tag);
      sessionEmail = gen.email;
      browser.storage.local.set({ lastEmail: gen.email, lastTag: gen.tag });
    }
    fillForm({ email: sessionEmail, password: cfg.password });
    if (cfg.autosubmit) setTimeout(clickSubmit, 400);
  }

  let queued = false;
  const queue = () => { if (queued) return; queued = true;
    setTimeout(() => { queued = false; autoTick(); }, 300); };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(autoTick, 2000);
  autoTick();

  /* ---- commands from the popup ---- */
  browser.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (!msg?.type) return;
    if (msg.type === 'FILL') {
      const did = fillForm(msg);
      if (msg.autosubmit) setTimeout(clickSubmit, 300);
      sendResponse({ ok: true, filled: did });
    } else if (msg.type === 'FILL_CODE') {
      const ok = fillCode(msg.code);
      if (ok && msg.autosubmit) setTimeout(clickSubmit, 700);
      sendResponse({ ok });
    } else if (msg.type === 'PING') {
      sendResponse({ ok: true, hasEmailField: !!classify().email[0] });
    }
  });
})();