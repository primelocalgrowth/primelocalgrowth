const PLG_GA4_ID = 'G-NWC3DC78Y8';
const PLG_ATTRIBUTION_KEY = 'plg_attribution';

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag() {
  window.dataLayer.push(arguments);
};

function loadGa4() {
  const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${PLG_GA4_ID}"]`);
  if (!existingScript) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${PLG_GA4_ID}`;
    document.head.appendChild(script);
  }

  const hasExistingConfig = Array.isArray(window.dataLayer) && window.dataLayer.some(item => (
    Array.isArray(item) && item[0] === 'config' && item[1] === PLG_GA4_ID
  ));

  if (!window.__plgAnalyticsConfigured && !hasExistingConfig) {
    window.__plgAnalyticsConfigured = true;
    window.gtag('js', new Date());
    window.gtag('config', PLG_GA4_ID, {
      page_title: document.title,
      page_location: window.location.href,
      page_path: window.location.pathname
    });
  } else {
    window.__plgAnalyticsConfigured = true;
  }
}

function getAttribution() {
  const params = new URLSearchParams(window.location.search);
  const trackedKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
  const attribution = {};

  trackedKeys.forEach(key => {
    const value = params.get(key);
    if (value) attribution[key] = value;
  });

  if (Object.keys(attribution).length) {
    attribution.landing_page = window.location.pathname;
    attribution.referrer = document.referrer || '';
    attribution.captured_at = new Date().toISOString();
    try {
      window.localStorage.setItem(PLG_ATTRIBUTION_KEY, JSON.stringify(attribution));
    } catch {
      window.__plgAttribution = attribution;
    }
    return attribution;
  }

  try {
    return JSON.parse(window.localStorage.getItem(PLG_ATTRIBUTION_KEY) || '{}');
  } catch {
    return window.__plgAttribution || {};
  }
}

function eventParams(extra = {}) {
  return {
    page_title: document.title,
    page_location: window.location.href,
    page_path: window.location.pathname,
    ...getAttribution(),
    ...extra
  };
}

window.plgTrack = function plgTrack(eventName, params = {}) {
  if (!eventName || typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, eventParams(params));
};

window.plgGetAttribution = getAttribution;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function trackClick(event) {
  const target = event.target.closest('a, button');
  if (!target) return;

  const label = cleanText(target.textContent || target.getAttribute('aria-label') || '');
  const href = target.href || '';
  const path = target.pathname || '';
  const lowerLabel = label.toLowerCase();
  const params = {
    link_text: label,
    link_url: href || undefined
  };

  if (href.startsWith('tel:')) {
    window.plgTrack('phone_click', params);
    return;
  }

  if (href.startsWith('mailto:')) {
    window.plgTrack('email_click', params);
    return;
  }

  if (path === '/free-visibility-audit' || lowerLabel.includes('free visibility audit')) {
    window.plgTrack('audit_cta_click', params);
  }

  if (lowerLabel.includes('breakdown') || lowerLabel.includes('video audit')) {
    window.plgTrack('video_audit_cta_click', params);
  }

  if (/build visibility|maintain visibility|grow locally/i.test(label)) {
    window.plgTrack('system_cta_click', { ...params, system_stage: label });
  }

  if (/cibolo|schertz|san-antonio|new-braunfels|universal-city|selma|live-oak/.test(window.location.pathname) && path === '/free-visibility-audit') {
    window.plgTrack('city_page_cta_click', params);
  }
}

function trackForms() {
  document.querySelectorAll('[data-score-form]').forEach(form => {
    form.addEventListener('submit', () => {
      const formData = new FormData(form);
      window.plgTrack('visibility_score_submit', {
        business_name: formData.get('businessName') || document.querySelector('#score-business')?.value || '',
        city: formData.get('city') || document.querySelector('#score-city')?.value || ''
      });
    });
  });

  document.querySelectorAll('[data-lead-form]').forEach(form => {
    form.addEventListener('submit', () => {
      window.plgTrack('lead_form_submit_attempt', {
        form_name: form.getAttribute('data-form-name') || 'visibility_audit'
      });
    }, { capture: true });
  });
}

function trackScrollDepth() {
  const sent = new Set();
  const depths = [50, 90];

  window.addEventListener('scroll', () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;

    const percent = Math.round((window.scrollY / scrollable) * 100);
    depths.forEach(depth => {
      if (percent >= depth && !sent.has(depth)) {
        sent.add(depth);
        window.plgTrack('scroll_depth', { percent_scrolled: depth });
      }
    });
  }, { passive: true });
}

function trackThankYouConversion() {
  if (window.location.pathname !== '/thank-you') return;
  const key = `plg_conversion_${new Date().toISOString().slice(0, 10)}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Continue tracking even if sessionStorage is blocked.
  }
  window.plgTrack('lead_form_conversion', {
    conversion_name: 'free_visibility_audit'
  });
}

loadGa4();
getAttribution();
document.addEventListener('click', trackClick);
document.addEventListener('DOMContentLoaded', () => {
  trackForms();
  trackScrollDepth();
  trackThankYouConversion();
});
