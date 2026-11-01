/**
 * Monthly Profile Care report (Vercel cron, 2nd of the month).
 *
 * Pulls last month's Google numbers (and the month before for comparison),
 * counts the work Google shows we did, and builds a plain-English report.
 * Safe default: the report goes to Adam only. Set PLG_REPORTS_AUTOSEND=true to
 * send each report to the client's email with a copy to Adam.
 */
import { sendEmail } from '../api/utils/email.js';
import {
  fetchMonthMetrics,
  getAccessToken,
  gbpConfigured,
  listLocalPosts,
  listReviews,
  monthBefore,
  monthLabel,
  previousMonth,
} from './gbp.js';
import { buildMonthlyReport, loadClients } from './care.js';

const ADAM = 'adam@primelocalgrowth.com';
const FROM = 'Prime Local Growth <adam@primelocalgrowth.com>';
const safeMessage = (err) => String(err?.message || 'unknown error').replace(/[\r\n]+/g, ' ').slice(0, 120);

const inMonth = (iso, { year, month }) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
};

export async function runMonthly(req, res, deps = {}) {
  const env = deps.env || process.env;
  const authorized = env.CRON_SECRET && req.headers?.authorization === `Bearer ${env.CRON_SECRET}`;
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });
  if (!gbpConfigured(env)) return res.status(200).json({ configured: false });

  let clients;
  try {
    clients = loadClients(env);
  } catch (err) {
    return res.status(500).json({ error: safeMessage(err) });
  }
  if (!clients.length) return res.status(200).json({ configured: true, clients: 0 });

  const fetchImpl = deps.fetchImpl || fetch;
  const send = deps.sendEmail || sendEmail;
  const period = previousMonth(deps.now || new Date());
  const prior = monthBefore(period);
  const label = monthLabel(period);
  const autosend = env.PLG_REPORTS_AUTOSEND === 'true';

  let token;
  try {
    token = await getAccessToken({ env, fetchImpl });
  } catch (err) {
    console.error('care-monthly auth failed:', safeMessage(err));
    return res.status(502).json({ error: 'Google authorization failed' });
  }

  const failures = [];
  let sent = 0;
  for (const client of clients) {
    try {
      const [current, previous, reviews, posts] = await Promise.all([
        fetchMonthMetrics(token, client, period, { fetchImpl }),
        fetchMonthMetrics(token, client, prior, { fetchImpl }),
        listReviews(token, client, { fetchImpl }),
        listLocalPosts(token, client, { fetchImpl }),
      ]);
      const dated = posts.filter((p) => p.createTime);
      const report = buildMonthlyReport({
        client,
        monthLabelText: label,
        current,
        previous,
        newReviews: reviews.filter((r) => inMonth(r.createTime, period)),
        activity: {
          posts: dated.length ? dated.filter((p) => inMonth(p.createTime, period)).length : null,
          replies: reviews.filter((r) => inMonth(r.reviewReply?.updateTime, period)).length,
        },
      });

      if (autosend && client.email) {
        await send({ to: client.email, from: FROM, subject: report.subject, html: report.html, replyTo: ADAM });
        await send({ to: ADAM, from: FROM, subject: `[Sent to ${client.businessName}] ${report.subject}`, html: report.html });
      } else {
        await send({ to: ADAM, from: FROM, subject: `Preview, not sent to client: ${report.subject}`, html: report.html });
      }
      sent += 1;
    } catch (err) {
      failures.push(`${client.businessName}: ${safeMessage(err)}`);
    }
  }

  if (failures.length) {
    await send({
      to: ADAM,
      from: FROM,
      subject: `Monthly reports: ${failures.length} could not be built`,
      html: `<p>${failures.map((f) => f.replace(/[<>&]/g, '')).join('<br>')}</p>`,
    });
  }
  return res.status(200).json({ period: label, sent, failed: failures.length, autosend });
}

export default function handler(req, res) {
  return runMonthly(req, res);
}
