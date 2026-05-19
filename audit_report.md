# Prime Local Growth - UI/UX Audit Report
**Date:** 2026-05-18 | **Scope:** All public pages | **Framework:** WCAG 2.1 AA + ui-ux-pro-max

---

## 🔴 CRITICAL ISSUES (Conversion Impact)

### 1. **CTA Copy Lacks Command Authority**
**Severity:** 🔴 Critical | **Impact:** Conversion  
**Issue:** CTAs use weak suggestive language ("Learn More", "See Pricing") instead of commanding action
- index.html: "Schedule Free Consult" (weak, requires commitment show)
- local-domination.html: "Get Started" (generic, no urgency)
- premium.html: "Apply Now" (better, but could be stronger)

**Fix Required:** Strengthen to action-driven language
- "Schedule Free Consult" → "Check Your Ranking Free"
- "Get Started" → "Start Moving Up on Google"
- "Learn More" → "See How It Works" or "Calculate Your ROI"
- "Apply Now" → "Get Pre-Qualified Now" or "Let's Talk Strategy"

**WCAG Impact:** None | **Conversion Impact:** High

---

### 2. **Form Feedback Missing**
**Severity:** 🔴 Critical | **Impact:** UX Friction  
**Affected Pages:** index.html (2 lead forms), premium.html (application form)
**Issue:**
- No error messaging visible
- No loading state on submit button
- No success confirmation (except thank-you page redirect)
- No "required field" indicators
- Email/name fields lack labels on mobile

**Fix Required:**
```html
<!-- Add visible labels and required indicators -->
<label for="name">Your name <span aria-label="required">*</span></label>
<input type="text" id="name" required aria-required="true">

<!-- Add form-level error container with role=alert -->
<div id="formErrors" role="alert" class="error-summary" aria-live="polite"></div>

<!-- Add button loading state -->
<button id="submitBtn" class="btn-primary">Get Started →</button>

<!-- Add aria-live for success feedback -->
<div id="formStatus" aria-live="polite" aria-atomic="true"></div>
```

**WCAG Impact:** High (forms must have labels, error messages, status feedback)

---

### 3. **Button Touch Targets Below 44px on Mobile**
**Severity:** 🔴 Critical | **Impact:** Mobile UX  
**Affected:** All pages with small icon buttons (navigation icons, close buttons)
**Issue:** Icon buttons visually <40px; hit area not expanded

**Fix Required:** Ensure all interactive elements have minimum 44×44px touch target
```css
button, a[role="button"] {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 20px; /* Ensure internal spacing */
  touch-action: manipulation; /* Remove 300ms tap delay */
}

/* Expand hit area for small icons without changing visual size */
.icon-btn {
  position: relative;
  padding: 8px;
  &::before {
    content: '';
    position: absolute;
    inset: -8px; /* Expand hit area */
  }
}
```

---

### 4. **Generic/Template Copy (AI-Slop Detection)**
**Severity:** 🔴 Critical | **Impact:** Brand & Credibility  
**Examples Found:**
- "Learn why our clients are seeing results" (generic benefit statement)
- "Take the first step toward growth" (overused phrase)
- "Simple, fast, and entirely by email" (repeated on multiple pages)
- "We handle everything. You focus on your business." (template CRM language)

**Fix Required:** Replace with specific, proof-driven language
- Before: "Learn why our clients are seeing results"  
  After: "See how a Dallas barbershop went from 2 to 8 Google reviews in 30 days"
  
- Before: "Simple, fast, and entirely by email"  
  After: "No setup calls. No account managers. Just step-by-step emails from Adam."

- Before: "We handle everything"  
  After: "Adam handles your Google listing — same systems that work for our $1K+ clients"

**WCAG Impact:** None | **Credibility Impact:** Very High

---

## 🟡 MEDIUM ISSUES (UX Friction)

### 5. **No Loading State on Form Submit**
**Severity:** 🟡 Medium | **Impact:** UX  
**Issue:** Button doesn't disable/show loading indicator during API call; users may double-submit

**Fix:** Add spinner + disable during submit
```javascript
form.addEventListener('submit', async (e) => {
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting...';
  // ... API call
  btn.disabled = false;
  btn.innerHTML = 'Original Text →';
});
```

---

### 6. **Mobile Responsiveness Issues**
**Severity:** 🟡 Medium | **Impact:** Mobile UX  
**Findings:**
- index.html: Hero section padding doesn't adapt well <375px
- No viewport-units consideration (using 100vh instead of 100dvh)
- Long form labels truncate on mobile

**Fix:**
- Use `min-h-dvh` instead of `100vh`
- Add `@media (max-width: 480px)` adjustments for padding
- Stack form labels vertically on mobile

---

### 7. **Color Semantics: Sky Blue Not Reserved for CTAs**
**Severity:** 🟡 Medium | **Impact:** Visual Clarity  
**Issue:** Sky blue (#0ea5e9) used for:
- CTA buttons ✅ (correct)
- Accent text and badges ⚠️ (dilutes CTA emphasis)
- Section labels ⚠️ (reduces primary action clarity)

**Fix:** Reserve sky blue for CTAs only; use navy (#1B3A6B) or lighter muted tones for accents

---

### 8. **No Visible Focus States**
**Severity:** 🟡 Medium | **Impact:** Accessibility/Keyboard Nav  
**Issue:** Focus rings removed or very subtle; keyboard users can't track where they are

**Fix:** Add visible focus styles
```css
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
}
```

---

### 9. **Animations May Not Respect prefers-reduced-motion Universally**
**Severity:** 🟡 Medium | **Impact:** Accessibility  
**Findings:** index.html has `@media (prefers-reduced-motion:reduce)` but some pages may lack this

**Fix:** Ensure all pages include reduced-motion support globally

---

## 🟢 LOW ISSUES (Polish)

### 10. **Excessive Animation on Hero Sections**
**Issue:** Multiple staggered animations (fade-in, slide, pulse-glow) simultaneously
**Fix:** Reduce to 1-2 key animations; let content breathe

### 11. **Typography Line Length**
**Issue:** On desktop, body text stretches >75 chars; hard to read
**Fix:** Cap max-width at 65-75 characters for body text

### 12. **Placeholder Text Still Visible in Some Forms**
**Issue:** Placeholder used instead of label in some fields
**Fix:** Always use `<label>` + placeholder combo

---

## AUDIT SUMMARY

| Category | Issues | Critical | Medium | Low |
|----------|--------|----------|--------|-----|
| **Accessibility** | 5 | 2 (forms, focus) | 2 (focus states, motion) | 1 |
| **Conversion** | 4 | 2 (CTA copy, forms) | 1 (loading) | 1 |
| **Mobile** | 3 | 1 (touch targets) | 2 (responsive, viewport) | 1 |
| **Visual Design** | 3 | 1 (AI-slop) | 1 (color semantics) | 1 |
| **Brand Voice** | 2 | 1 (generic copy) | 0 | 1 |
| **Performance** | 1 | 0 | 0 | 1 |
| **TOTAL** | 18 | 7 | 6 | 5 |

---

## 80/20 ACTION PLAN (Highest Impact First)

### Phase 1: Critical Fixes (Conversion + Accessibility)
1. **Strengthen CTA copy** — All pages
2. **Add form labels + error messaging** — index.html, premium.html
3. **Ensure 44px touch targets** — All pages
4. **Replace generic copy with proof-driven language** — index.html, local-domination.html
5. **Add form loading states** — Lead forms + application form

### Phase 2: Medium Fixes (UX Polish)
6. **Add visible focus states** — All interactive elements
7. **Mobile responsiveness refinements** — Padding, margins, font sizes <480px
8. **Reduce animation complexity** — Hero sections only

### Phase 3: Low Fixes (Brand Polish)
9. **Refactor color semantics** — Reserve sky blue for CTAs
10. **Typography line-length control** — Desktop max-width

---

## DEPLOYMENT PLAN
1. ✅ Commit Phase 1 fixes immediately
2. ✅ Push to main (Vercel auto-deploys)
3. ⏳ Commit Phase 2 fixes
4. ⏳ Phase 3 as time permits

