(function () {
const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');
if (navToggle && navLinks && !navToggle.dataset.navBound) {
  navToggle.dataset.navBound = 'true';
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

document.querySelectorAll('[data-lead-form]').forEach(form => {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  if (!form.querySelector('[name="companyWebsite"]')) {
    const trap = document.createElement('div');
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
    trap.innerHTML = '<label>Company website <input name="companyWebsite" type="text" tabindex="-1" autocomplete="off"></label>';
    form.insertBefore(trap, button);
  }

  if (!form.querySelector('[name="marketingConsent"]')) {
    const consent = document.createElement('label');
    consent.className = 'plg-marketing-consent';
    consent.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin:14px 0;font-size:13px;line-height:1.45;color:#5F7268;text-transform:none;letter-spacing:0;font-weight:500;';
    consent.innerHTML = '<input name="marketingConsent" type="checkbox" value="true" style="width:17px;height:17px;margin-top:2px;flex:0 0 auto;"> <span>Yes, send me occasional local visibility tips. Optional. Unsubscribe anytime.</span>';
    form.insertBefore(consent, button);
  }
});

document.querySelectorAll('[data-lead-form] input:not([type="hidden"]):not([type="checkbox"])').forEach(input => {
  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (!value) {
      input.classList.remove('input-valid', 'input-invalid');
      return;
    }
    const valid = input.type === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      : input.checkValidity();
    input.classList.toggle('input-valid', valid);
    input.classList.toggle('input-invalid', !valid);
  });
});

document.querySelectorAll('[data-lead-form]').forEach(form => {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = form.querySelector('.form-feedback');
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    const data = Object.fromEntries(new FormData(form).entries());
    data.phone = data.phone || '';
    data.city = data.city || '';
    data.businessType = data.businessType || 'local-service';
    data.marketingConsent = data.marketingConsent === 'true';
    data.pagePath = window.location.pathname;
    data.pageUrl = window.location.href;
    data.referrer = document.referrer || '';
    data.attribution = typeof window.plgGetAttribution === 'function' ? window.plgGetAttribution() : {};

    if (!data.email || !data.businessName) {
      feedback.textContent = 'Please fill in your email and business name.';
      feedback.className = 'form-feedback form-feedback--error';
      return;
    }

    button.disabled = true;
    button.textContent = 'Sending...';
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    if (typeof window.plgVercelTrack === 'function') {
      window.plgVercelTrack('Lead Form Submit Attempt', {
        form_name: form.getAttribute('data-form-name') || 'visibility_audit',
        city: data.city,
        business_type: data.businessType,
        path: window.location.pathname
      });
    }

    try {
      const response = await fetch('/api/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Submission failed');
      feedback.textContent = 'Success. Check your email for next steps.';
      feedback.className = 'form-feedback form-feedback--success';
      if (typeof window.plgTrack === 'function') {
        window.plgTrack('lead_form_submit_success', {
          form_name: form.getAttribute('data-form-name') || 'visibility_audit',
          city: data.city,
          business_type: data.businessType
        });
      }
      if (typeof window.plgVercelTrack === 'function') {
        window.plgVercelTrack('Lead Form Submit Success', {
          form_name: form.getAttribute('data-form-name') || 'visibility_audit',
          city: data.city,
          business_type: data.businessType,
          path: window.location.pathname
        });
      }
      form.reset();
      setTimeout(() => { window.location.href = '/thank-you'; }, 900);
    } catch {
      feedback.textContent = 'Something went wrong. Please email adam@primelocalgrowth.com.';
      feedback.className = 'form-feedback form-feedback--error';
      if (typeof window.plgTrack === 'function') {
        window.plgTrack('lead_form_submit_error', {
          form_name: form.getAttribute('data-form-name') || 'visibility_audit'
        });
      }
      if (typeof window.plgVercelTrack === 'function') {
        window.plgVercelTrack('Lead Form Submit Error', {
          form_name: form.getAttribute('data-form-name') || 'visibility_audit',
          path: window.location.pathname
        });
      }
      button.disabled = false;
      button.textContent = originalText;
    }
  });
});
})();
