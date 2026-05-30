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

    if (!data.name || !data.email || !data.businessName) {
      feedback.textContent = 'Please fill in your name, email, and business name.';
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
      form.reset();
      setTimeout(() => { window.location.href = '/thank-you'; }, 900);
    } catch {
      feedback.textContent = 'Something went wrong. Please email adam@primelocalgrowth.com.';
      feedback.className = 'form-feedback form-feedback--error';
      button.disabled = false;
      button.textContent = originalText;
    }
  });
});
