/**
 * PLG Cookie Consent — GDPR/PECR/CASL compliant
 * Gates GA4 loading behind explicit user consent.
 * Consent stored in localStorage for 365 days.
 */
(function () {
  const CONSENT_KEY = 'plg_cookie_consent';
  const CONSENT_EXPIRY_DAYS = 365;

  function getStoredConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.expires || Date.now() > parsed.expires) {
        localStorage.removeItem(CONSENT_KEY);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  }

  function storeConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        value,
        expires: Date.now() + CONSENT_EXPIRY_DAYS * 86400 * 1000,
        set_at: new Date().toISOString()
      }));
    } catch {}
  }

  function applyConsent(accepted) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: accepted ? 'granted' : 'denied'
      });
    }
    if (accepted && typeof window.loadGa4 === 'function') {
      window.loadGa4();
    }
  }

  function removeBanner(banner) {
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'plg-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = `
      <div class="plg-cookie-inner">
        <p class="plg-cookie-text">
          We use cookies to understand how visitors use our site (Google Analytics).
          Your data is never sold. <a href="/privacy" class="plg-cookie-link">Privacy Policy</a>
        </p>
        <div class="plg-cookie-actions">
          <button id="plg-cookie-accept" class="plg-cookie-btn plg-cookie-btn--accept">Accept</button>
          <button id="plg-cookie-decline" class="plg-cookie-btn plg-cookie-btn--decline">Decline</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #plg-cookie-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #0f1419;
        border-top: 2px solid #f59e0b;
        z-index: 99999;
        padding: 16px 20px;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.4);
      }
      .plg-cookie-inner {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .plg-cookie-text {
        margin: 0;
        font-family: Inter, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #cbd5e1;
        flex: 1;
        min-width: 200px;
      }
      .plg-cookie-link {
        color: #f59e0b;
        text-decoration: underline;
      }
      .plg-cookie-actions {
        display: flex;
        gap: 10px;
        flex-shrink: 0;
      }
      .plg-cookie-btn {
        font-family: Inter, sans-serif;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        white-space: nowrap;
      }
      .plg-cookie-btn--accept {
        background: #f59e0b;
        color: #0f1419;
      }
      .plg-cookie-btn--accept:hover { background: #d97706; }
      .plg-cookie-btn--decline {
        background: transparent;
        color: #8899b0;
        border: 1px solid #374151;
      }
      .plg-cookie-btn--decline:hover { color: #cbd5e1; border-color: #6b7280; }
      @media (max-width: 480px) {
        .plg-cookie-inner { flex-direction: column; align-items: flex-start; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('plg-cookie-accept').addEventListener('click', function () {
      storeConsent('accepted');
      applyConsent(true);
      removeBanner(banner);
    });

    document.getElementById('plg-cookie-decline').addEventListener('click', function () {
      storeConsent('declined');
      applyConsent(false);
      removeBanner(banner);
    });
  }

  // Set GA4 default consent to denied before any script loads
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    wait_for_update: 500
  });

  const stored = getStoredConsent();
  if (stored === 'accepted') {
    applyConsent(true);
  } else if (stored === 'declined') {
    applyConsent(false);
  } else {
    // No prior consent — show banner after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createBanner);
    } else {
      createBanner();
    }
  }
})();
