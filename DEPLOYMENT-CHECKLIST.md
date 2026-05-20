# Free Audit Workflow — Deployment Checklist

## What Changed
- `api/submit-form.js` — updated auto-reply email to request audit instead of instant delivery
- Auto-reply asks lead to reply if they want audit run
- Adam runs `/plg-internet-visibility-audit` skill manually, emails report back

## Vercel Environment Variables
No new API keys needed. Existing setup:
```
RESEND_API_KEY=... (for auto-reply email)
BEEHIIV_API_KEY=... (subscriber management)
BEEHIIV_PUBLICATION_ID=...
GOOGLE_SHEETS_WEBHOOK_URL=... (lead logging)
```

## Deployment Flow
1. Form submission → `api/submit-form.js` handler
2. Execute:
   - Email notification to Adam (lead alert)
   - Auto-reply to lead (asks if they want audit)
   - Add to Beehiiv
   - Append to Google Sheets
3. Return 200 success
4. **Lead replies "yes, I want my audit"**
5. **Adam runs `/plg-internet-visibility-audit` skill** (free, Claude session)
6. **Adam emails report back** via Resend

## Testing Locally
```bash
# No special env vars needed, just standard ones

# Test form submission
curl -X POST http://localhost:3000/api/submit-form \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Business",
    "email": "test@example.com",
    "phone": "555-1234",
    "businessType": "plumbing"
  }'
```

## Expected Behavior
- Form succeeds with 200 response
- Within 30 sec: Adam receives lead alert email
- Within 30 sec: Lead receives auto-reply asking if they want audit
- Lead replies "yes" (or similar)
- Adam runs: `/plg-internet-visibility-audit "Test Business" "city" "plumbing"`
- Adam gets audit report, forwards to lead via email
- **Cost: $0 (skill execution is free)**

## Workflow Steps
1. Lead fills form → gets auto-reply asking for audit request
2. Lead replies → Adam sees it in inbox
3. Adam runs `/plg-internet-visibility-audit [businessName] [city] [serviceType]`
4. Audit generates → Adam emails result via Resend (cheap, one email)
5. Lead gets report → calls Adam to discuss results

## Notes
- Zero API call costs (skill execution within Claude session)
- Only paid action: Resend email delivery (~$0.01 per email)
- Audit delivery slower (manual), but filters self-qualified leads (ask if they want it)
- Higher conversion: leads who ask for audit are more committed
