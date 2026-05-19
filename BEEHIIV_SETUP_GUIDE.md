# 🎯 Beehiiv Setup & Optimization Guide
**The Local Edge by Prime Local Growth**

---

## 📊 CAMPAIGN OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│           The Local Edge Newsletter Strategy                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUBSCRIBER PATH              LEAD FORM PATH                │
│  ═════════════════            ═══════════════               │
│                                                             │
│  Subscribe → Email 1          Form Submit → Email 1         │
│    (Welcome)                    (Day 2 audit)               │
│       ↓                            ↓                        │
│   Email 2                      Email 2                      │
│  (Day 3 System)               (Day 5 proof)                 │
│       ↓                            ↓                        │
│  Content Drip              Email 3 (Final)                  │
│  (Daily/Weekly)                 ↓                           │
│                         ✅ Conversion Path                  │
│                                                             │
│  Target Metrics:         Target Metrics:                    │
│  • Open rate: 50%+      • Conversion: 3-5%                 │
│  • Click rate: 8%+      • Avg revenue: $150/mo             │
│  • Unsub: <0.5%         • 14-day arc (complete)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 PUBLICATION BRANDING CHECKLIST

### Core Identity
- [ ] **Publication Name:** The Local Edge by Prime Local Growth
- [ ] **Tagline:** Simple systems. Serious growth.
- [ ] **Description:** Weekly insights on ranking your local business on Google — no fluff, just systems that work
- [ ] **Logo:** Prime Local Growth hub-and-spoke icon (dark navy with sky blue accent)

### Email Styling
- [ ] **Primary Color:** #0EA5E9 (Sky Blue) — CTAs and links
- [ ] **Secondary Color:** #1B3A6B (Navy) — Headings
- [ ] **Background:** #0F172A (Dark navy)
- [ ] **Text Primary:** #F8FAFC (Off-white)
- [ ] **Text Secondary:** #94A3B8 (Muted gray)
- [ ] **Accent:** #0284C7 (Darker sky blue) — Hover states

### Sender Configuration
- [ ] **From Name:** Adam at Prime Local Growth
- [ ] **From Email:** adam@primelocalgrowth.com
- [ ] **Reply-To:** adam@primelocalgrowth.com
- [ ] **Support Email:** adam@primelocalgrowth.com

### Settings
- [ ] **Archive URL:** primelocalgrowth.com/newsletter
- [ ] **Unsubscribe Text:** Customized with "Adam responds to replies"
- [ ] **Privacy Policy:** Linked
- [ ] **Terms of Service:** Linked
- [ ] **Referral Program:** Enabled

---

## 📧 EMAIL SETUP INSTRUCTIONS

### Email 1: Welcome Email (Immediate)

**Configuration:**
- Trigger: On subscribe
- Delay: 0 minutes (immediate)
- Subject A/B test: Yes
- Preview text: "See the #1 mistake that keeps local businesses invisible"

**Copy:** [See BEEHIIV_EMAIL_SEQUENCES.md - Email 1]

**Button 1:**
- Text: "Download the System →"
- Link: primelocalgrowth.com/local-domination
- Color: Sky blue (#0EA5E9)

**Button 2 (Optional):**
- Text: "Apply for Management"
- Link: primelocalgrowth.com/premium
- Color: Navy (#1B3A6B) — Secondary button

---

### Email 2: System Intro (Day 3)

**Configuration:**
- Trigger: Scheduled
- Delay: Day 3 after Email 1
- Subject: "Your free ranking audit + the 30-day system"
- Preview: "System used by clients charging $1K+/month"

**Copy:** [See BEEHIIV_EMAIL_SEQUENCES.md - Email 2]

**Button:**
- Text: "See the 30-Day System →"
- Link: primelocalgrowth.com/local-domination
- Color: Sky blue (#0EA5E9)

---

### Email 3: Lead Nurture - Personalized Audit (Day 2 Post-Form)

**Configuration:**
- Trigger: Form submission (ranking audit, ROI calculator)
- Delay: Day 2 after form
- Dynamic content: Yes (personalize with business name, city, findings)
- Subject: "One thing holding you back (and how to fix it)"

**Copy Template:** [See BEEHIIV_EMAIL_SEQUENCES.md - Email 3]

**Personalization Fields:**
- [BusinessName] — From form
- [BusinessType] — From form
- [City] — From form
- [SPECIFIC_FINDING] — Austin barbershop → Low reviews / Incomplete photos / Missing description

**Button:**
- Text: "Download the Fix Guide →"
- Link: primelocalgrowth.com/downloads/gbp-access-guide
- Color: Sky blue (#0EA5E9)

---

### Email 4: Social Proof Case Study (Day 5 Post-Form)

**Configuration:**
- Trigger: If Email 3 opened
- Delay: Day 5 after form
- Branching: Only sends if Email 3 was opened
- Subject: "How a [City] [BusinessType] went from invisible to [Result]"

**Copy:** [See BEEHIIV_EMAIL_SEQUENCES.md - Email 4]

**Featured Case Study:**
- Austin Family Dental (dental, Texas)
- Result: Top 3 ranking + 8 reviews + $3K+ revenue (30 days)

**Button 1:**
- Text: "Download the System →"
- Link: primelocalgrowth.com/local-domination

**Button 2:**
- Text: "Apply for Management →"
- Link: primelocalgrowth.com/premium

---

### Email 5: Final Pitch (Day 14 Post-Form)

**Configuration:**
- Trigger: If didn't purchase/apply after Email 4
- Delay: Day 14 after form
- Subject: "Pick your path: DIY or Done-For-You"
- Preview: "Three options. Pick one."

**Copy:** [See BEEHIIV_EMAIL_SEQUENCES.md - Email 5]

**Three CTA Buttons:**
1. "DIY System - $37"
   - Link: primelocalgrowth.com/local-domination
   - Color: Sky blue

2. "Done-For-You - $297-497/mo"
   - Link: primelocalgrowth.com/premium
   - Color: Sky blue

3. "Free Audit"
   - Link: primelocalgrowth.com (lead form)
   - Color: Navy (secondary)

---

## 🔗 FORM INTEGRATION

### Subscribe Form (for newsletter)
- Placement: website footer + /newsletter page
- Fields: Email, First Name (optional)
- Success message: "Check your inbox — Email 1 is on the way"
- Redirect: Thank you page

### Lead Form (for ranking audit)
- Placement: /index.html (hero section + middle section)
- Fields: Name, Email, Business Type, City (optional)
- Trigger: Day 2 email with personalized audit results
- Success redirect: /thank-you with upsell box

---

## ✅ AUTOMATION SETUP CHECKLIST

### Welcome Sequence
- [ ] Email 1 created + subject line A/B test configured
- [ ] Email 2 scheduled for Day 3
- [ ] Email 3-5 scheduled for lead form submitters
- [ ] Branching logic: If Email 3 opened → send Email 4 (Day 5)
- [ ] Branching logic: If didn't purchase → send Email 5 (Day 14)

### Segmentation
- [ ] Newsletter subscribers segment created
- [ ] Lead form submitters segment created
- [ ] Purchased customers segment (exit automation)
- [ ] Premium applicants segment (exit automation)

### Performance Tracking
- [ ] Analytics enabled
- [ ] Link tracking enabled
- [ ] Conversion events tied to purchases
- [ ] Click-through tracking on all CTAs

### Exit Conditions
- [ ] Unsubscribe triggers removal
- [ ] Purchased local-domination → exit sequence
- [ ] Applied for premium → exit sequence
- [ ] Hard bounce → remove from list

---

## 📈 PERFORMANCE TARGETS & MONITORING

### Email Metrics (Monitor Weekly)

**Welcome Sequence:**
```
Email 1 (Immediate)
  Open rate: 50%+ (industry avg: 35-50%)
  Click rate: 8%+ (industry avg: 2-5%)
  Unsubscribe: <0.5%

Email 2 (Day 3)
  Open rate: 35%+ (industry avg: 25-35%)
  Click rate: 5%+ (industry avg: 1.5-3%)

Email 3 (Day 2 post-form)
  Open rate: 45%+
  Click rate: 10%+ (personalized has higher CTR)
  Conversion rate: 2-3%
```

**Lead Nurture Sequence:**
```
Email 3 → Email 4 → Email 5
  Sequence completion: 60%+
  Conversion rate (to purchase): 3-5%
  Revenue per subscriber: $2-5
```

### Key Metrics Dashboard
- [ ] Total subscribers: [Target: 2,000 by end of Q2]
- [ ] Email list growth rate: [Target: 20-30/week]
- [ ] Average open rate: [Target: 40%+]
- [ ] Average click rate: [Target: 6%+]
- [ ] Conversion rate: [Target: 3-5%]
- [ ] Revenue per 1,000 subscribers: [Target: $150-300/mo]
- [ ] Churn rate: [Target: <2%/month]

---

## 🚀 LAUNCH CHECKLIST

### Pre-Launch (Week 1)
- [ ] All 5 emails written and approved
- [ ] Email design templates created with brand colors
- [ ] Personalization fields mapped to form data
- [ ] Branching logic tested (fake form submissions)
- [ ] Analytics tracking configured
- [ ] Referral program URL generated

### Launch Day
- [ ] Newsletter page goes live at /newsletter
- [ ] Forms updated with newsletter signup link
- [ ] Thank you page has newsletter CTA
- [ ] Welcome email sent to team test subscribers
- [ ] Monitor deliverability (check spam folder)

### Post-Launch (Week 2+)
- [ ] Monitor open/click rates daily
- [ ] Respond to replies personally (Adam)
- [ ] Adjust subject lines if CTR <6%
- [ ] Watch unsubscribe rate (should be <0.5%)
- [ ] Track conversion events (purchases, applications)
- [ ] Weekly performance review

---

## 💡 OPTIMIZATION TIPS

### Subject Line A/B Testing
- Test: Question vs. Statement
- Test: Curiosity gap vs. Direct benefit
- Test: Personalization vs. Universal
- Winner: Keep for future emails similar tone

### Send Time Optimization
- Test different send times (8am vs. 6pm)
- Track open rates by send time
- Winner: Lock in optimal time for your audience

### CTA Button Testing
- Test: Button text ("Download" vs. "Get Started" vs. "See How")
- Test: Button color (sky blue vs. navy)
- Test: Link placement (top vs. bottom vs. both)
- Winner: Use for all future campaigns

### Content Testing
- Watch: Which case studies get highest CTR
- Watch: Which pain points resonate most
- Watch: Which CTAs convert best
- Adapt: Future emails based on learnings

---

## 🎓 EMAIL BEST PRACTICES

### Technical
- Send from consistent "From" address (adam@primelocalgrowth.com)
- Include unsubscribe link in footer
- Use alt text for all images
- Test on mobile (50%+ of opens are mobile)
- Monitor bounce rate (<3% is good)

### Content
- Keep sentences short (8-12 words)
- Use short paragraphs (2-3 sentences max)
- Lead with benefit, not feature
- Tell stories + case studies
- Use "you" not "we" or "our"

### Conversion
- One primary CTA per email
- CTA text should be action-oriented ("Download", "Get Started", "Apply")
- Use specific, proof-driven language
- Avoid generic phrases ("learn more", "see how")
- Make email unsubscribe a last resort, not first option

---

## 📋 ONGOING TASKS

### Weekly (Monday morning)
- [ ] Review email analytics
- [ ] Check for bounced/invalid emails
- [ ] Respond to direct replies (if any)
- [ ] Note any improvements to make

### Monthly (1st of month)
- [ ] Analyze full month performance
- [ ] Calculate revenue from email
- [ ] Identify top-performing email
- [ ] Plan next month's content
- [ ] Run A/B test on subject lines

### Quarterly (End of quarter)
- [ ] Audit email list health
- [ ] Re-engage inactive subscribers
- [ ] Evaluate automation performance
- [ ] Plan next quarter strategy

---

**Status:** Ready for beehiiv platform setup  
**Next Step:** Create publication, upload emails, test automation  
**Support:** adam@primelocalgrowth.com
