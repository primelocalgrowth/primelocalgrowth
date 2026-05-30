const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');
if (navToggle && navLinks && !navToggle.dataset.navBound) {
  navToggle.dataset.navBound = 'true';
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

const scoreForm = document.querySelector('[data-score-form]');
const scoreResult = document.querySelector('[data-score-result]');
if (scoreForm && scoreResult) {
  scoreForm.addEventListener('submit', event => {
    event.preventDefault();
    scoreResult.classList.add('show');
    scoreResult.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  });
}

const revealTargets = document.querySelectorAll('.card, .price-card, .problem-item, .result-card, .proof-image-card, .reviews-panel, .review-card, .review-proof-note, .proof-disclaimer, .audit-check, .faq-item, .cta-band, .score-tool, .compare-table, .form-trust');
revealTargets.forEach((element, index) => {
  element.classList.add('reveal-item');
  element.style.transitionDelay = `${Math.min(index % 6, 5) * 45}ms`;
});

if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach(element => revealObserver.observe(element));
} else {
  revealTargets.forEach(element => element.classList.add('visible'));
}

document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('pointermove', event => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  });
});

document.querySelectorAll('.btn').forEach(button => {
  button.addEventListener('pointermove', event => {
    if (prefersReducedMotion) return;
    const rect = button.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * 0.05;
    const y = (event.clientY - rect.top - rect.height / 2) * 0.08;
    button.style.transform = `translate(${x}px, ${y}px)`;
  });
  button.addEventListener('pointerleave', () => {
    button.style.transform = '';
  });
});

function animateNumber(element) {
  const raw = element.textContent.trim();
  const match = raw.match(/^([+]?)(\d+)(.*)$/);
  if (!match) return;
  const prefix = match[1];
  const target = Number(match[2]);
  const suffix = match[3];
  let startTime = null;
  const duration = 900;
  const tick = timestamp => {
    startTime ??= timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  element.textContent = `${prefix}0${suffix}`;
  requestAnimationFrame(tick);
}

if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const numberObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateNumber(entry.target);
        numberObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.result-kpi').forEach(element => numberObserver.observe(element));
}
