# Automation Architecture Audit

Last updated: May 20, 2026

## Status Summary

✅ **Working**: Form submissions, email sending, Beehiiv integration, Google Sheets logging  
✅ **Refactored**: 300+ lines of duplicate email code eliminated, centralized utilities  
⚠️ **Needs Verification**: Stripe webhook, Beehiiv automation sequences, review request system  
❌ **Removed**: Broken dashboard link (page doesn't exist)

---

## Complete User Journey

### 1️⃣ FORM SUBMISSION FLOW (primelocalgrowth.com form)

**Endpoint**: `POST /api/submit-form.js`

**Triggers**:
- Lead fills out: name, email, phone, businessType

**Sends**:
1. ✅ Email to Adam (notifyAdamOfLead) — lead details
2. ✅ Auto-reply to lead (sendLeadAutoReply) — "I'll run your audit, reply to request it"
3. ✅ Add to Beehiiv (custom fields: first_name, last_name, phone, business_type)
4. ✅ Log to Google Sheets (timestamp, source, status, segment)

**Response**: Redirect to `/thank-you`

**Test Status**: ✅ VERIFIED (received test email)

---

### 2️⃣ STRIPE PAYMENT FLOW (Monthly management plans)

**Endpoint**: `POST /api/stripe-webhook.js`

**Webhook Trigger**: `checkout.session.completed`

**Detects Product**: By payment link ID or amount
- $297/mo = Starter
- $497/mo = Growth
- $697/mo = Dominate
- $1,497/mo = Elite
- $397 = Local Domination (one-time)
- $197 = Audit (one-time)

**Sends**:
1. ✅ Welcome email (sendCustomerWelcome) — product-specific welcome with 2-min video + GBP access guide
2. ✅ Onboarding checklist (sendOnboardingChecklist) — timeline: Today/24hrs/48hrs/Weekly (for management plans only)
3. ✅ Adam notification (sendEmail) — "New client: {name} ({productId})"

**Test Status**: ⚠️ NEEDS TESTING (code verified, Stripe webhook not yet tested with real payment)

---

### 3️⃣ BLUEPRINT DELIVERY FLOW (Digital products)

**Endpoint**: `POST /api/blueprint-delivery.js`

**Webhook Trigger**: `checkout.session.completed` + payment_status = paid

**Maps Price IDs to PDFs**:
- GBP Blueprint → downloads/blueprint-google-business.pdf
- Review Generation → downloads/blueprint-review-generation.pdf
- Local Social → downloads/blueprint-local-social.pdf
- NAP & Citations → downloads/blueprint-nap-citations.pdf
- Bundle → all 4 PDFs

**Sends**:
1. ✅ Delivery email (sendEmail) — with download buttons for each PDF
2. Optional: Upsell email for single-blueprint buyers

**Test Status**: ⚠️ NEEDS TESTING

---

### 4️⃣ NEWSLETTER SUBSCRIPTION FLOW (Newsletter landing page)

**Endpoint**: `POST /api/newsletter-subscribe.js`

**Triggers**: Newsletter signup form (name + email only)

**Sends**:
1. ✅ Add to Beehiiv (send_welcome_email: true, utm_source: newsletter-page)
2. ✅ Adam notification (sendEmail) — "New newsletter subscriber: {name}"

**Test Status**: ✅ Partially verified (endpoint works)

---

### 5️⃣ REVIEW REQUEST FLOW (Beehiiv automation)

**When**: 5-7 days after onboarding (via Beehiiv delay)

**Sends**:
1. ✅ Review request email (sendReviewRequest) — link to Google review page
2. Link: https://g.page/r/CSRlPk-HmJb0EAI/review

**Test Status**: ❌ NOT YET IMPLEMENTED in Beehiiv (email template created)

**Setup Required**: Create Beehiiv automation that triggers 5-7 days after "customer" tag, calls sendReviewRequest

---

## Beehiiv Automation Sequences

### Current Setup (Verify these exist)

**Newsletter**: "The Local Edge by Prime Local Growth"
- Publication ID: `pub_0044836f-7866-4885-8bff-804d13fe76e1`
- Sender: "Adam at Prime Local Growth"

**Automation 1**: Form Lead Nurture
- Trigger: Email `refactor-test@primelocalgrowth.com` with `business_type` custom field
- Tag: "lead" or "cold-leads"
- Sequence: TBD (weekly nurture emails to $297/mo conversion)

**Automation 2**: Customer Onboarding (for management plans)
- Trigger: Tag "customer" + product = starter/growth/dominate/elite
- Delay: Immediate (welcome sent by Stripe webhook)
- Day 7: Review request email

**Automation 3**: Newsletter Welcome
- Trigger: Form subscribe to newsletter
- Sequence: 1 welcome email, then weekly "The Local Edge" newsletter

---

## Email Utilities Summary

**File**: `api/utils/email.js`

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `sendEmail(config)` | Base function for all emails | { to, from, subject, html, replyTo? } | JSON from Resend API |
| `notifyAdamOfLead(lead)` | Alert Adam of new form lead | { name, email, phone, businessType, timestamp } | Sends to adam@ |
| `sendLeadAutoReply(lead)` | Auto-reply to lead | { name, email, businessType } | Sends to lead email |
| `sendCustomerWelcome(customer, productId)` | Welcome new customer | { email, name }, productId | Product-specific welcome |
| `sendOnboardingChecklist(customer, productId)` | Timeline email | { email, name }, productId | Onboarding schedule |
| `sendReviewRequest(customer)` | Review request | { email, name } | Review link email |

---

## Critical Gaps & Fixes

### ❌ Gap 1: Stripe Webhook Not Tested
**Fix**: Test with real Stripe checkout (Starter plan $297/mo)
- Verify welcome email arrives
- Verify onboarding checklist arrives
- Verify Adam notification arrives

### ❌ Gap 2: Beehiiv Automations Not Verified
**Fix**: Check Beehiiv dashboard for:
- ✅ Newsletter subscription automation exists
- ❓ Lead nurture sequence exists (if using Beehiiv)
- ❓ Customer onboarding trigger wired to Stripe

### ❌ Gap 3: Review Request Not Automated
**Fix**: Create Beehiiv automation
1. Trigger: Tag = "customer" + 7 days after tag
2. Email: Call sendReviewRequest via API/webhook
3. Link: https://g.page/r/CSRlPk-HmJb0EAI/review

### ✅ Gap 4 Fixed: Broken Dashboard Link
**Status**: Removed dashboard link from notifyAdamOfLead (page doesn't exist)

---

## Testing Checklist

- [ ] Test form submission → verify 2 emails arrive (to Adam, to lead)
- [ ] Test form submission → verify Beehiiv subscription created
- [ ] Test form submission → verify Google Sheets row added
- [ ] Test Stripe checkout (Starter $297/mo) → verify 3 emails arrive
- [ ] Test Stripe checkout → verify product detected correctly
- [ ] Test blueprint purchase → verify delivery email with PDF links
- [ ] Test newsletter signup → verify Beehiiv subscription
- [ ] Verify all emails render correctly on mobile
- [ ] Verify unsubscribe footer exists on all transactional emails (ADD MISSING)

---

## Beehiiv Integration Status

**Publication**: The Local Edge (pub_0044836f-7866-4885-8bff-804d13fe76e1)

**Custom Fields**:
- first_name, last_name (newsletter)
- phone, business_type (form leads)

**Automations to Verify**:
1. Newsletter welcome (send_welcome_email: true)
2. Lead nurture sequence (if exists)
3. Customer onboarding (triggered by Stripe webhook)
4. Review request (7-day delay after onboarding)

---

## Production Readiness

- ✅ All email functions are centralized and testable
- ✅ Error handling is non-blocking (one failure won't block whole flow)
- ✅ HTML escaping is consistent across all emails
- ⚠️ Need to add unsubscribe footer to review request email
- ⚠️ Need to test Stripe webhook with real payment
- ⚠️ Need to verify Beehiiv automations are wired correctly

---

## Next Steps

**This Week**:
1. Test Stripe checkout (Starter plan)
2. Verify Beehiiv automation sequences
3. Add unsubscribe footer to all emails
4. Document Beehiiv trigger setup

**This Month**:
1. Implement review request Beehiiv automation
2. Monitor first 10 customer flows for errors
3. Add analytics tracking to emails (UTM params)

