(function () {
  const STARS = '&#9733;&#9733;&#9733;&#9733;&#9733;';

  function renderCard(rv) {
    const text = rv.text
      ? rv.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : '';
    const short = text.length > 180 ? text.slice(0, 180).trimEnd() + '&hellip;' : text;
    return `<article class="review-card">
      <div class="stars" aria-label="${rv.rating} out of 5 stars">${STARS}</div>
      <p>&ldquo;${short}&rdquo;</p>
      <span>${rv.author} &middot; Google review, ${rv.time}</span>
    </article>`;
  }

  async function loadReviews() {
    const containers = document.querySelectorAll('[data-live-reviews]');
    if (!containers.length) return;

    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.configured || !data.reviews || !data.reviews.length) return;

      const html = data.reviews.map(renderCard).join('');
      containers.forEach(el => {
        el.innerHTML = html;
      });

      const ratingEls = document.querySelectorAll('[data-live-rating]');
      if (data.rating && ratingEls.length) {
        ratingEls.forEach(el => { el.textContent = data.rating.toFixed(1) + ' ★'; });
      }
    } catch (_) {
      // Silently fall back to static content
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadReviews);
  } else {
    loadReviews();
  }
})();
