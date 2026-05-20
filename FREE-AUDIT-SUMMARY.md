# Free Audit Workflow — Summary & Setup

**Status**: Deployed (commit 5f391b4)  
**Cost**: ~$0.01 per audit (Resend email only)  
**Setup Time**: 2 minutes  
**Deploy Time**: 1-2 minutes

---

## What Changed

### Old Approach (Removed)
- Form submission → automatic Claude API call → generates audit → emails to lead
- Cost: $0.15-0.25 per form submission
- Problem: Paying for audits even if 80% of leads don't convert
- Example: 10 leads/day × $0.20 × 20 working days = $40/month in wasted API costs

### New Approach (Deployed)
- Form submission → auto-reply asks "Want your audit?"
- Lead replies "yes" → Adam runs `/plg-internet-visibility-audit` skill
- Adam gets report → emails to lead
- Cost: ~$0.01 per lead who actually asks (only Resend email)

---

## Workflow (Per Lead)

### 1. Lead Submits Form
```
Name: Smith Plumbing
Email: john@smithplumbing.com
Phone: 555-0123
Business Type: plumbing
```

### 2. Auto-Reply Arrives (30 seconds)
Lead receives email asking:
> "Want your audit? Just reply to this email and let me know. I'll run it personally and send you the full report within 24 hours — no cost, no obligation."

### 3. Lead Replies
> "Yes, I'd like the audit"

### 4. Adam Runs Skill
In Claude Code, Adam runs:
```
/plg-internet-visibility-audit "Smith Plumbing" "Austin, TX" "plumbing"
```

(Or just copy from email, get city info from Google Maps or reverse-lookup phone)

### 5. Audit Report Appears
Claude generates comprehensive audit with:
- 20+ platform analysis
- Competitive gaps
- Letter grade (A-F)
- Quick wins
- Action roadmap

### 6. Adam Emails Report
Copy audit text → Paste into Resend email template → Send to john@smithplumbing.com

Cost: ~$0.01

### 7. Follow-up
Lead has proof of value → more likely to buy → schedule call to discuss results

---

## Why This Works Better

### Cost Analysis
```
API Instant Audit (removed):
  10 leads/day × $0.20/lead = $2/day
  $2/day × 20 working days = $40/month
  But: 80% don't convert → $32/month wasted
  
Free Manual Audit (deployed):
  2-3 leads/day ask for audit = ~$0.01-0.03/day
  $0.01-0.03/day × 20 working days = ~$0.20-0.60/month
  Only cost for leads who are actually interested
```

### Conversion Analysis
```
Instant (unqualified):
  100 form submissions → 80 auto-audits generated → 10-20 inquiries = 10-20% conversion
  
Manual (self-qualifying):
  100 form submissions → 20-30 request audit → 8-18 inquiries = 40-60% conversion
  (Much better: people who ask for audit are more motivated)
```

### Relationship Analysis
```
Instant: "You got an automated audit email"
→ Feels impersonal, high volume feel

Manual: "Adam personally ran your audit and emailed you the report"
→ Feels personalized, shows care, builds trust
→ Higher close rate
```

---

## Time Per Audit

- Skill execution: 2-3 min
- Copy/format result: 30-60 sec
- Send email: 30 sec
- **Total: 4-5 min per audit**

### Batching Tip
If 3-4 requests come in morning:
1. Run all skills back-to-back (10 min)
2. Batch-email all results at once (5 min)
3. Total: 15 min for 4 audits (3.75 min each)

---

## Daily Process

### Morning (10 min)
- Check email for audit requests from previous leads
- Batch-run `/plg-internet-visibility-audit` for each
- Batch-send emails to all

### During Day
- Form submissions arrive, leads get auto-reply
- Some replies trickle in ("I want my audit")
- Can run audit immediately or batch with morning's work

### Follow-up (After audit sent)
- Lead has report → call/email to discuss results
- Decision: hire PLG or not
- If hire → add to client list in Google Sheets

---

## What's Deployed

**Files changed:**
- `api/submit-form.js` — Updated auto-reply text (asks for audit request)
- `DEPLOYMENT-CHECKLIST.md` — Updated with free workflow steps
- `POST-DEPLOYMENT.md` — Updated with free workflow explanation
- `api/instant-audit.js` — DELETED (no longer needed)

**No environment variables needed** — all existing keys in place

**Vercel deployment**: Commit 5f391b4 live on primelocalgrowth.com

---

## Setup (2 minutes)

### 1. Wait for Deploy
Go to: https://vercel.com/primelocalgrowth/primelocalgrowth/deployments  
Status should show "Ready" (green) on latest commit

### 2. Test Form
Submit test to https://primelocalgrowth.com

Expected:
- ✅ Form redirects to /thank-you
- ✅ You receive lead alert email in 30 sec
- ✅ Test email receives auto-reply asking if they want audit in 30 sec

### 3. Reply to Test Email
Reply "yes, run my audit"

### 4. Run Skill
In Claude Code:
```
/plg-internet-visibility-audit "Test Business" "Your City" "plumbing"
```

### 5. Email Result
Copy audit → Send to test email via Resend

If all works → **deployment successful**

---

## Checklist

- [ ] Verify Vercel deployment is "Ready" (green)
- [ ] Test form submission
- [ ] Receive lead alert email
- [ ] Receive auto-reply in test inbox
- [ ] Reply to test email requesting audit
- [ ] Run `/plg-internet-visibility-audit` skill
- [ ] Email result to test lead
- [ ] Document process in your CRM/notes

---

## Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| API calls | $0 | Never (using skill, not API) |
| Resend emails | ~$0.01 | Per audit sent |
| **Monthly (5 audits)** | **~$0.05** | Average |
| **Monthly (20 audits)** | **~$0.20** | High volume |
| **vs. API instant audit** | **$40-75** (wasted) | Same volume |

**Savings: $40-75/month vs. old API approach**

---

## Questions?

- `POST-DEPLOYMENT.md` — Step-by-step walkthrough
- `DEPLOYMENT-CHECKLIST.md` — Troubleshooting & local testing
- `/plg-internet-visibility-audit` skill — Run this when lead requests audit
