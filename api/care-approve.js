/**
 * Approval page for the weekly digest.
 *
 * GET shows the exact text that would be published, with a checkbox per item.
 * Publishing only happens on POST, because email scanners and link previews
 * fetch GET links and must never publish anything. The signed token limits what
 * can be published to the review IDs listed in the email, and every reply is
 * re-checked against Google so an already-answered review is never overwritten.
 */
import { createLocalPost, getAccessToken, gbpConfigured, listLocalPosts, listReviews, replyToReview } from './utils/gbp.js';
import { draftPost, draftReply, escapeHtml, loadClients, needsReply, verifyToken } from './utils/care.js';
import { starsOf } from './utils/gbp.js';

const page = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#F5F7F3;font-family:Arial,Helvetica,sans-serif;color:#14342B;"><div style="max-width:640px;margin:0 auto;padding:28px 20px;"><h1 style="font-size:22px;margin:0 0 16px;">${escapeHtml(title)}</h1>${body}</div></body></html>`;

function send(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(status).send(html);
}

export async function runApprove(req, res, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  if (!gbpConfigured(env) || !env.CARE_APPROVAL_SECRET) return send(res, 503, page('Not set up yet', '<p>Profile Care publishing is not configured.</p>'));

  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') return res.status(405).end();
  const rawToken = isPost ? req.body?.t : req.query?.t;
  const payload = verifyToken(rawToken, env.CARE_APPROVAL_SECRET, { now: deps.now?.getTime?.() });
  if (!payload) return send(res, 403, page('Link expired', '<p>This link is invalid or has expired. Use the newest weekly email.</p>'));

  let clients;
  try {
    clients = loadClients(env);
  } catch {
    return send(res, 500, page('Setup problem', '<p>Client list could not be read.</p>'));
  }
  const client = clients.find((c) => c.id === payload.c);
  if (!client) return send(res, 404, page('Client not found', '<p>This client is no longer active.</p>'));

  let token;
  let reviews;
  try {
    token = await getAccessToken({ env, fetchImpl });
    reviews = await listReviews(token, client, { fetchImpl });
  } catch {
    return send(res, 502, page('Google is not responding', '<p>Try the link again in a few minutes.</p>'));
  }

  const allowed = new Set(Array.isArray(payload.r) ? payload.r : []);
  const candidates = reviews.filter((r) => allowed.has(r.reviewId) && needsReply(r)).map((review) => ({ review, draft: draftReply(review, client) }));
  const post = payload.p ? draftPost(client, payload.w, reviews) : null;
  const tokenField = `<input type="hidden" name="t" value="${escapeHtml(rawToken)}">`;

  if (!isPost) {
    if (!candidates.length && !post) return send(res, 200, page(client.businessName, '<p>Everything is already handled. Nothing to publish.</p>'));
    const items = candidates
      .map(
        (c) =>
          `<label style="display:block;border:1px solid #E2E8E0;border-radius:12px;padding:12px 14px;margin:0 0 10px;background:#fff;"><input type="checkbox" name="reply_${escapeHtml(c.review.reviewId)}" value="1"${c.draft.needsReview ? '' : ' checked'}> <strong>${'&#9733;'.repeat(starsOf(c.review))}</strong> ${escapeHtml(String(c.review.comment || '(no comment)').slice(0, 300))}<br><span style="display:block;margin-top:6px;"><strong>Reply:</strong> ${escapeHtml(c.draft.text)}</span>${c.draft.needsReview ? '<span style="display:block;margin-top:4px;color:#A46200;font-size:13px;">Low rating: read before you tick this one.</span>' : ''}</label>`,
      )
      .join('');
    const postItem = post
      ? `<label style="display:block;border:1px solid #E2E8E0;border-radius:12px;padding:12px 14px;margin:0 0 10px;background:#fff;"><input type="checkbox" name="post" value="1" checked> <strong>Post:</strong> ${escapeHtml(post.summary)}</label>`
      : '';
    return send(
      res,
      200,
      page(
        `${client.businessName}: approve`,
        `<form method="post" action="/api/care-approve">${tokenField}${items}${postItem}<button type="submit" style="margin-top:8px;background:#FF9F1C;color:#14342B;font-weight:700;border:0;border-radius:999px;padding:14px 26px;font-size:16px;cursor:pointer;">Publish selected</button></form><p style="font-size:13px;color:#5F7268;">Unticked items are skipped. Nothing is published until you press the button.</p>`,
      ),
    );
  }

  const results = [];
  for (const c of candidates) {
    if (!req.body?.[`reply_${c.review.reviewId}`]) continue;
    try {
      await replyToReview(token, c.review.name, c.draft.text, { fetchImpl });
      results.push(`Replied to ${escapeHtml(String(c.review.reviewer?.displayName || 'a reviewer'))}.`);
    } catch {
      results.push(`Could not reply to ${escapeHtml(String(c.review.reviewer?.displayName || 'a reviewer'))}. Try again later.`);
    }
  }
  if (post && req.body?.post) {
    try {
      const existing = await listLocalPosts(token, client, { fetchImpl });
      if (existing.some((p) => p.summary === post.summary)) {
        results.push('This week\'s post was already published. Skipped.');
      } else {
        await createLocalPost(token, client, post, { fetchImpl });
        results.push('Published this week\'s post.');
      }
    } catch {
      results.push('Could not publish the post. Try again later.');
    }
  }
  return send(res, 200, page('Done', results.length ? `<ul>${results.map((r) => `<li>${r}</li>`).join('')}</ul>` : '<p>Nothing was selected, so nothing was published.</p>'));
}

export default function handler(req, res) {
  return runApprove(req, res);
}
