import assert from 'node:assert/strict';
import {
  PLACES_FIELD_MASK,
  analyze,
  chooseBusinessMatch,
  isAuditRequest,
  renderReportEmail,
  runAuditReport,
  sendAuditReport,
} from '../lib/audit-report.js';

const place = (id, name, rating, reviews, extra = {}) => ({
  id,
  displayName: { text: name },
  formattedAddress: '1 Main St, Cibolo, TX 78108, USA',
  rating,
  userRatingCount: reviews,
  primaryType: 'plumber',
  primaryTypeDisplayName: { text: extra.category || 'Plumber' },
  websiteUri: extra.website === undefined ? 'https://example.com' : extra.website,
  nationalPhoneNumber: extra.phone === undefined ? '(210) 555-0100' : extra.phone,
  googleMapsUri: `https://maps.google.com/?cid=${id}`,
  businessStatus: 'OPERATIONAL',
});

const lead = {
  name: 'Maria Lopez',
  email: 'maria@example.com',
  businessName: 'Lopez Plumbing',
  city: 'Cibolo',
  mainService: 'plumber',
  pagePath: '/free-visibility-audit',
};

function mockFetch({ business, results, status = 200 }) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const body = JSON.parse(init.body);
    const places = body.maxResultCount === 5 ? business : results;
    return { ok: true, status: 200, json: async () => ({ places }) };
  };
  impl.calls = calls;
  return impl;
}

const competitors = [
  place('c1', 'Alamo Plumbing', 4.8, 320),
  place('c2', 'Cibolo Drain Pros', 4.7, 210),
  place('c3', 'Schertz Pipe Co', 4.6, 180),
  place('biz', 'Lopez Plumbing', 4.2, 14, { website: '', category: 'Contractor' }),
  place('c4', 'Selma Rooter', 4.5, 95),
  place('c5', 'Live Oak Plumbers', 4.9, 60),
];

// 1. Happy path: two searches, safe headers, a correct and honest report
{
  const fetchImpl = mockFetch({ business: [place('biz', 'Lopez Plumbing', 4.2, 14, { website: '', category: 'Contractor' })], results: competitors });
  const out = await runAuditReport(lead, { apiKey: 'test-key', fetchImpl });
  assert.equal(out.matched, true);
  assert.equal(fetchImpl.calls.length, 2, 'exactly two Places calls per audit');
  for (const call of fetchImpl.calls) {
    assert.equal(call.init.headers['X-Goog-FieldMask'], PLACES_FIELD_MASK);
    assert.ok(!PLACES_FIELD_MASK.includes('*'), 'no wildcard field mask');
    assert.equal(call.init.headers['X-Goog-Api-Key'], 'test-key');
    assert.ok(!call.url.includes('test-key') && !call.init.body.includes('test-key'), 'key only in header');
  }
  assert.equal(out.report.position, 4);
  assert.equal(out.report.resultCount, 6);
  assert.equal(out.report.fixes.length, 3);
  assert.deepEqual(out.report.fixes.map((f) => f.title), [
    'Add a website to your Google profile',
    'Check your main category',
    'Close the review gap',
  ]);
  assert.ok(out.report.fixes[2].why.includes('gap of'), 'review gap is quantified');
}

// 2. Email: brand voice and compliance
{
  const fetchImpl = mockFetch({ business: [place('biz', 'Lopez <b>Plumbing</b>', 4.2, 14, { website: '' })], results: competitors });
  const evil = { ...lead, businessName: 'Lopez <b>Plumbing</b>', name: 'Maria <script>x</script>' };
  const out = await runAuditReport(evil, { apiKey: 'k', fetchImpl });
  const { subject, html, text } = renderReportEmail(out.report, evil);
  assert.ok(!html.includes('<script>'), 'lead input is escaped');
  assert.ok(!html.includes('<b>Plumbing</b>'), 'place data is escaped');
  for (const body of [html, text, subject]) {
    assert.ok(!body.includes('—'), 'no em dashes');
    assert.ok(!/\b(best|top rated|guarantee[ds]?)\b|#1\b/i.test(body.replace(/not a guarantee of ranking/gi, '')), 'no ranking promises');
  }
  assert.ok(text.includes('$297 one time') && text.includes('$197/month'), 'prices come from pricing.mjs');
  assert.ok(text.includes('No calls needed'));
  assert.ok(text.includes('snapshot, not a guarantee of ranking'));
}

// 3. Not found: never guess
{
  const fetchImpl = mockFetch({ business: [place('x', 'Totally Different Roofing', 4.9, 400)], results: competitors });
  const out = await runAuditReport(lead, { apiKey: 'k', fetchImpl });
  assert.equal(out.matched, false);
  assert.equal(out.reason, 'no_confident_match');
  assert.equal(fetchImpl.calls.length, 1, 'stops after the first search');
  let sent = 0;
  const res = await sendAuditReport(lead, { apiKey: 'k', fetchImpl, sendEmailImpl: async () => { sent++; return { id: 'e' }; } });
  assert.equal(res.sent, false);
  assert.equal(sent, 0, 'no email when the business is not matched');
}

// 4. Too few competitors: skip rather than publish a thin report
{
  const fetchImpl = mockFetch({ business: [place('biz', 'Lopez Plumbing', 4.2, 14)], results: [competitors[0], place('biz', 'Lopez Plumbing', 4.2, 14)] });
  const out = await runAuditReport(lead, { apiKey: 'k', fetchImpl });
  assert.equal(out.reason, 'too_few_competitors');
}

// 5. API failure never leaks the key
{
  const fetchImpl = mockFetch({ business: [], results: [], status: 403 });
  await assert.rejects(() => runAuditReport(lead, { apiKey: 'secret-key-123', fetchImpl }), (err) => {
    assert.ok(!String(err.message).includes('secret-key-123'));
    return /HTTP 403/.test(err.message);
  });
  await assert.rejects(() => runAuditReport(lead, { apiKey: '' }), /not configured/);
}

// 6. Full send path with an injected mailer
{
  const fetchImpl = mockFetch({ business: [place('biz', 'Lopez Plumbing', 4.2, 14)], results: competitors });
  const mails = [];
  const res = await sendAuditReport(lead, { apiKey: 'k', fetchImpl, sendEmailImpl: async (m) => { mails.push(m); return { id: 'e1' }; } });
  assert.equal(res.sent, true);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'maria@example.com');
  assert.equal(mails[0].replyTo, 'adam@primelocalgrowth.com');
}

// 7. Rules and matching
{
  assert.equal(isAuditRequest(lead), true);
  assert.equal(isAuditRequest({ ...lead, pagePath: '/contact' }), false);
  assert.equal(isAuditRequest({ ...lead, pagePath: '/ai-visibility-scorecard' }), false);
  assert.equal(isAuditRequest({ ...lead, city: '' }), false, 'no city, no report');
  assert.equal(isAuditRequest({ ...lead, pagePath: '/' }), true);
  const clean = analyze({
    business: { name: 'Solid Co', rating: 4.9, reviews: 500, website: 'https://s.co', phone: '1', category: 'Plumber', status: 'OPERATIONAL' },
    competitors: competitors.slice(0, 3).map((c) => ({ ...c, name: c.displayName.text, reviews: c.userRatingCount, category: 'Plumber' })),
    position: 1, resultCount: 6, service: 'plumber', city: 'Cibolo',
  });
  assert.equal(clean.fixes.length, 0, 'a strong listing gets no invented problems');
  assert.equal(chooseBusinessMatch([{ name: 'Lopez Plumbing LLC' }], lead)?.name, 'Lopez Plumbing LLC');
}

console.log('PASS auto audit report: two bounded Places calls, honest rule-based fixes, escaped email, no guess on weak matches, no key leaks.');
