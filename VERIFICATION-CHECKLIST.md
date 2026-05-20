# Verification Checklist

## ✅ Completed This Session

- [x] Refactored email utilities - centralized 5 core functions
- [x] Eliminated ~300 lines of duplicate email code
- [x] Updated all 4 API handlers to use shared utilities
- [x] Removed broken dashboard link
- [x] Created sendReviewRequest() function
- [x] Tested form submission endpoint (received email ✓)
- [x] Created comprehensive audit documentation
- [x] Created Stripe webhook test script

---

## 🔍 Manual Testing Required

### 1. Form Submission Flow
```bash
curl -X POST https://primelocalgrowth.com/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "512-555-0123",
    "businessType": "HVAC"
  }'
```

**Verify**:
- [ ] Receives HTTP 200 response
- [ ] Email arrives to adam@primelocalgrowth.com (lead notification)
- [ ] Email arrives to test@example.com (auto-reply)
- [ ] Lead appears in Google Sheets within 1 minute
- [ ] Contact appears in Beehiiv dashboard

**Status**: ✅ VERIFIED (received test email)

---

### 2. Stripe Webhook Flow
```bash
# Set webhook secret first
export STRIPE_WEBHOOK_SECRET="whsec_test_..."

# Run test script
bash TEST-STRIPE-WEBHOOK.sh
```

**Verify**:
- [ ] Webhook returns HTTP 200
- [ ] Welcome email arrives (to customer)
- [ ] Onboarding checklist email arrives (to customer)
- [ ] Admin notification arrives (to adam@)
- [ ] Customer appears in Beehiiv with "customer" tag

**Status**: ⚠️ NEEDS TESTING

---

### 3. Blueprint Delivery Flow
1. Go to primelocalgrowth.com, select a blueprint to purchase
2. Complete Stripe checkout

**Verify**:
- [ ] Delivery email arrives with download buttons
- [ ] PDF links are functional
- [ ] Upsell email appears (if single blueprint)

**Status**: ⚠️ NEEDS TESTING

---

### 4. Newsletter Subscription
1. Go to primelocalgrowth.com/newsletter
2. Enter name and email
3. Submit form

**Verify**:
- [ ] Redirect to /thank-you page
- [ ] Subscriber appears in Beehiiv dashboard
- [ ] Beehiiv welcome email is sent

**Status**: ⚠️ PARTIAL (form works, Beehiiv not confirmed)

---

### 5. Beehiiv Automation Sequences
1. Log into Beehiiv dashboard
2. Check Automations section

**Verify**:
- [ ] Newsletter automation exists (auto-sends welcome email)
- [ ] Lead nurture sequence exists (if configured)
- [ ] Customer onboarding automation exists (trigger: Stripe webhook)
- [ ] Review request automation exists (trigger: 7 days after tag)

**Status**: ❌ NEEDS VERIFICATION

---

## 📋 Beehiiv Setup Checklist

### Newsletter Welcome Automation
- [ ] Exists in Beehiiv
- [ ] Trigger: Subscribe to publication
- [ ] Action: Send email
- [ ] Timing: Immediate
- [ ] Email: "The Local Edge welcome" (verify it exists)

### Lead Nurture Sequence (Optional)
- [ ] Exists in Beehiiv
- [ ] Trigger: Tag = "cold-leads" or "lead"
- [ ] Action: Email sequence (Day 0, 3, 7, 14)
- [ ] Purpose: Convert leads to $297/mo starter plan

### Customer Onboarding
- [ ] Exists in Beehiiv
- [ ] Trigger: Tag = "customer"
- [ ] Day 0: Welcome email (sent by Stripe webhook)
- [ ] Day 7: Review request email
- [ ] Purpose: Activate and retain customers

---

## 🚨 Known Issues & Fixes

| Issue | Status | Fix |
|-------|--------|-----|
| Broken dashboard link | ✅ FIXED | Removed from notifyAdamOfLead |
| Missing review automation | ⚠️ PARTIAL | Created email function, need Beehiiv automation |
| No unsubscribe footer | ⚠️ TODO | Add to all transactional emails |
| Stripe webhook untested | ⚠️ TODO | Run TEST-STRIPE-WEBHOOK.sh |
| Beehiiv not verified | ⚠️ TODO | Check dashboard for automations |

---

## 📊 Monitoring Plan

Once all tests pass:

1. **Daily** (first week): Check error logs in Vercel
   - Monitor for failed email sends
   - Check for Beehiiv API errors
   - Verify Stripe webhook processing

2. **Weekly** (after first week):
   - Review customer feedback
   - Check form-to-conversion metrics
   - Audit Beehiiv bounce rates

3. **Monthly**:
   - Email performance report (open rate, click rate)
   - Automation completion rate (% of leads converted)
   - Review request response rate

---

## 🎯 Success Criteria

All of the following must be true to consider this "production ready":

- [x] Code is deployed to production
- [x] Form submissions trigger emails
- [ ] Stripe webhooks trigger emails
- [ ] All Beehiiv automations are verified
- [ ] Customer emails render correctly on mobile
- [ ] No false 500 errors in production logs
- [ ] At least 1 complete end-to-end test (form → payment → delivery)

---

## 🔗 Quick Links

- **Vercel Dashboard**: https://vercel.com/adamrome
- **Beehiiv Dashboard**: https://app.beehiiv.com/
- **Stripe Dashboard**: https://dashboard.stripe.com/
- **Production Site**: https://primelocalgrowth.com
- **API Status**: https://primelocalgrowth.com/api/submit-form (POST only)

---

## 📞 Support

If tests fail:

1. Check Vercel logs: `vercel logs --follow`
2. Check Beehiiv failed emails: Dashboard → Automations → Failed
3. Check Stripe webhook delivery: Dashboard → Developers → Webhooks → Endpoint logs
4. Verify env vars are set: `vercel env list`

