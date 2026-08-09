// Vercel Analytics & Speed Insights - Modern initialization using inject() method
// Following the official Vercel documentation for Vite projects
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel Web Analytics
inject();

// Initialize Vercel Speed Insights
injectSpeedInsights();

// Custom event tracking helper for Prime Local Growth
// This provides a convenient wrapper for tracking custom events
window.plgVercelTrack = function (name, properties) {
  if (!name) return;
  
  // Clean properties to ensure only valid types are sent
  const cleanedProperties = {};
  if (properties && typeof properties === 'object') {
    Object.keys(properties).forEach(function (key) {
      const value = properties[key];
      if (value == null || ['string', 'number', 'boolean'].indexOf(typeof value) !== -1) {
        cleanedProperties[key] = value;
      }
    });
  }
  
  // Track the event using Vercel Analytics
  if (typeof window.va === 'function') {
    window.va('event', {
      name: name,
      data: cleanedProperties
    });
  }
};

// Set up automatic tracking for key user interactions
document.addEventListener('click', function (event) {
  const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
  if (!link) return;
  
  const href = link.getAttribute('href') || '';
  const text = (link.textContent || '').trim().slice(0, 80);
  
  // Track audit CTA clicks
  if (/free-visibility-audit|Get.*Audit|Audit/i.test(href + ' ' + text)) {
    window.plgVercelTrack('Audit CTA Click', {
      href: href,
      label: text,
      path: window.location.pathname
    });
  }
  
  // Track phone clicks
  if (href.indexOf('tel:') === 0) {
    window.plgVercelTrack('Phone Click', { path: window.location.pathname });
  }
  
  // Track email clicks
  if (href.indexOf('mailto:') === 0) {
    window.plgVercelTrack('Email Click', { path: window.location.pathname });
  }
});
