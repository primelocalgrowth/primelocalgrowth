# Prime Local Growth Backend Integration Audit

Audit date: 2026-07-12

## Recommended ownership

| System | Keep? | One job |
|---|---|---|
| Google Sheets | Keep | Durable lead and client operating record |
| Google Apps Script lead webhook | Keep | Validate and append/update the Google Sheet |
| Google Apps Script audit generator | Conditional | Keep only if it creates the Google Doc/PDF audit; otherwise merge it into the lead webhook |
| Resend | Keep | Transactional email only: requested audit confirmation, Adam alert, paid onboarding |
| Beehiiv | Keep, narrowly | Newsletter and separately consented educational marketing only |
| Stripe webhook | Conditional | Keep only if PLG uses Stripe invoices or Checkout; it must not act as a newsletter/CRM system |
| Vercel Functions | Keep | Secure server-side orchestrator and secret boundary |

## Data flow after remediation

### Audit/contact lead

1. Browser validates the form and submits to `/api/submit-form`.
2. Honeypot submissions stop without reaching any vendor.
3. Google Sheets webhook records the lead. This is the required system of record.
4. Resend sends Adam's alert and the requested transactional confirmation when configured.
5. The audit-generator Apps Script runs only when `MASTER_APPS_SCRIPT_WEBHOOK_URL` is configured.
6. Beehiiv receives the lead only when the optional marketing checkbox was selected.

### Newsletter subscriber

1. The dedicated newsletter page submits to `/api/newsletter-subscribe`.
2. Beehiiv must accept the subscription before the site reports success.
3. Beehiiv owns welcome, unsubscribe, and newsletter delivery.
4. Resend is not called and Adam does not receive a redundant subscriber alert.

### Paying customer

1. Stripe verifies the signed webhook event.
2. `checkout.session.completed` handles Checkout onboarding.
3. `invoice.paid` handles manual invoices only, preventing duplicate onboarding for Checkout subscriptions.
4. Resend sends transactional onboarding.
5. Google Sheets changes the lead to Active Client.
6. Beehiiv is not called because payment is not newsletter consent.

## Removed redundancy and failure modes

- Removed the second Vercel-side Google Places mini-audit; Places enrichment remains in the Google audit-generator module.
- Removed uncancellable day-3/day-7 Resend marketing emails. Beehiiv should own opted-in nurture.
- Removed automatic Beehiiv enrollment for every audit lead and Stripe customer.
- Removed a nonexistent `/preferences` link from transactional email footers.
- Removed duplicate subscription onboarding through both Checkout and `invoice.paid`.
- Changed newsletter signup so missing credentials or a Beehiiv rejection returns an error instead of a false success.
- Added request size/type validation, attribution allow-listing, honeypots, consent logging, and no-store responses.
- Moved the hardcoded Google spreadsheet ID to the `PLG_SPREADSHEET_ID` Apps Script property.
- Aligned confirmation and onboarding email timelines with the actual 30-day sprint.

## Live Google Drive findings

The connected Google account exposes the production `PLG Lead Database` spreadsheet. Its current structure is:

- `Audit Requests`, `PLG Lead Database`, `Onboarding Log`, and `Clients`: headers only, with no operating records.
- `Reply Log`: two outreach replies; the latest logged reply is from approximately May 22, 2026.
- `Scraped Log`: 70 prospect rows; the latest scrape is from approximately May 23, 2026.
- `Log`: 84 rows; the latest recorded batch activity is from approximately May 23, 2026.

This means the Sheet exists and the older prospecting automation ran, but it is not currently functioning as PLG's source of truth. The existing $400/month customer is absent from `Clients`, and no website lead or audit has reached the primary pipeline tabs. Before adding more automation, add the current customer and prove one controlled form submission reaches the Sheet.

The main lead tab also has no explicit `Marketing Consent` column yet. The remediated website sends `marketing_consent`; the Apps Script webhook must map that value to a dedicated column rather than burying it in Notes.

## Production configuration that still requires account verification

Google Drive and the production spreadsheet are verified. The current authenticated tools still do not expose the Vercel project, Apps Script source, deployment settings, Script Properties, or execution history. Do not claim those pieces are confirmed until the owning dashboards are accessible.

Verify these production variable names in the actual Prime Local Growth Vercel project:

- `GOOGLE_SHEETS_WEBHOOK_URL` - required
- `RESEND_API_KEY` - recommended
- `MASTER_APPS_SCRIPT_WEBHOOK_URL` - optional audit document generator
- `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` - optional newsletter/opt-in marketing
- `STRIPE_WEBHOOK_SECRET` - only if Stripe webhook onboarding is used
- `STRIPE_SECRET_KEY` and `STRIPE_GEO_PRICE_ID` - only if the private GEO Checkout creator is used

Verify these Script Properties in the audit-generator Apps Script project:

- `GOOGLE_PLACES_API_KEY`
- `PLG_SPREADSHEET_ID`

## Google-side acceptance checklist

1. Locate the deployment URL matching `GOOGLE_SHEETS_WEBHOOK_URL`.
2. Confirm its `doPost(e)` accepts both a new-lead payload and `action: update_status`.
3. Confirm it returns JSON with `success: true` only after the sheet write succeeds.
4. Confirm duplicate submissions are upserted by normalized email instead of appended blindly.
5. Confirm concurrent writes use `LockService` around row/header mutation.
6. Locate the deployment matching `MASTER_APPS_SCRIPT_WEBHOOK_URL`.
7. If it only duplicates the lead write, retire it. If it creates the audit document, keep it separate and document that single responsibility.
8. Confirm the audit deployment uses `enrichAuditLeadWithPlaces`, document template tokens, and `updateLeadPlacesByEmail`.
9. Set `GOOGLE_PLACES_API_KEY` and `PLG_SPREADSHEET_ID` in Script Properties; do not hardcode either in source.
10. Use versioned production deployments and inspect recent Executions for failures before an end-to-end test.
11. Map `marketing_consent` to a dedicated `Marketing Consent` column.
12. Add the current paying customer to `Clients` so the backend reflects the actual business.

## End-to-end acceptance test

Use a real PLG-controlled test address, not a fake prospect:

1. Submit the audit form without marketing consent.
2. Confirm exactly one Sheet lead, Adam's alert, one transactional confirmation, and no Beehiiv subscriber.
3. Submit again with marketing consent from a second test address.
4. Confirm the Sheet records `marketing_consent=Yes` and Beehiiv contains that subscriber.
5. Submit the newsletter form and confirm its Beehiiv welcome email.
6. Run one Stripe test-mode Checkout or invoice and confirm one onboarding sequence, one Active Client update, and no Beehiiv enrollment.

## Current verdict

The service choices are appropriate for a one-client business. The previous wiring was not: Beehiiv was acting as a CRM, Resend was acting as an uncancellable nurture engine, Google Places logic existed in two places, and Stripe could onboard the same subscription twice. The remediated design keeps the inexpensive tools while giving each one a single job. The immediate backend priority is now operational adoption and one end-to-end proof, not another platform.
