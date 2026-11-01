/**
 * Weekly Profile Care digest (Vercel cron, Monday).
 *
 * For every active care client: read new reviews, draft replies, draft one post,
 * then send Adam ONE email with a "Review and publish" button per client.
 * Nothing is published here. Fails closed: no CRON_SECRET match, no run.
 * Inert (200, configured:false) until Google OAuth and the approval secret exist.
 */
import { sendEmail } from './utils/email.js';
import { getAccessToken, gbpConfigured, listReviews } from './utils/gbp.js';
import { buildWeeklyDigest, draftPost, draftReply, loadClients, pendingReviews, weekKey } from './utils/care.js';

const safeMessage = (err) => String(err?.message || 'unknown error').replace(/[\r\n]+/g, ' ').slice(0, 120);

export async function runWeekly(req, res, deps = {}) {
  const env = deps.env || process.env;
  const authorized = env.CRON_SECRET && req.headers?.authorization === `Bearer ${env.CRON_SECRET}`;
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });
  if (!gbpConfigured(env) || !env.CARE_APPROVAL_SECRET) return res.status(200).json({ configured: false });

  let clients;
  try {
    clients = loadClients(env);
  } catch (err) {
    return res.status(500).json({ error: safeMessage(err) });
  }
  if (!clients.length) return res.status(200).json({ configured: true, clients: 0 });

  const fetchImpl = deps.fetchImpl || fetch;
  const send = deps.sendEmail || sendEmail;
  const now = deps.now || new Date();
  const week = weekKey(now);

  let token;
  try {
    token = await getAccessToken({ env, fetchImpl });
  } catch (err) {
    console.error('care-weekly auth failed:', safeMessage(err));
    return res.status(502).json({ error: 'Google authorization failed' });
  }

  const sections = [];
  for (const client of clients) {
    try {
      const reviews = await listReviews(token, client, { fetchImpl });
      const replies = pendingReviews(reviews, { now }).map((review) => ({ review, draft: draftReply(review, client) }));
      sections.push({ client, replies, post: draftPost(client, week, reviews) });
    } catch (err) {
      sections.push({ client, replies: [], post: null, error: safeMessage(err) });
    }
  }

  const digest = buildWeeklyDigest(sections, {
    baseUrl: env.SITE_URL || 'https://www.primelocalgrowth.com',
    secret: env.CARE_APPROVAL_SECRET,
    week,
  });
  if (!digest.hasWork && !digest.errors) return res.status(200).json({ sent: false, reason: 'nothing_to_approve' });

  const response = await send({
    to: 'adam@primelocalgrowth.com',
    from: 'Prime Local Growth <adam@primelocalgrowth.com>',
    subject: digest.subject,
    html: digest.html,
  });
  return res.status(200).json({ sent: Boolean(response), clients: clients.length, errors: digest.errors });
}

export default function handler(req, res) {
  return runWeekly(req, res);
}
