# Places API Audit Enrichment

This module enriches each free audit with Google business and competitor data while limiting API usage to two uncached Text Search requests per audit.

## Install

1. Open the separate Apps Script project used by `MASTER_APPS_SCRIPT_WEBHOOK_URL`.
2. Add `google-apps-script/places-audit-enrichment.gs`.
3. In Apps Script Project Settings, add this script property:

```text
GOOGLE_PLACES_API_KEY=your Google Places API key
```

4. Restrict the key in Google Cloud to Places API (New).
5. Add these tags to the Google Docs audit template where needed:

```text
{{Google Place ID}}
{{Google Rating}}
{{Review Count}}
{{Google Category}}
{{Google Maps URL}}
{{Top Competitor}}
{{Competitor Rating}}
{{Competitor Reviews}}
{{Review Gap}}
{{Places Audit Notes}}
```

## Audit Generator Integration

Inside the audit-generator `doPost`, enrich the normalized lead before creating the document:

```javascript
const places = enrichAuditLeadWithPlaces(lead);
const auditFile = createAuditDocument(lead, places);
updateLeadPlacesByEmail(lead.email, places);
```

Update the document function signature and add the tag replacement call:

```javascript
function createAuditDocument(lead, places) {
  // Existing template-copy and lead-tag replacement code.
  replacePlacesAuditTags(body, places);
  newDoc.saveAndClose();
  return newFile;
}
```

## Cost Controls

- Explicit field masks avoid wildcard requests.
- Results are cached for six hours.
- Each uncached audit uses one business lookup and one competitor lookup.
- Repeated submissions for the same business/city/service reuse cache entries.
- The API key remains in Apps Script Script Properties and is never sent to the browser.

## Verification

Run:

```bash
npm run verify:plg
```

The verification command executes an offline mocked Places test and does not consume API credit.
