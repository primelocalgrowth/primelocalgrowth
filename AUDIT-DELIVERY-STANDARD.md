# PLG visibility audit delivery standard

Source promise: https://www.primelocalgrowth.com/free-visibility-audit (checked 2026-11-16).
Recheck the current public offer before every audit. A website review alone and two Google Places calls do not fulfill it.

## Required sections and evidence

1. Identity: match business name plus phone, website, owner or verified locality. Search exact phone, alternate spelling, website and confirmed city/state. Do not infer location from area code.
2. Google profile: record a verified Maps URL/place ID and observed profile fields. If not confidently located, document actual attempted queries, date, limitations and the next verification step. Do not claim it does not exist or create a duplicate.
3. Reviews: distinguish Google from BBB and website testimonials. Record observed rating/count, themes/response coverage where readable, or explicitly unresolved fields. No invented review deficit or fabricated sentiment.
4. Website trust and inquiry path: inspect mobile content, service area, contact/booking, service clarity and technical search presentation. Test observed actions before calling them broken.
5. Competitors: research at least three relevant local/service competitors; separate repair from detailing and local businesses from national landing pages. Source every rating/count and omit unavailable values. Explain observed differences without inventing ranking causation.
6. Cities/searches: record queries, city/state, date, result scope and location limitations. Search services separately. A limited list is not a rank grid; Places order is not Maps rank. No claims about untested cities.
7. Priorities: two or three fixes supported by the combined findings, not just website observations.
8. Sprint value: give a conditional $297 recommendation using capacity, contribution margin and plausible deliverables. Unknown economics must be disclosed. Illustrations are not forecasts or guarantees.

## Delivery gate

Status is `needs_review` until Adam has checked all eight sections and their sources. An explicitly unresolved field can be reported honestly only with documented attempts, impact and next action; it cannot silently pass as verified. If a material check is blocked, retain the draft and identify the blocker. Do not report full coverage when a promised section has not been researched.

Automated Places research is INTERNAL ONLY. `sendAuditReport` routes either a research draft or a research-needed alert to Adam and returns `sent: false, status: needs_review`. It does not deliver a customer audit. Its internal recipient is fixed; form input cannot override it. The lead acknowledgment and capture remain active. Manual customer delivery requires reviewing the full source-backed audit; creating a draft does not authorize sending it.

## Operator completion

Save the audit in the existing Google Doc, retain sources and unresolved checks, verify readback, and tell the user the exact folder and link. Keep operational errors outside client-facing recommendations.
For live errors, inspect and reconcile actual Apps Script code before deployment; update the existing deployment URL. Record created/failed status and draft URL; preserve completed drafts if admin notification fails. Never mark the system fixed based only on a PR or local tests.

## Deployment status for this change

The repository repair is proposed in PR #5. It is not a production deployment. The connected Vercel team exposes no projects; Apps Script mapping/authentication are absent here. Deployment and live keyed/unkeyed verification remain required before the new delivery gate protects production traffic.
