# Instant Audit Feature — Deployment Checklist

## What Changed
- `api/instant-audit.js` — new file, triggers Claude audit on form submission
- `api/submit-form.js` — updated to parallel-execute instant audit alongside other lead integrations

## Vercel Environment Variables Required
Add these to Vercel project settings (Settings → Environment Variables):

```
ANTHROPIC_API_KEY=sk_... (from Anthropic console)
RESEND_API_KEY=... (already set, used by instant-audit.js for email)
BEEHIIV_API_KEY=... (already set)
BEEHIIV_PUBLICATION_ID=... (already set)
GOOGLE_SHEETS_WEBHOOK_URL=... (already set)
```

## Deployment Flow
1. Form submission → `api/submit-form.js` handler
2. Parallel execution:
   - Email notification to Adam
   - Auto-reply to lead with GBP access guide
   - Add to Beehiiv
   - Append to Google Sheets
   - **NEW**: Trigger instant audit via Claude (non-blocking)
3. Return 200 success (regardless of audit outcome)
4. Audit generates within 2-3 minutes, emails result to lead

## Testing Locally
```bash
# Set env vars in .env.local
ANTHROPIC_API_KEY=sk_...
RESEND_API_KEY=...

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
- Form succeeds immediately with 200 response
- Within 2-3 min: Adam receives lead alert email
- Within 2-3 min: Lead receives auto-reply with GBP access guide
- Within 3-5 min: Lead receives instant audit report email (if ANTHROPIC_API_KEY set)
- Google Sheets logs entry within 30 sec
- Beehiiv adds subscriber (if API keys set)

## Rollback
If instant audit fails:
1. Remove triggerInstantAudit import from submit-form.js
2. Remove the instant audit call from Promise.allSettled array
3. Redeploy

Form will continue working normally; leads just won't get instant audits.

## Notes
- Empty city string passed to Claude (form doesn't capture location)
- Claude skill `/plg-internet-visibility-audit` handles missing location gracefully
- Audit is best-effort; form submission succeeds even if audit fails
