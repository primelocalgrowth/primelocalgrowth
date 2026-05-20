# Production Deployment Checklist

## Phase 1: Environment Setup ✅ COMPLETE
- [x] Refactored email utilities (api/utils/email.js)
- [x] Removed duplicate email code (~300 lines)
- [x] Updated all 4 API handlers to use centralized utilities
- [x] Fixed broken dashboard link
- [x] Added review request automation
- [x] All code committed to main branch

## Phase 2: Testing — BLOCKED (Missing Credentials)

### 2A: Form Submission Testing ✅ VERIFIED
**Status**: Confirmed working — received test email  
**Verification**: ✅ Email arrived at adam@primelocalgrowth.com + auto-reply sent

---

### 2B: Stripe Webhook Testing ⚠️ BLOCKED

**What's needed**: `STRIPE_WEBHOOK_SECRET` environment variable

**How to get it**:
1. Stripe Dashboard → Developers → Webhooks
2. Find endpoint: primelocalgrowth.com/api/stripe-webhook
3. Get Signing secret (whsec_...)
4. Add to Vercel → Settings → Environment Variables
5. Redeploy: npx vercel --prod

**Test command** (after setup):
```bash
export STRIPE_WEBHOOK_SECRET="whsec_..."
bash TEST-STRIPE-WEBHOOK.sh
```

---

### 2C: Beehiiv Automations ⚠️ BLOCKED

**Manual verification required**:
1. Beehiiv Dashboard → Automations
2. Check for: Newsletter Welcome, Customer Onboarding, Review Request
3. Verify triggers and email templates
4. Review Request automation NOT YET CREATED (need to set up)

---

### 2D: Blueprint Delivery Testing ⚠️ NEEDS REAL PAYMENT

Test with real Stripe payment (test card: 4242 4242 4242 4242)

---

### 2E: Newsletter Subscription Testing ⚠️ PARTIAL

- [x] Form endpoint works
- [ ] Beehiiv welcome email verified
- [ ] Mobile rendering tested

---

## Phase 3: Pre-Production Checklist

- [ ] Stripe webhook secret added to Vercel
- [ ] Stripe webhook test passes
- [ ] Beehiiv automations verified
- [ ] Blueprint delivery tested
- [ ] All emails tested on mobile
- [ ] Form triggers all emails

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Code refactoring | ✅ Complete | Email utilities centralized |
| Form submission | ✅ Tested | Confirmed working |
| Stripe webhook | ⚠️ Blocked | Needs credential |
| Beehiiv automations | ⚠️ Blocked | Needs verification |
| Blueprint delivery | ⚠️ Untested | Needs real payment |
| Newsletter signup | ⚠️ Partial | Endpoint works |

---

## Next Actions

1. Add STRIPE_WEBHOOK_SECRET to Vercel (5 min)
2. Redeploy: npx vercel --prod (2 min)
3. Run webhook test (1 min)
4. Verify Beehiiv automations in dashboard (10 min)
5. Test blueprint delivery with real payment (5 min)
6. Monitor first 24 hours

---

## Links

- Vercel: https://vercel.com/adamrome/primelocalgrowth-website/settings/environment-variables
- Stripe: https://dashboard.stripe.com/webhooks
- Beehiiv: https://app.beehiiv.com/automations
