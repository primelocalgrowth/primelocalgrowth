/**
 * Instant mini-audit — runs at form-submit time via Google Places API (New).
 * Lead gets 3 real findings within minutes; full audit follows within 24h.
 * Gated on GOOGLE_PLACES_API_KEY.
 */
import { sendEmail, getEmailFooter, escapeHtml } from './email.js';

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FROM_ADAM = 'Adam Rome <adam@primelocalgrowth.com>';

async function findPlace(businessName, city) {
  const response = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.regularOpeningHours,places.photos,places.businessStatus,places.googleMapsUri'
    },
    body: JSON.stringify({
      textQuery: [businessName, city].filter(Boolean).join(' '),
      maxResultCount: 1
    })
  });

  if (!response.ok) {
    throw new Error(`Places API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.places?.[0] || null;
}

function buildFindings(place) {
  if (!place) {
    return [{
      title: 'Google can\'t find your business profile',
      detail: 'I searched Google Maps for your business and it didn\'t come up clearly. If I can\'t find you, neither can customers — this is the single biggest thing costing you calls right now.'
    }];
  }

  const findings = [];
  const reviews = place.userRatingCount || 0;
  const rating = place.rating || 0;
  const photos = place.photos?.length || 0;

  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
    findings.push({
      title: 'Your profile shows as closed or unverified',
      detail: `Google lists your business status as "${place.businessStatus.toLowerCase().replace(/_/g, ' ')}". Customers see that before anything else — most won't call a business Google flags.`
    });
  }
  if (reviews < 30) {
    findings.push({
      title: `Only ${reviews} Google review${reviews === 1 ? '' : 's'}`,
      detail: 'Businesses winning the top 3 map spots in your area typically hold 50+ reviews. Every competitor review you\'re behind is a customer choosing them first.'
    });
  }
  if (rating > 0 && rating < 4.5) {
    findings.push({
      title: `${rating.toFixed(1)}-star rating is filtering you out`,
      detail: 'Most customers set their mental cutoff at 4.5 stars. Below that, you\'re invisible in "best near me" searches even when you rank.'
    });
  }
  if (!place.websiteUri) {
    findings.push({
      title: 'No website linked on your profile',
      detail: 'Google treats a missing website link as a weak trust signal, and customers who want details before calling hit a dead end.'
    });
  }
  if (!place.regularOpeningHours) {
    findings.push({
      title: 'No business hours listed',
      detail: 'Profiles without hours lose the "Open now" filter entirely — a huge share of urgent, ready-to-buy searches exclude you automatically.'
    });
  }
  if (photos < 5) {
    findings.push({
      title: `Only ${photos} photo${photos === 1 ? '' : 's'} on your profile`,
      detail: 'Profiles with 10+ recent photos get significantly more clicks and direction requests. Sparse photos read as "maybe out of business."'
    });
  }

  if (!findings.length) {
    findings.push({
      title: 'Your basics are solid — the gap is competitive',
      detail: 'Profile fundamentals check out, which means the opportunity is in ranking signals: posting cadence, review velocity, and category targeting versus the competitors above you. That\'s exactly what the full audit maps.'
    });
  }

  return findings.slice(0, 3);
}

export async function sendMiniAudit(lead) {
  const { firstName, email, businessName, city } = lead;
  const place = await findPlace(businessName, city);
  const findings = buildFindings(place);

  const findingsHtml = findings.map((f, i) => `
    <div style="margin:0 0 20px;padding:16px 18px;border-left:4px solid #0ea5e9;background:#f8fafc;">
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0f172a;">${i + 1}. ${escapeHtml(f.title)}</p>
      <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">${escapeHtml(f.detail)}</p>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#1b3a6b;padding:24px 32px;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Prime Local Growth</p>
      </div>
      <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;">
        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 24px;">I said 24 hours, but I already started. Here's what jumped out in the first pass on ${escapeHtml(businessName)}:</p>
        ${findingsHtml}
        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:24px 0 16px;">This is the quick scan. Your full audit — competitor comparison, ranking gaps, and the exact fix order — lands in your inbox within 24 hours.</p>
        <p style="font-size:14px;color:#666;line-height:1.6;margin:0;">Want me to dig into specific competitors? Reply with their names and I'll include them.</p>
        <p style="font-size:14px;color:#666;line-height:1.6;margin:16px 0 0;">— Adam Rome<br>Prime Local Growth</p>
        ${getEmailFooter()}
      </div>
    </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `${firstName}, I already found ${findings.length} thing${findings.length === 1 ? '' : 's'} on ${businessName}`,
    html,
    replyTo: 'adam@primelocalgrowth.com',
    scheduledAt: new Date(Date.now() + 8 * 60 * 1000).toISOString()
  });
}
