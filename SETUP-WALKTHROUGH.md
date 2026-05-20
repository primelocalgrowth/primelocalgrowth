# Complete Setup Walkthrough (Manual Steps)

## Step 1: Get Stripe Webhook Secret (5 minutes)

**1. Open**: https://dashboard.stripe.com/webhooks
**2. Login** with your Stripe credentials
**3. Find** the webhook endpoint for: `https://primelocalgrowth.com/api/stripe-webhook`
**4. Click** the endpoint name/link
**5. Scroll to** "Signing secret" section
**6. Click** "Reveal" (or the copy icon)
**7. Copy** the full secret (starts with `whsec_`)
**8. Paste** into notepad temporarily

Example what you're looking for:
```
Signing secret
whsec_test_4eC39HqLyjWDarhtT1ZdV7DG
```

---

## Step 2: Add Secret to Vercel (3 minutes)

**1. Open**: https://vercel.com/adamrome/primelocalgrowth-website/settings/environment-variables
**2. Login** if needed
**3. Click** "+ Add New" button
**4. Fill in**:
   - Name: `STRIPE_WEBHOOK_SECRET`
   - Value: `whsec_...` (paste the secret from Step 1)
   - Environments: Check "Production", "Preview", "Development"
**5. Click** "Save"
**6. Wait** for environment variable to be created
**7. Click** "Redeploy" button that appears (or redeploy manually)

---

## Step 3: Test Stripe Webhook (1 minute)

**Back in Terminal:**
```bash
export STRIPE_WEBHOOK_SECRET="whsec_..."  # paste secret from Step 1
bash TEST-STRIPE-WEBHOOK.sh
```

**Expected output:**
```
✓ Webhook accepted

Expected emails:
  1. Welcome email → stripe-test@primelocalgrowth.com
  2. Onboarding checklist → stripe-test@primelocalgrowth.com
  3. Admin notification → adam@primelocalgrowth.com
```

Check email inbox within 30 seconds to verify.

---

## Step 4: Verify Beehiiv Automations (10 minutes)

**1. Open**: https://app.beehiiv.com/
**2. Login** with your Beehiiv credentials
**3. Select** publication: "The Local Edge by Prime Local Growth"
**4. Click** "Automations" in left sidebar
**5. Check** for these automations:

### ✅ Automation 1: Newsletter Welcome
- **Trigger**: Newsletter subscription (immediate)
- **Email**: "The Local Edge welcome"
- **Status**: Should be active
- **If missing**: Create it using copy from BEEHIIV_EMAIL_SEQUENCES.md

### ✅ Automation 2: Customer Onboarding (Optional - Stripe triggered)
- **Trigger**: Tag = "customer"
- **Emails**: Day 0 (welcome), Day 7 (review request)
- **Status**: Optional - only needed if using Beehiiv for post-purchase
- **Current approach**: Welcome + onboarding sent by Stripe webhook directly

### ❌ Automation 3: Review Request (NEEDS CREATION)
- **Trigger**: Tag = "customer" + 7 days after tag
- **Email**: Review request
- **Link**: https://g.page/r/CSRlPk-HmJb0EAI/review
- **Status**: NOT YET CREATED
- **Action needed**: Create this automation in Beehiiv

---

## Step 5: Test Forms & Flows (5-10 minutes each)

### Test Newsletter Subscription
1. Go to: https://primelocalgrowth.com/newsletter
2. Enter test name + email
3. Submit form
4. Verify:
   - [ ] Form accepted
   - [ ] Subscriber appears in Beehiiv dashboard (1 min delay)
   - [ ] Welcome email arrives in inbox (2 min delay)

### Test Form Submission
1. Go to: https://primelocalgrowth.com (main site)
2. Fill out lead form
3. Submit
4. Verify:
   - [ ] Redirect to /thank-you
   - [ ] Adam gets notification email
   - [ ] Lead gets auto-reply
   - [ ] Subscriber appears in Beehiiv

### Test Blueprint Purchase (Real Payment)
1. Go to: https://primelocalgrowth.com
2. Click "Purchase Blueprint" 
3. Complete Stripe checkout with test card:
   - Card: 4242 4242 4242 4242
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
4. Verify:
   - [ ] Welcome email arrives
   - [ ] Onboarding checklist arrives
   - [ ] Adam gets notification
   - [ ] Customer appears in Beehiiv with "customer" tag

---

## Checklist: Production Ready

- [ ] STRIPE_WEBHOOK_SECRET added to Vercel
- [ ] Vercel redeployed
- [ ] TEST-STRIPE-WEBHOOK.sh test passes (emails received)
- [ ] Beehiiv Newsletter Welcome automation exists
- [ ] Beehiiv Review Request automation created
- [ ] Newsletter subscription tested end-to-end
- [ ] Form submission tested (email verified)
- [ ] Blueprint purchase tested with test card (email verified)
- [ ] All emails tested on mobile (checked on iPhone/Android)
- [ ] No broken links in emails
- [ ] No 500 errors in Vercel logs
- [ ] Ready for production

---

## Support Links

- **Stripe Dashboard**: https://dashboard.stripe.com/
- **Vercel Dashboard**: https://vercel.com/adamrome/primelocalgrowth-website
- **Beehiiv Dashboard**: https://app.beehiiv.com/
- **Email Copy**: BEEHIIV_EMAIL_SEQUENCES.md (in repo)
- **Test Script**: bash TEST-STRIPE-WEBHOOK.sh

---

## What Happens After Setup

**Immediate (Live):**
- Form submissions trigger 3 emails automatically
- Newsletter signups trigger welcome email from Beehiiv
- Blueprint purchases trigger delivery email

**Daily (First Week):**
- Monitor Vercel logs for errors
- Check Resend dashboard for failed sends
- Verify form submissions are coming through

**Weekly (After Week 1):**
- Review form submissions
- Monitor email metrics (open rate, click rate)
- Adjust copy if needed based on early data

