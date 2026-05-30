const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

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
      button.disabled = false;
      button.textContent = originalText;
    }
  });
});
