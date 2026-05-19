/**
 * PHASE 1: Critical UX/Conversion Fixes
 * - Form validation & feedback
 * - Loading states
 * - Error messaging
 * - Touch target expansion
 * - Focus states
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all forms
  const forms = document.querySelectorAll('form[data-form], form[id*="form"]');
  forms.forEach(form => {
    setupFormHandling(form);
    ensureFormAccessibility(form);
  });
  
  // Fix touch targets and focus visibility
  ensureTouchTargets();
  addFocusVisibility();
  
  // Add aria-live regions for feedback
  addFeedbackRegions();
});

/**
 * Setup form submission handling with loading state
 */
function setupFormHandling(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorContainer = form.querySelector('[role="alert"]') || createErrorContainer(form);
    const statusContainer = form.querySelector('[aria-live="polite"]') || createStatusContainer(form);
    
    // Validate required fields
    const requiredFields = form.querySelectorAll('[required]');
    const errors = [];
    
    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        errors.push(`${field.labels[0]?.textContent || 'This field'} is required`);
        field.setAttribute('aria-invalid', 'true');
      } else {
        field.removeAttribute('aria-invalid');
      }
    });
    
    // Show validation errors
    if (errors.length > 0) {
      errorContainer.innerHTML = `<ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
      errorContainer.classList.add('visible');
      return;
    }
    
    errorContainer.classList.remove('visible');
    
    // Show loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';
    
    try {
      const formData = new FormData(form);
      const response = await fetch('/api/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData))
      });
      
      if (response.ok) {
        // Success state
        statusContainer.innerHTML = '✓ Submitted! Check your email in a moment.';
        statusContainer.className = 'form-status success';
        form.style.display = 'none';
        
        // Redirect after 2 seconds
        setTimeout(() => {
          window.location.href = '/thank-you';
        }, 2000);
      } else {
        throw new Error('Submission failed');
      }
    } catch (err) {
      // Error state
      statusContainer.innerHTML = '⚠ Something went wrong. Please try again.';
      statusContainer.className = 'form-status error';
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

/**
 * Ensure all form fields have proper labels and aria attributes
 */
function ensureFormAccessibility(form) {
  const inputs = form.querySelectorAll('input, textarea, select');
  
  inputs.forEach(input => {
    // Ensure label exists
    const label = input.labels?.[0];
    if (!label) {
      console.warn('Input missing label:', input.id);
      return;
    }
    
    // Add required indicator
    if (input.required && !label.querySelector('[aria-label="required"]')) {
      const requiredSpan = document.createElement('span');
      requiredSpan.setAttribute('aria-label', 'required');
      requiredSpan.textContent = ' *';
      label.appendChild(requiredSpan);
    }
    
    // Add aria attributes
    input.setAttribute('aria-required', input.required.toString());
    input.setAttribute('aria-describedby', `${input.id}-desc`);
  });
}

/**
 * Create error container if not present
 */
function createErrorContainer(form) {
  const container = document.createElement('div');
  container.setAttribute('role', 'alert');
  container.className = 'form-errors';
  container.setAttribute('aria-live', 'polite');
  form.insertBefore(container, form.firstChild);
  return container;
}

/**
 * Create status/feedback container
 */
function createStatusContainer(form) {
  const container = document.createElement('div');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  container.className = 'form-status';
  form.appendChild(container);
  return container;
}

/**
 * Ensure all buttons/links meet 44x44px touch target minimum
 */
function ensureTouchTargets() {
  const interactiveElements = document.querySelectorAll('button, a[role="button"], a.btn');
  
  interactiveElements.forEach(el => {
    // Get computed dimensions
    const rect = el.getBoundingClientRect();
    const height = rect.height;
    const width = rect.width;
    
    // If element is too small, add padding or hitSlop class
    if (height < 44 || width < 44) {
      el.classList.add('touch-expand');
      // CSS rule: .touch-expand::before { inset: -8px; }
    }
  });
}

/**
 * Add visible focus rings for keyboard navigation
 */
function addFocusVisibility() {
  const style = document.createElement('style');
  style.textContent = `
    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--amber, #0ea5e9);
      outline-offset: 2px;
    }
    
    /* Forms feedback styling */
    .form-errors {
      display: none;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid #ef4444;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      color: #fca5a5;
      font-size: 14px;
    }
    
    .form-errors.visible {
      display: block;
    }
    
    .form-errors ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    
    .form-errors li {
      margin: 4px 0;
    }
    
    .form-status {
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
      font-weight: 600;
    }
    
    .form-status.success {
      background: rgba(34, 197, 94, 0.1);
      color: #86efac;
      border: 1px solid #22c55e;
    }
    
    .form-status.error {
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
      border: 1px solid #ef4444;
    }
    
    /* Loading spinner */
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Touch target expansion */
    .touch-expand {
      position: relative;
    }
    
    .touch-expand::before {
      content: '';
      position: absolute;
      inset: -8px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Add aria-live regions for form feedback
 */
function addFeedbackRegions() {
  // Check if main landmark exists for focus management
  if (!document.querySelector('main')) {
    const main = document.createElement('main');
    document.body.insertBefore(main, document.body.firstChild);
  }
}

// Export for use in other scripts
window.formHelpers = {
  setupFormHandling,
  ensureFormAccessibility,
  ensureTouchTargets,
  addFocusVisibility
};
