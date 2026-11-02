/**
 * Automated free audit report.
 *
 * Turns an audit request into a finished, honest report with no human step:
 * two Google Places Text Search calls (the business, then its competitors),
 * deterministic rules that pick the three highest-value fixes, and one email.
 *
 * Deliberately rule-based, not an LLM: every sentence is traceable to a number
 * Google returned, nothing is invented, and the cost is two search requests per
 * audit. Only the fields the Apps Script Places module already requests are
 * used, so cost and permissions stay predictable. Hours and photos are NOT
 * checked, so the report never claims anything about them.
 *
 * Wired into /api/submit-form, inert until the key exists. Switch-on:
 *   1. Set GOOGLE_PLACES_API_KEY in Vercel (Places API (New) enabled, key restricted to it).
 *   2. That is all: submit-form already calls sendAuditReport for real audit requests.
 *
 * Lives in lib/, not api/: Vercel counts every .js under api/ as a function (12 max on the free plan).
 */
import { byId, priceLabel } from '../shared/pricing.mjs';
import { brandedEmail, ctaPanel, esc, h2, numberedCard, p, signature, statTiles, C } from './email-brand.js';

const GENERIC_CATEGORY = /^(services?|service establishment|business|company|corporation|establishment|point of interest)$/i;

const SERVICE_BY_NAME = [
  [/hvac|heating|cooling|\bair\b|\bac\b|a\/c/i, 'HVAC contractor'],
  [/plumb|rooter|drain/i, 'Plumber'],
  [/roof/i, 'Roofing contractor'],
  [/electric/i, 'Electrician'],
  [/dental|dentist|orthodont/i, 'Dentist'],
  [/landscap|lawn|turf/i, 'Landscaper'],
  [/auto|mechanic|tire|collision|transmission/i, 'Auto repair shop'],
  [/pest|termite/i, 'Pest control service'],
  [/clean|maid/i, 'House cleaning service'],
  [/barber|salon|hair/i, 'Barber shop'],
  [/med ?spa|aesthetic|botox/i, 'Med spa'],
  [/paint/i, 'Painter'],
  [/pool/i, 'Pool service'],
  [/garage door/i, 'Garage door supplier'],
];

/** The search term for "who is ahead of you": the owner's answer, then Google's category, then the business name. */
export function pickService(lead, business) {
  const given = String(lead.mainService ?? '').replace(/\s+/g, ' ').trim();
  if (given) return given;
  if (business.category && !GENERIC_CATEGORY.test(business.category)) return business.category;
  const hit = SERVICE_BY_NAME.find(([re]) => re.test(business.name));
  return hit ? hit[1] : '';
}

export const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

export const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',');

const AUDIT_PATHS = /^\/(free-visibility-audit|gbp-scorecard)?\/?$/;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

const normalize = (v) =>
  clean(v)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(llc|inc|co|company|corp|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);

/** Only real audit forms that collected a business and a city get a report. */
export function isAuditRequest(lead) {
  return Boolean(
    lead &&
      clean(lead.businessName) &&
      clean(lead.city) &&
      clean(lead.email) &&
      AUDIT_PATHS.test(clean(lead.pagePath) || '/'),
  );
}

function toPlace(p) {
  return {
    id: p.id || '',
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: Number(p.userRatingCount) || 0,
    category: p.primaryTypeDisplayName?.text || '',
    website: p.websiteUri || '',
    phone: p.nationalPhoneNumber || '',
    mapsUrl: p.googleMapsUri || '',
    status: p.businessStatus || '',
  };
}

export async function searchPlaces(textQuery, { apiKey, fetchImpl = fetch, max = 20 } = {}) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  const response = await fetchImpl(PLACES_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: max, languageCode: 'en', regionCode: 'US' }),
  });
  if (!response.ok) throw new Error(`Places search failed: HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.places) ? data.places.map(toPlace) : [];
}

/** Best name match, or null when nothing is a confident match. */
export function chooseBusinessMatch(places, lead) {
  const target = normalize(lead.businessName);
  if (!target) return null;
  const targetTokens = new Set(target.split(' ').filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const place of places) {
    const name = normalize(place.name);
    if (!name) continue;
    let score = 0;
    if (name === target) {
      score = 1;
    } else {
      const tokens = name.split(' ').filter(Boolean);
      const hits = tokens.filter((t) => targetTokens.has(t)).length;
      score = hits / Math.max(targetTokens.size, tokens.length);
    }
    if (score > bestScore) {
      best = place;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

function cityFromAddress(address) {
  const parts = clean(address).split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 3] : '';
}

function modeCategory(places) {
  const counts = new Map();
  for (const p of places) if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  let top = '';
  let n = 0;
  for (const [cat, c] of counts) if (c > n) { top = cat; n = c; }
  return { category: top, count: n };
}

/** Rules that choose the three highest-value fixes. Pure function. */
export function analyze({ business, competitors, position, resultCount, service, city }) {
  const top = competitors[0] || null;
  const top5 = competitors.slice(0, 5);
  const referenceReviews = median(top5.map((c) => c.reviews));
  const findings = [];

  if (business.status && business.status !== 'OPERATIONAL') {
    findings.push({
      priority: 0,
      title: 'Google shows your business as not open',
      why: `Your listing status is "${business.status.toLowerCase().replace(/_/g, ' ')}", which hides you from many searches.`,
      how: 'Open your Google Business Profile and confirm the business is marked open.',
    });
  }
  if (!business.website) {
    findings.push({
      priority: 1,
      title: 'Add a website to your Google profile',
      why: 'No website is linked to your listing. Customers and Google both use it to confirm what you do.',
      how: 'Link your website, or even a simple one-page site, in your profile.',
    });
  }
  const common = modeCategory(top5);
  if (common.count >= 3 && business.category && common.category !== business.category) {
    findings.push({
      priority: 2,
      title: 'Check your main category',
      why: `Your main category is "${business.category}". ${common.count} of the top ${top5.length} results use "${common.category}".`,
      how: 'Pick the category that matches what customers search for, then list your other services as secondary categories.',
    });
  }
  if (business.reviews < referenceReviews) {
    const gap = referenceReviews - business.reviews;
    findings.push({
      priority: 3,
      title: 'Close the review gap',
      why: `The typical top result has ${referenceReviews} reviews${top ? ` (the first result, ${top.name}, has ${top.reviews})` : ''}. You have ${business.reviews}, a gap of ${gap}.`,
      how: 'After every job, send the same short text with your review link. Reply to every review you receive.',
    });
  }
  if (business.rating !== null && business.rating < 4.5) {
    findings.push({
      priority: 4,
      title: 'Lift your star rating',
      why: `Your rating is ${business.rating.toFixed(1)}. Customers compare ratings side by side before they call.`,
      how: 'Reply calmly and specifically to low reviews, fix any repeated complaint, and ask happy customers to review.',
    });
  } else if (business.rating === null) {
    findings.push({
      priority: 4,
      title: 'Get your first reviews',
      why: 'Your listing has no star rating yet, so customers have nothing to compare.',
      how: 'Ask your last five happy customers for a Google review this week.',
    });
  }
  if (!business.phone) {
    findings.push({
      priority: 5,
      title: 'Add your phone number',
      why: 'No phone number shows on your listing, so mobile customers cannot tap to call.',
      how: 'Add your main business number in your profile.',
    });
  }

  findings.sort((a, b) => a.priority - b.priority);
  return {
    business,
    service,
    city,
    position,
    resultCount,
    top,
    competitors: competitors.slice(0, 3),
    referenceReviews,
    fixes: findings.slice(0, 3),
  };
}

/** Runs the two searches and builds the report. Returns { matched:false } when it cannot be sure. */
export async function runAuditReport(lead, { apiKey = process.env.GOOGLE_PLACES_API_KEY, fetchImpl } = {}) {
  const name = clean(lead.businessName);
  const cityInput = clean(lead.city);

  const found = await searchPlaces(`${name} ${cityInput}`.trim(), { apiKey, fetchImpl, max: 5 });
  const business = chooseBusinessMatch(found, lead);
  if (!business) return { matched: false, reason: 'no_confident_match' };

  const service = pickService(lead, business);
  if (!service) return { matched: false, reason: 'no_service' };
  const city = cityInput || cityFromAddress(business.address);

  const results = await searchPlaces(`${service} near ${city}`, { apiKey, fetchImpl, max: 20 });
  const position = results.findIndex((p) => p.id === business.id) + 1;
  const competitors = results.filter(
    (p) => p.id !== business.id && p.rating !== null && p.status !== 'CLOSED_PERMANENTLY',
  );
  if (competitors.length < 3) return { matched: false, reason: 'too_few_competitors' };

  return {
    matched: true,
    report: analyze({ business, competitors, position, resultCount: results.length, service, city }),
  };
}

const money = (id) => priceLabel(byId(id));

/** Brand-voice email: plain English, no promises beyond the data. */
export function renderReportEmail(report, lead) {
  const firstName = clean(lead.name).split(' ')[0] || 'there';
  const { business, service, city, position, resultCount, competitors, fixes } = report;
  const today = new Date().toISOString().slice(0, 10);

  const positionLine = position
    ? `In this snapshot of Google results for "${service} near ${city}", ${business.name} appears at position ${position} of ${resultCount}.`
    : `In this snapshot of Google results for "${service} near ${city}", ${business.name} did not appear in the first ${resultCount} results.`;

  const rows = [
    [business.name + ' (you)', business.rating === null ? 'No rating' : business.rating.toFixed(1), business.reviews],
    ...competitors.map((c) => [c.name, c.rating.toFixed(1), c.reviews]),
  ];

  const fixText = fixes.length
    ? fixes.map((f, i) => `${i + 1}. ${f.title}\n   ${f.why}\n   What to do: ${f.how}`).join('\n\n')
    : 'Your listing already covers the basics we check. The next gains come from steady reviews and fresh posts.';

  const text = [
    `Hi ${firstName},`,
    '',
    `Here is your free Google visibility audit for ${business.name}. It compares your listing with the businesses customers see when they search "${service} near ${city}".`,
    '',
    'WHERE YOU SHOW UP RIGHT NOW',
    positionLine,
    '',
    'WHO IS AHEAD OF YOU (rating, reviews)',
    ...rows.map((r) => `- ${r[0]}: ${r[1]}, ${r[2]} reviews`),
    '',
    fixes.length ? `${fixes.length} FIXES THAT WOULD HELP FASTEST` : 'WHAT TO DO NEXT',
    fixText,
    '',
    `These fixes are yours to keep, whether or not we ever work together. If you would rather have them handled, the 30-Day Opportunity Sprint is ${money('sprint')} one time, and it is credited toward your first month if you continue with Profile Care (${money('care')}/month). No calls needed. Reply to this email with any question.`,
    '',
    'Adam Rome, Prime Local Growth',
    '',
    `Source: Google Places data retrieved ${today}. Results vary by device and location and are a snapshot, not a guarantee of ranking.`,
  ].join('\n');

  const youRating = business.rating === null ? 'n/a' : business.rating.toFixed(1);
  const rankTile = position ? `${position} of ${resultCount}` : `Not in top ${resultCount}`;
  const rowCell = 'padding:11px 10px;border-bottom:1px solid ' + C.line + ';font-family:Arial,Helvetica,sans-serif;font-size:14px;';
  const htmlRows = rows
    .map((r, i) =>
      i === 0
        ? `<tr><td bgcolor="#FFF4E0" style="${rowCell}border-left:4px solid ${C.amber};font-weight:700;color:${C.forest};">${esc(r[0])}</td><td align="center" bgcolor="#FFF4E0" style="${rowCell}font-weight:700;color:${C.forest};">${esc(r[1])}</td><td align="center" bgcolor="#FFF4E0" style="${rowCell}font-weight:700;color:${C.forest};">${esc(r[2])}</td></tr>`
        : `<tr><td bgcolor="#FFFFFF" style="${rowCell}color:#1F2A24;">${esc(r[0])}</td><td align="center" bgcolor="#FFFFFF" style="${rowCell}color:#1F2A24;">${esc(r[1])}</td><td align="center" bgcolor="#FFFFFF" style="${rowCell}color:#1F2A24;">${esc(r[2])}</td></tr>`,
    )
    .join('');

  const htmlFixes = fixes.length
    ? fixes.map((f, i) => numberedCard(i + 1, f.title, f.why, f.how)).join('')
    : p('Your listing already covers the basics we check. The next gains come from steady reviews and fresh posts.');

  const content = [
    p(`Hi ${esc(firstName)},`),
    p(`Here is your free Google visibility audit for <strong>${esc(business.name)}</strong>. It compares your listing with the businesses customers see when they search "${esc(service)} near ${esc(city)}".`),
    statTiles([
      { value: youRating, label: 'Your rating' },
      { value: String(business.reviews), label: 'Reviews' },
      { value: rankTile, label: 'Position in search', accent: true },
    ]),
    h2('Where you show up right now'),
    p(esc(positionLine)),
    h2('Who is ahead of you'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 8px;"><tr><td bgcolor="${C.forest}" style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mistOnDark};">Business</td><td align="center" bgcolor="${C.forest}" style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mistOnDark};">Rating</td><td align="center" bgcolor="${C.forest}" style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mistOnDark};">Reviews</td></tr>${htmlRows}</table>`,
    h2(fixes.length ? `${fixes.length} fixes that would help fastest` : 'What to do next'),
    htmlFixes,
    p('These fixes are yours to keep, whether or not we ever work together.', 'margin-top:22px;'),
    ctaPanel({
      title: 'Want these handled for you?',
      body: `The <strong style="color:#FFFFFF;">30-Day Opportunity Sprint is ${esc(money('sprint'))}</strong> one time, credited toward your first month if you continue with Profile Care (${esc(money('care'))}/month). No calls needed. Everything happens by email.`,
      label: 'Reply to start the Sprint',
      href: 'mailto:adam@primelocalgrowth.com?subject=' + encodeURIComponent('Start the Sprint: ' + business.name),
    }),
    signature(),
  ].join('');

  const html = brandedEmail({
    preheader: position
      ? `${business.name} shows at position ${position} of ${resultCount}. Here are ${fixes.length || 'the'} fixes that would help fastest.`
      : `${business.name} did not appear in the first ${resultCount} results. Here is what to fix first.`,
    label: 'Free visibility audit',
    content,
    note: `Source: Google Places data retrieved ${today}. Results vary by device and location and are a snapshot, not a guarantee of ranking.`,
  });

  return { subject: `Your free Google visibility audit: ${business.name}`, html, text };
}

/** Full pipeline. sendEmailImpl is injected in tests; production loads the shared Resend helper. */
export async function sendAuditReport(lead, { apiKey, fetchImpl, sendEmailImpl } = {}) {
  const result = await runAuditReport(lead, { apiKey, fetchImpl });
  if (!result.matched) return { sent: false, reason: result.reason };

  const { subject, html } = renderReportEmail(result.report, lead);
  const send = sendEmailImpl || (await import('../api/utils/email.js')).sendEmail;
  const response = await send({
    to: clean(lead.email),
    from: 'Adam Rome <adam@primelocalgrowth.com>',
    subject,
    html,
    replyTo: 'adam@primelocalgrowth.com',
  });
  return { sent: Boolean(response), reason: response ? 'sent' : 'email_not_configured' };
}
