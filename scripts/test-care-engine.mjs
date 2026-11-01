import assert from 'node:assert/strict';
import { runWeekly } from '../api/care-weekly.js';
import { runApprove } from '../api/care-approve.js';
import { runMonthly } from '../api/care-monthly.js';
import { draftPost, draftReply, signToken, verifyToken, weekKey, buildMonthlyReport, compare } from '../api/utils/care.js';
import { summarizeMetrics } from '../api/utils/gbp.js';

const CLIENT = { id: 'shop1', businessName: 'Test Barbershop', city: 'Cibolo', accountId: '111', locationId: '222', email: 'owner@example.com', services: ['haircut'], ctaUrl: 'https://example.com/book' };
const ENV = {
  GBP_OAUTH_CLIENT_ID: 'cid', GBP_OAUTH_CLIENT_SECRET: 'csecret-xyz', GBP_OAUTH_REFRESH_TOKEN: 'refresh-abc',
  CARE_APPROVAL_SECRET: 'approval-secret', CRON_SECRET: 'cron', PLG_CARE_CLIENTS: JSON.stringify([CLIENT]),
};
const rev = (id, stars, comment, extra = {}) => ({
  reviewId: id, name: `accounts/111/locations/222/reviews/${id}`, reviewer: { displayName: extra.name ?? 'Sam Lee' },
  starRating: stars, comment, createTime: extra.createTime || '2026-11-20T10:00:00Z', updateTime: extra.updateTime || '2026-11-20T10:00:00Z', ...(extra.reply ? { reviewReply: { comment: 'x', updateTime: '2026-11-21T10:00:00Z' } } : {}),
});
const REVIEWS = [
  rev('rev1', 'FIVE', 'Great haircut, fast and friendly!'),
  rev('rev2', 'ONE', 'Long wait.', { name: 'Pat Roe' }),
  rev('rev3', 'FIVE', 'Loved it', { reply: true }),
  rev('rev4', 'FOUR', 'Nice', { createTime: '2026-09-01T10:00:00Z', updateTime: '2026-09-01T10:00:00Z' }),
];

function fakeGoogle({ posts = [] } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body });
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'tok-123' });
    if (u.includes('/reviews/') && u.endsWith('/reply')) return json({ comment: 'ok' });
    if (u.includes('/reviews')) return json({ reviews: REVIEWS });
    if (u.includes('/localPosts') && (init.method === 'POST')) return json({ name: 'post1' });
    if (u.includes('/localPosts')) return json({ localPosts: posts });
    if (u.includes('fetchMultiDailyMetricsTimeSeries')) {
      const month = new URL(u).searchParams.get('dailyRange.start_date.month');
      const scale = month === '11' ? 12 : 10;
      const dv = (n) => [{ date: { year: 2026, month: Number(month), day: 1 }, value: String(n) }, { date: { year: 2026, month: Number(month), day: 2 } }];
      const s = (m, n) => ({ dailyMetric: m, timeSeries: { datedValues: dv(n) } });
      return json({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [s('BUSINESS_IMPRESSIONS_MOBILE_MAPS', scale * 10), s('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', scale * 5), s('CALL_CLICKS', scale), s('WEBSITE_CLICKS', 4), s('BUSINESS_DIRECTION_REQUESTS', 3)] }] });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  impl.calls = calls;
  return impl;
}

const mkRes = () => {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = () => res;
  return res;
};
const mails = [];
const sendEmail = async (m) => { mails.push(m); return { id: 'e' + mails.length }; };
const NOW = new Date('2026-11-23T14:00:00Z');

/* 1. tokens */
{
  const t = signToken({ c: 'a' }, 's');
  assert.equal(verifyToken(t, 's').c, 'a');
  assert.equal(verifyToken(t, 'other'), null, 'wrong secret');
  assert.equal(verifyToken(t.slice(0, -2) + 'xx', 's'), null, 'tampered signature');
  assert.equal(verifyToken(t, 's', { now: Date.now() + 15 * 86400000 }), null, 'expired after 14 days');
  assert.equal(verifyToken('garbage', 's'), null);
}

/* 2. drafting rules */
{
  const good = draftReply(REVIEWS[0], CLIENT);
  const bad = draftReply(REVIEWS[1], CLIENT);
  assert.equal(good.needsReview, false);
  assert.equal(bad.needsReview, true, 'low rating is flagged');
  assert.ok(bad.text.includes('owner@example.com'));
  assert.equal(draftReply(REVIEWS[0], CLIENT).text, good.text, 'deterministic');
  for (const t of [good.text, bad.text, draftReply(rev('x', 'THREE', 'ok'), CLIENT).text, draftPost(CLIENT, '2026-W47', REVIEWS).summary]) {
    assert.ok(!t.includes('—'), 'no em dashes');
    assert.ok(!/guarantee|best in|#1|free\b/i.test(t), 'no promises');
  }
  const anon = draftReply({ ...REVIEWS[0], reviewer: { displayName: 'A Google User' } }, CLIENT);
  assert.ok(!anon.text.includes('A Google'), 'anonymous reviewers are not named');
  const post = draftPost(CLIENT, '2026-W47', REVIEWS);
  assert.ok(post.summary.length <= 1400);
  assert.deepEqual(post.callToAction, { actionType: 'LEARN_MORE', url: 'https://example.com/book' });
  assert.equal(weekKey(new Date('2026-11-23T00:00:00Z')), '2026-W48');
}

/* 3. weekly digest: auth, inert, and never publishes */
let approveUrl;
{
  let res = mkRes();
  await runWeekly({ headers: {} }, res, { env: ENV });
  assert.equal(res.statusCode, 401);
  res = mkRes();
  await runWeekly({ headers: { authorization: 'Bearer nope' } }, res, { env: ENV });
  assert.equal(res.statusCode, 401, 'wrong cron secret');
  res = mkRes();
  await runWeekly({ headers: { authorization: 'Bearer cron' } }, res, { env: { CRON_SECRET: 'cron' } });
  assert.deepEqual(res.body, { configured: false }, 'inert until Google is configured');

  const fetchImpl = fakeGoogle();
  res = mkRes();
  await runWeekly({ headers: { authorization: 'Bearer cron' } }, res, { env: ENV, fetchImpl, sendEmail, now: NOW });
  assert.equal(res.statusCode, 200);
  assert.equal(mails.length, 1, 'exactly one email');
  assert.equal(mails[0].to, 'adam@primelocalgrowth.com');
  assert.ok(mails[0].subject.includes('2 replies, 1 post'), mails[0].subject);
  assert.ok(mails[0].html.includes('Review and publish'));
  assert.ok(!mails[0].html.includes('tok-123') && !mails[0].html.includes('csecret') && !mails[0].html.includes('refresh-abc'), 'no secrets in email');
  assert.ok(mails[0].html.includes('Read this one before you approve it.'), 'low rating flagged in digest');
  assert.ok(!fetchImpl.calls.some((c) => c.method === 'PUT' || (c.method === 'POST' && c.url.includes('localPosts'))), 'weekly run publishes nothing');
  approveUrl = decodeURIComponent(mails[0].html.match(/care-approve\?t=([^"]+)"/)[1]);
}

/* 4. approval page: GET is read-only, POST publishes only what was selected and allowed */
{
  const get = async (t, fetchImpl) => { const r = mkRes(); await runApprove({ method: 'GET', query: { t } }, r, { env: ENV, fetchImpl }); return r; };
  const post = async (body, fetchImpl) => { const r = mkRes(); await runApprove({ method: 'POST', body }, r, { env: ENV, fetchImpl }); return r; };

  let g = fakeGoogle();
  let r = await get(approveUrl, g);
  assert.equal(r.statusCode, 200);
  assert.ok(r.body.includes('Great haircut') && r.body.includes('Publish selected'));
  assert.ok(!r.body.includes('Loved it'), 'already answered review is not offered');
  assert.ok(!/name="reply_rev2" value="1" checked/.test(r.body), 'low rating is unchecked by default');
  assert.ok(/name="reply_rev1" value="1" checked/.test(r.body));
  assert.ok(!g.calls.some((c) => c.method === 'PUT' || c.method === 'POST' && c.url.includes('localPosts')), 'GET never publishes');
  assert.equal(r.headers['x-robots-tag'], 'noindex');

  r = await get(approveUrl.slice(0, -3) + 'abc', fakeGoogle());
  assert.equal(r.statusCode, 403, 'tampered link rejected');

  g = fakeGoogle();
  r = await post({ t: approveUrl, reply_rev1: '1', reply_rev3: '1', reply_evil: '1' }, g);
  const puts = g.calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 1, 'only the selected, allowed reply is published');
  assert.ok(puts[0].url.endsWith('/reviews/rev1/reply'));
  assert.ok(JSON.parse(puts[0].body).comment.length > 10);
  assert.ok(!g.calls.some((c) => c.method === 'POST' && c.url.includes('localPosts')), 'post not selected, not published');

  g = fakeGoogle();
  r = await post({ t: approveUrl, post: '1' }, g);
  const created = g.calls.filter((c) => c.method === 'POST' && c.url.includes('localPosts'));
  assert.equal(created.length, 1);
  assert.equal(JSON.parse(created[0].body).topicType, 'STANDARD');
  const summary = JSON.parse(created[0].body).summary;

  g = fakeGoogle({ posts: [{ summary, createTime: '2026-11-23T00:00:00Z' }] });
  r = await post({ t: approveUrl, post: '1' }, g);
  assert.ok(!g.calls.some((c) => c.method === 'POST' && c.url.includes('localPosts')), 'duplicate post is skipped');
  assert.ok(r.body.includes('already published'));

  r = await post({ t: approveUrl }, fakeGoogle());
  assert.ok(r.body.includes('Nothing was selected'));
  r = mkRes();
  await runApprove({ method: 'GET', query: { t: approveUrl } }, r, { env: { CARE_APPROVAL_SECRET: 'x' } });
  assert.equal(r.statusCode, 503, 'unconfigured is inert');
}

/* 5. monthly report */
{
  assert.deepEqual(summarizeMetrics({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: 'CALL_CLICKS', timeSeries: { datedValues: [{ value: '4' }, {}] } }] }] }), { impressions: 0, calls: 4, websiteClicks: 0, directions: 0 }, 'zero values are omitted by Google');
  assert.equal(compare(12, 10).pct, 20);
  assert.equal(compare(5, 0).pct, null, 'no division by zero');

  let res = mkRes();
  await runMonthly({ headers: {} }, res, { env: ENV });
  assert.equal(res.statusCode, 401);

  mails.length = 0;
  res = mkRes();
  await runMonthly({ headers: { authorization: 'Bearer cron' } }, res, { env: ENV, fetchImpl: fakeGoogle(), sendEmail, now: new Date('2026-12-02T15:00:00Z') });
  assert.equal(res.body.period, 'November 2026');
  assert.equal(mails.length, 1, 'default is a preview to Adam only');
  assert.equal(mails[0].to, 'adam@primelocalgrowth.com');
  assert.ok(mails[0].subject.startsWith('Preview, not sent to client'));
  assert.ok(mails[0].html.includes('up 20%'), 'calls 12 vs 10');
  assert.ok(mails[0].html.includes('1 post') === false, 'no post claim when Google returns no posts');
  assert.ok(/0 posts published/.test(mails[0].html) === false);

  mails.length = 0;
  res = mkRes();
  await runMonthly({ headers: { authorization: 'Bearer cron' } }, res, { env: { ...ENV, PLG_REPORTS_AUTOSEND: 'true' }, fetchImpl: fakeGoogle({ posts: [{ createTime: '2026-11-05T00:00:00Z', summary: 'a' }, { createTime: '2026-10-05T00:00:00Z', summary: 'b' }] }), sendEmail, now: new Date('2026-12-02T15:00:00Z') });
  assert.equal(mails.length, 2, 'client plus a copy to Adam');
  assert.deepEqual(mails.map((m) => m.to).sort(), ['adam@primelocalgrowth.com', 'owner@example.com']);
  assert.ok(mails[0].html.includes('1 post published') && mails[0].html.includes('1 review reply posted'));
  assert.ok(!mails[0].html.includes('—'));
}

console.log('PASS care engine: stateless signed approvals, GET never publishes, only emailed reviews can be answered, duplicates skipped, monthly numbers and activity come from Google.');
