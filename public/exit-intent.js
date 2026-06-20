/**
 * Exit intent modal — fires once per session when cursor leaves viewport upward.
 * Submits to /api/submit-form with source attribution set to 'exit-intent'.
 */
(function () {
  const SESSION_KEY = 'plg_exit_shown';
  if (sessionStorage.getItem(SESSION_KEY)) return;

  // Don't show on thank-you, welcome-video, or gbp-access pages
  const skip = ['/thank-you', '/welcome-video', '/gbp-access', '/downloads'];
  if (skip.some(p => location.pathname.startsWith(p))) return;

  // ── Build modal DOM ──────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'exit-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'exit-title');
  overlay.innerHTML = `
    <div id="exit-modal">
      <button id="exit-close" aria-label="Close">&times;</button>
      <p class="exit-eyebrow">Before you go</p>
      <h2 id="exit-title">Find out why your competitors rank above you — free.</h2>
      <p class="exit-sub">Takes 30 seconds. Adam reviews every submission personally and sends your audit within 24 hours.</p>
      <form id="exit-form" novalidate>
        <input type="text" name="businessName" placeholder="Business name" required autocomplete="organization">
        <input type="email" name="email" placeholder="Your email" required autocomplete="email">
        <button type="submit" id="exit-submit">Get My Free Audit &rarr;</button>
        <p id="exit-msg" aria-live="polite"></p>
      </form>
      <p class="exit-trust">&#9733; 5.0 on Google &middot; No contracts &middot; Results in 30 days</p>
    </div>
  `;

  // ── Styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #exit-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.72);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: exitFadeIn 0.22s ease;
    }
    @keyframes exitFadeIn { from { opacity:0 } to { opacity:1 } }
    #exit-modal {
      background: #fff; border-radius: 12px;
      padding: 40px 36px 32px;
      max-width: 460px; width: 100%;
      position: relative;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      animation: exitSlideUp 0.25s ease;
    }
    @keyframes exitSlideUp { from { transform:translateY(16px); opacity:0 } to { transform:translateY(0); opacity:1 } }
    #exit-close {
      position: absolute; top: 14px; right: 16px;
      background: none; border: none; font-size: 22px;
      color: #999; cursor: pointer; line-height: 1; padding: 4px 8px;
    }
    #exit-close:hover { color: #333; }
    .exit-eyebrow {
      font-size: 11px; font-weight: 700; letter-spacing: 1.2px;
      text-transform: uppercase; color: #0ea5e9; margin: 0 0 10px;
    }
    #exit-title {
      font-size: 22px; font-weight: 800; color: #0f172a;
      line-height: 1.25; margin: 0 0 10px;
    }
    .exit-sub {
      font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 20px;
    }
    #exit-form { display: flex; flex-direction: column; gap: 10px; }
    #exit-form input {
      border: 1.5px solid #e2e8f0; border-radius: 7px;
      padding: 12px 14px; font-size: 15px; color: #0f172a;
      outline: none; transition: border-color 0.15s;
      font-family: inherit;
    }
    #exit-form input:focus { border-color: #0ea5e9; }
    #exit-submit {
      background: #0ea5e9; color: #fff; border: none;
      border-radius: 7px; padding: 14px; font-size: 15px;
      font-weight: 700; cursor: pointer; transition: background 0.15s;
      font-family: inherit; margin-top: 2px;
    }
    #exit-submit:hover { background: #0284c7; }
    #exit-submit:disabled { background: #93c5fd; cursor: default; }
    #exit-msg { font-size: 13px; text-align: center; margin: 4px 0 0; min-height: 18px; }
    #exit-msg.success { color: #16a34a; }
    #exit-msg.error   { color: #dc2626; }
    .exit-trust {
      text-align: center; font-size: 12px; color: #94a3b8;
      margin: 16px 0 0;
    }
    @media (max-width: 480px) {
      #exit-modal { padding: 32px 20px 24px; }
      #exit-title { font-size: 19px; }
    }
  `;

  // ── Inject ───────────────────────────────────────────────────────────────
  function showModal() {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    overlay.querySelector('input[name="businessName"]').focus();
    bindEvents();
  }

  function dismiss() {
    overlay.remove();
    style.remove();
  }

  function bindEvents() {
    document.getElementById('exit-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); }, { once: true });
    document.getElementById('exit-form').addEventListener('submit', handleSubmit);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('exit-submit');
    const msg = document.getElementById('exit-msg');
    const businessName = form.businessName.value.trim();
    const email = form.email.value.trim();

    if (!businessName || !email) {
      msg.textContent = 'Please fill in both fields.';
      msg.className = 'error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    msg.textContent = '';
    msg.className = '';

    try {
      const res = await fetch('/api/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          email,
          name: businessName,
          pagePath: location.pathname,
          pageUrl: location.href,
          referrer: document.referrer,
          attribution: { utm_source: 'exit-intent', utm_medium: 'modal' }
        })
      });

      if (res.ok) {
        msg.textContent = "Got it — you'll hear from Adam within 24 hours.";
        msg.className = 'success';
        btn.textContent = 'Sent!';
        setTimeout(dismiss, 2800);
        if (typeof gtag !== 'undefined') {
          gtag('event', 'exit_intent_conversion', { event_category: 'lead', event_label: businessName });
        }
      } else {
        throw new Error('Server error');
      }
    } catch {
      msg.textContent = 'Something went wrong. Email adam@primelocalgrowth.com directly.';
      msg.className = 'error';
      btn.disabled = false;
      btn.textContent = 'Get My Free Audit →';
    }
  }

  // ── Trigger: mouse leaves toward top of viewport ─────────────────────────
  let triggered = false;
  function onMouseOut(e) {
    if (triggered) return;
    if (e.clientY <= 8 && !e.relatedTarget) {
      triggered = true;
      document.removeEventListener('mouseout', onMouseOut);
      showModal();
    }
  }

  // Small delay so the listener doesn't fire immediately on page load
  setTimeout(() => {
    document.addEventListener('mouseout', onMouseOut);
  }, 3000);

  // Mobile fallback: show after 40 seconds of inactivity on the page
  let mobileTimer;
  function resetTimer() { clearTimeout(mobileTimer); mobileTimer = setTimeout(showModal, 40000); }
  if ('ontouchstart' in window) {
    ['touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
  }
})();
