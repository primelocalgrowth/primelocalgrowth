/**
 * Profile Care engine: everything that does not touch the network.
 *
 * Pure and deterministic on purpose. Drafts are written from facts the client
 * record and the review itself provide, so nothing is invented, and the same
 * inputs always produce the same text (the approval page recomputes what the
 * email showed, so no database is needed).
 *
 * Voice rules (brand): plain, direct, no em dashes, no filler, no promises.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { starsOf } from './gbp.js';

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);

/* ---------- signed, expiring approval tokens (stateless) ---------- */

export function signToken(payload, secret, { ttlSeconds = 14 * 86400, now = Date.now() } = {}) {
  if (!secret) throw new Error('Approval secret is not configured');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret, { now = Date.now() } = {}) {
  if (!secret || typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}

/* ---------- clients ---------- */

/** PLG_CARE_CLIENTS is a JSON array: [{id,businessName,city,accountId,locationId,email,phone,services,ctaUrl,active}] */
export function loadClients(env = process.env) {
  if (!env.PLG_CARE_CLIENTS) return [];
  let list;
  try {
    list = JSON.parse(env.PLG_CARE_CLIENTS);
  } catch {
    throw new Error('PLG_CARE_CLIENTS is not valid JSON');
  }
  if (!Array.isArray(list)) throw new Error('PLG_CARE_CLIENTS must be an array');
  return list
    .filter((c) => c && c.active !== false)
    .map((c) => ({
      id: clean(c.id),
      businessName: clean(c.businessName),
      city: clean(c.city),
      accountId: clean(c.accountId),
      locationId: clean(c.locationId),
      email: clean(c.email),
      phone: clean(c.phone),
      services: Array.isArray(c.services) ? c.services.map(clean).filter(Boolean) : [],
      ctaUrl: clean(c.ctaUrl),
    }))
    .filter((c) => c.id && c.businessName && c.accountId && c.locationId);
}

/* ---------- drafting ---------- */

const stableIndex = (key, n) => parseInt(createHash('sha256').update(String(key)).digest('hex').slice(0, 8), 16) % n;

function reviewerFirstName(review) {
  const name = clean(review?.reviewer?.displayName);
  if (!name || review?.reviewer?.isAnonymous || /^a google user$/i.test(name)) return '';
  return name.split(' ')[0].replace(/[^\p{L}'-]/gu, '');
}

const contactLine = (client) => (client.email || client.phone ? ` Please contact us at ${client.email || client.phone} so we can look into it.` : ' Please contact us directly so we can look into it.');

/** One reply per review. Low ratings are flagged so Adam reads them before approving. */
export function draftReply(review, client) {
  const stars = starsOf(review);
  const name = reviewerFirstName(review);
  const hello = name ? `${name}, ` : '';
  const thanks = name ? `Thank you, ${name}.` : 'Thank you.';
  const key = review.reviewId || review.name || '';
  const comment = clean(review.comment).toLowerCase();
  const service = client.services.find((s) => comment.includes(s.toLowerCase()));

  if (stars >= 4) {
    const options = [
      `${thanks} We appreciate you choosing ${client.businessName}.${service ? ` We are glad the ${service} went well.` : ''} See you next time.`,
      `${hello}thanks for the kind words. It means a lot to the whole ${client.businessName} team.`,
      `${thanks} We are happy we could take care of you.${service ? ` Glad the ${service} worked out.` : ''}`,
    ];
    return { text: options[stableIndex(key, options.length)], needsReview: false };
  }
  if (stars === 3) {
    return {
      text: `${thanks} We want every visit to be great, and we would like to hear more about what we could do better.${contactLine(client)}`,
      needsReview: true,
    };
  }
  return {
    text: `${hello}we are sorry we fell short. We take this seriously and want to make it right.${contactLine(client)}`,
    needsReview: true,
  };
}

export const needsReply = (review) => !review.reviewReply?.comment && starsOf(review) > 0;

const WEEK_MS = 7 * 86400000;

/** ISO-like week key, for example 2026-W45. */
export function weekKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Reviews from the last 30 days that still have no reply, oldest first, capped. */
export function pendingReviews(reviews, { now = new Date(), cap = 5 } = {}) {
  const cutoff = now.getTime() - 30 * 86400000;
  return reviews
    .filter((r) => needsReply(r) && new Date(r.updateTime || r.createTime || 0).getTime() >= cutoff)
    .sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0))
    .slice(0, cap);
}

const POST_TOPICS = ['service', 'question', 'review', 'about'];

/** One post per week, rotating topics. Uses only facts the client record or a real review supplies. */
export function draftPost(client, week, reviews = []) {
  const weekNumber = Number(String(week).split('-W')[1]) || 0;
  const idx = (weekNumber + stableIndex(client.id, POST_TOPICS.length)) % POST_TOPICS.length;
  const services = client.services.length ? client.services : [];
  const service = services.length ? services[weekNumber % services.length] : '';
  const place = client.city || 'your area';
  const best = reviews.find((r) => starsOf(r) === 5 && clean(r.comment).length >= 20 && clean(r.comment).length <= 300);

  let topic = POST_TOPICS[idx];
  if (topic === 'review' && !best) topic = 'about';
  if (topic === 'service' && !service) topic = 'about';

  let summary;
  if (topic === 'service') {
    summary = `Need ${service} in ${place}? ${client.businessName} is ready to help. Message us with what you need and we will point you in the right direction.`;
  } else if (topic === 'question') {
    summary = `What is the one thing you want to know before you hire${service ? ` for ${service}` : ''} in ${place}? Ask us. We answer every question.`;
  } else if (topic === 'review') {
    summary = `"${clean(best.comment)}" Thank you to our customers in ${place}. Reviews like this are why we do the work.`;
  } else {
    summary = `${client.businessName} serves ${place} and nearby neighborhoods. Tell us what you need and we will help.`;
  }

  const callToAction = client.ctaUrl
    ? { actionType: 'LEARN_MORE', url: client.ctaUrl }
    : client.phone
      ? { actionType: 'CALL' }
      : undefined;

  return { topic, summary: summary.slice(0, 1400), callToAction };
}

/* ---------- weekly digest email (one email, every client) ---------- */

export function buildWeeklyDigest(sections, { baseUrl, secret, week }) {
  const replyTotal = sections.reduce((n, s) => n + s.replies.length, 0);
  const postTotal = sections.filter((s) => s.post).length;
  const errors = sections.filter((s) => s.error);
  const active = sections.filter((s) => !s.error && (s.replies.length || s.post));

  const block = (s) => {
    const token = signToken({ c: s.client.id, w: week, r: s.replies.map((r) => r.review.reviewId), p: s.post ? 1 : 0 }, secret);
    const link = `${baseUrl}/api/care?action=approve&t=${encodeURIComponent(token)}`;
    const replyHtml = s.replies
      .map(
        (r) =>
          `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong>${'&#9733;'.repeat(starsOf(r.review))}</strong> ${escapeHtml(clean(r.review.comment) || '(no comment)')}<br><span style="color:#14342B;"><strong>Reply:</strong> ${escapeHtml(r.draft.text)}</span>${r.draft.needsReview ? '<br><span style="color:#A46200;font-size:12px;">Read this one before you approve it.</span>' : ''}</p>`,
      )
      .join('');
    const postHtml = s.post ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong>This week's post:</strong> ${escapeHtml(s.post.summary)}</p>` : '';
    return `<div style="border:1px solid #E2E8E0;border-radius:14px;padding:16px 18px;margin:0 0 16px;"><p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#14342B;">${escapeHtml(s.client.businessName)}</p>${replyHtml}${postHtml}<p style="margin:12px 0 0;"><a href="${link}" style="display:inline-block;background:#FF9F1C;color:#14342B;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">Review and publish</a></p></div>`;
  };

  const errorHtml = errors.length
    ? `<p style="font-size:13px;color:#A46200;">Could not check: ${errors.map((s) => `${escapeHtml(s.client.businessName)} (${escapeHtml(s.error)})`).join(', ')}.</p>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#F5F7F3;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:620px;margin:0 auto;background:#fff;"><div style="background:#14342B;padding:20px 28px;"><p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Profile Care approvals</p><p style="margin:2px 0 0;font-size:12px;letter-spacing:.14em;color:#BFD2C7;">WEEK ${escapeHtml(week)}</p></div><div style="padding:24px 28px;"><p style="font-size:15px;line-height:1.6;margin:0 0 18px;">${replyTotal} review ${replyTotal === 1 ? 'reply' : 'replies'} and ${postTotal} ${postTotal === 1 ? 'post' : 'posts'} are ready. Nothing is published until you press the button on the next page. Links expire in 14 days.</p>${active.map(block).join('')}${errorHtml}</div></div></body></html>`;

  return {
    subject: `Profile Care approvals: ${replyTotal} ${replyTotal === 1 ? 'reply' : 'replies'}, ${postTotal} ${postTotal === 1 ? 'post' : 'posts'} (${week})`,
    html,
    hasWork: active.length > 0,
    errors: errors.length,
  };
}

/* ---------- monthly report ---------- */

export function compare(current, previous) {
  const delta = current - previous;
  return { current, previous, delta, pct: previous > 0 ? Math.round((delta / previous) * 100) : null };
}

const phrase = (c, label) => {
  if (c.pct === null) return `${label}: ${c.current}`;
  const dir = c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'flat';
  return dir === 'flat' ? `${label}: ${c.current} (same as last month)` : `${label}: ${c.current} (${dir} ${Math.abs(c.pct)}% from ${c.previous})`;
};

/** Counts come from Google, never assumed. Posts are omitted when Google does not return post dates. */
export function doneLine(activity) {
  const parts = [];
  if (activity.posts !== null) parts.push(`${activity.posts} ${activity.posts === 1 ? 'post' : 'posts'} published to your profile`);
  parts.push(`${activity.replies} review ${activity.replies === 1 ? 'reply' : 'replies'} posted`);
  return `${parts.join(' and ')}.`;
}

export function buildMonthlyReport({ client, monthLabelText, current, previous, newReviews, activity = { posts: null, replies: 0 } }) {
  const rows = [
    ['Times people saw your profile', compare(current.impressions, previous.impressions)],
    ['Calls from your profile', compare(current.calls, previous.calls)],
    ['Website clicks', compare(current.websiteClicks, previous.websiteClicks)],
    ['Direction requests', compare(current.directions, previous.directions)],
  ];
  const reviewLine = newReviews.length
    ? `${newReviews.length} new Google ${newReviews.length === 1 ? 'review' : 'reviews'} this month, averaging ${(newReviews.reduce((s, r) => s + starsOf(r), 0) / newReviews.length).toFixed(1)} stars.`
    : 'No new Google reviews this month. Asking your last few happy customers is the easiest win.';

  const text = [
    `${client.businessName}: ${monthLabelText} results`,
    '',
    ...rows.map(([label, c]) => `- ${phrase(c, label)}`),
    '',
    reviewLine,
    '',
    `What we did: ${doneLine(activity)}`,
    '',
    'Source: Google Business Profile. Views count unique people per day. Numbers move with seasons and competition, and this report describes what happened, not what will happen.',
  ].join('\n');

  const htmlRows = rows
    .map(([label, c]) => `<tr><td style="padding:9px 10px;border-bottom:1px solid #E2E8E0;">${escapeHtml(label)}</td><td style="padding:9px 10px;border-bottom:1px solid #E2E8E0;text-align:right;font-weight:700;">${c.current}</td><td style="padding:9px 10px;border-bottom:1px solid #E2E8E0;text-align:right;color:#5F7268;">${c.pct === null ? '' : `${c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'same'}${c.delta === 0 ? '' : ` ${Math.abs(c.pct)}%`}`}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#F5F7F3;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:620px;margin:0 auto;background:#fff;"><div style="background:#14342B;padding:20px 28px;"><p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${escapeHtml(client.businessName)}</p><p style="margin:2px 0 0;font-size:12px;letter-spacing:.14em;color:#BFD2C7;">${escapeHtml(monthLabelText.toUpperCase())} RESULTS</p></div><div style="padding:24px 28px;"><table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px;">${htmlRows}</table><p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${escapeHtml(reviewLine)}</p><p style="font-size:15px;line-height:1.6;margin:0 0 14px;"><strong>What we did:</strong> ${escapeHtml(doneLine(activity))}</p><p style="font-size:12px;color:#999;line-height:1.5;margin:18px 0 0;">Source: Google Business Profile. Views count unique people per day. Numbers move with seasons and competition, and this report describes what happened, not what will happen. Questions? Reply to this email.</p></div></div></body></html>`;

  return { subject: `${client.businessName}: your ${monthLabelText} Google results`, html, text };
}

export const __internal = { WEEK_MS };
