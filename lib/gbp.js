/**
 * Google Business Profile client for the Profile Care automation.
 *
 * Endpoints verified against Google's reference (2026-11-01):
 *   reviews.list / reviews.updateReply / localPosts.create : mybusiness.googleapis.com/v4
 *   fetchMultiDailyMetricsTimeSeries : businessprofileperformance.googleapis.com/v1
 * Scope: https://www.googleapis.com/auth/business.manage
 *
 * Inert until Google approves the project for Business Profile API access and
 * the three GBP_OAUTH_* env vars exist. Every call takes an injectable fetch so
 * the whole flow is tested offline. No call logs a token, header or response body.
 */

export const GBP_METRICS = {
  impressions: [
    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  ],
  calls: ['CALL_CLICKS'],
  websiteClicks: ['WEBSITE_CLICKS'],
  directions: ['BUSINESS_DIRECTION_REQUESTS'],
};

const STAR = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export const starsOf = (review) => STAR[review?.starRating] || 0;

export function gbpConfigured(env = process.env) {
  return Boolean(env.GBP_OAUTH_CLIENT_ID && env.GBP_OAUTH_CLIENT_SECRET && env.GBP_OAUTH_REFRESH_TOKEN);
}

async function call(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

export async function getAccessToken({ env = process.env, fetchImpl = fetch } = {}) {
  if (!gbpConfigured(env)) throw new Error('Google Business Profile OAuth is not configured');
  const data = await call(
    fetchImpl,
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GBP_OAUTH_CLIENT_ID,
        client_secret: env.GBP_OAUTH_CLIENT_SECRET,
        refresh_token: env.GBP_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }).toString(),
    },
    'OAuth token refresh',
  );
  if (!data.access_token) throw new Error('OAuth token refresh returned no access token');
  return data.access_token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** Newest reviews first. */
export async function listReviews(token, client, { fetchImpl = fetch, pageSize = 50 } = {}) {
  const url = `https://mybusiness.googleapis.com/v4/accounts/${client.accountId}/locations/${client.locationId}/reviews?pageSize=${pageSize}&orderBy=${encodeURIComponent('updateTime desc')}`;
  const data = await call(fetchImpl, url, { method: 'GET', headers: auth(token) }, 'List reviews');
  return Array.isArray(data.reviews) ? data.reviews : [];
}

/** Newest posts first (Google returns up to 100 per page; one page covers a month). */
export async function listLocalPosts(token, client, { fetchImpl = fetch } = {}) {
  const url = `https://mybusiness.googleapis.com/v4/accounts/${client.accountId}/locations/${client.locationId}/localPosts?pageSize=100`;
  const data = await call(fetchImpl, url, { method: 'GET', headers: auth(token) }, 'List posts');
  return Array.isArray(data.localPosts) ? data.localPosts : [];
}

export async function replyToReview(token, reviewName, comment, { fetchImpl = fetch } = {}) {
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(reviewName)) throw new Error('Invalid review name');
  return call(
    fetchImpl,
    `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    { method: 'PUT', headers: auth(token), body: JSON.stringify({ comment }) },
    'Reply to review',
  );
}

export async function createLocalPost(token, client, post, { fetchImpl = fetch } = {}) {
  const body = { languageCode: 'en-US', summary: post.summary, topicType: 'STANDARD' };
  if (post.callToAction) body.callToAction = post.callToAction;
  return call(
    fetchImpl,
    `https://mybusiness.googleapis.com/v4/accounts/${client.accountId}/locations/${client.locationId}/localPosts`,
    { method: 'POST', headers: auth(token), body: JSON.stringify(body) },
    'Create post',
  );
}

/** Sums each metric group across the month. Google omits zero values and sends counts as strings. */
export async function fetchMonthMetrics(token, client, { year, month }, { fetchImpl = fetch } = {}) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const metrics = Object.values(GBP_METRICS).flat();
  const params = new URLSearchParams();
  for (const m of metrics) params.append('dailyMetrics', m);
  params.set('dailyRange.start_date.year', String(year));
  params.set('dailyRange.start_date.month', String(month));
  params.set('dailyRange.start_date.day', '1');
  params.set('dailyRange.end_date.year', String(year));
  params.set('dailyRange.end_date.month', String(month));
  params.set('dailyRange.end_date.day', String(lastDay));
  const url = `https://businessprofileperformance.googleapis.com/v1/locations/${client.locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
  const data = await call(fetchImpl, url, { method: 'GET', headers: auth(token) }, 'Fetch metrics');
  return summarizeMetrics(data);
}

export function summarizeMetrics(data) {
  const byMetric = {};
  for (const group of data?.multiDailyMetricTimeSeries || []) {
    for (const series of group.dailyMetricTimeSeries || []) {
      const total = (series.timeSeries?.datedValues || []).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
      byMetric[series.dailyMetric] = (byMetric[series.dailyMetric] || 0) + total;
    }
  }
  const sum = (names) => names.reduce((s, n) => s + (byMetric[n] || 0), 0);
  return {
    impressions: sum(GBP_METRICS.impressions),
    calls: sum(GBP_METRICS.calls),
    websiteClicks: sum(GBP_METRICS.websiteClicks),
    directions: sum(GBP_METRICS.directions),
  };
}

export const monthLabel = ({ year, month }) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const previousMonth = (now = new Date()) => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based current month
  return m === 0 ? { year: y - 1, month: 12 } : { year: y, month: m };
};

export const monthBefore = ({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });

