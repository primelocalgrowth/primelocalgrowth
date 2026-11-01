# Profile Care operations (low-touch model)

Built 2026-11-01. Everything below is deployed and inert until the setup steps are done.

## What runs by itself

| When | What | Where |
|---|---|---|
| Free audit request on the site | Finished audit report emailed to the lead (two Google Places lookups, rule-based fixes) | `lib/audit-report.js`, hooked in `api/submit-form.js` |
| Mondays 14:00 UTC | One email to Adam: drafted review replies and one post per client, a "Review and publish" button each | `/api/care?action=weekly` |
| Button press | Page shows the exact text; **publishing only happens on the POST button** | `/api/care?action=approve` |
| 2nd of each month, 15:00 UTC | Monthly report per client (Google numbers vs last month, work counted from Google) | `/api/care?action=monthly` |

Safety design: nothing publishes from a link click (email scanners fetch links), approval links are signed and expire in 14 days, only reviews listed in the email can be answered, already-answered reviews are never overwritten, a post that is already live is skipped, low-star replies are unticked by default and flagged. Monthly reports go to Adam only until `PLG_REPORTS_AUTOSEND=true`.

## One-time setup (about an hour, then it runs)

1. **Google Cloud project** (console.cloud.google.com). Enable "Places API (New)" and the Business Profile APIs listed in Google's Basic setup page (account management, business information, My Business v4 for reviews and posts, Business Profile Performance).
2. **Apply for Business Profile API access**: developers.google.com/my-business, "Application for Basic API Access". Google reviews it in about 14 days; quota shows 0 until approved, 300 when approved. Apply as PLG (a client's profile active 60+ days can be the qualifying profile).
3. **OAuth consent screen**: choose **Internal** (your Google Workspace). Apps left in "Testing" get refresh tokens that expire after 7 days. Add scope `https://www.googleapis.com/auth/business.manage`.
4. **OAuth client + refresh token** for adam@primelocalgrowth.com (OAuth 2.0 Playground with your own client works). Keep the refresh token secret.
5. **Vercel environment variables** (Production):
   - `GOOGLE_PLACES_API_KEY` (restricted to Places API (New)): turns on the automatic audit report
   - `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_OAUTH_REFRESH_TOKEN`
   - `CARE_APPROVAL_SECRET` (long random string), `CRON_SECRET` (long random string; Vercel sends it to cron routes automatically)
   - `PLG_CARE_CLIENTS`: JSON array, one object per active client:
     `[{"id":"dcutz","businessName":"DCutz Exclusive","city":"Cibolo","accountId":"123","locationId":"456","email":"owner@example.com","phone":"(210) 555-0100","services":["haircut"],"ctaUrl":"https://example.com/book","active":true}]`
   - optional `PLG_REPORTS_AUTOSEND=true` to email reports to clients (copy to Adam)
6. **Per new client**: they add adam@primelocalgrowth.com as Manager (the /gbp-access guide), you add their object to `PLG_CARE_CLIENTS`. Nothing else.

## Costs
Places lookups about $0.07 per audit after Google's free monthly allowance (Text Search Enterprise $35 per 1,000, 1,000 free). Business Profile APIs are free. Vercel and Resend free tiers cover this volume.

## Limits to know
- **Vercel free plan: 12 functions, counted as every `.js` file under `api/`.** Currently 12 of 12. Put shared code in `lib/`. `scripts/check-function-count.mjs` fails the build check if it goes over (an overage once silently stopped all deploys). To free room, move `api/utils/email.js` into `lib/` and update its imports.
- Endpoint and field names were checked against Google's reference docs on 2026-11-01, but nothing has run against the live Google APIs yet. Expect to fix small details on the first real run (review list ordering parameter, post summary limit).
- Drafts are template-based from the client record and real reviews. They are bland on purpose: no invented claims, no promises.
