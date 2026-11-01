/**
 * Profile Care: the single serverless entry point.
 *
 *   /api/care?action=weekly   cron, Monday: draft the approval digest
 *   /api/care?action=monthly  cron, 2nd of the month: monthly client reports
 *   /api/care?action=approve  Adam's one-click approval page (GET shows, POST publishes)
 *
 * One file on purpose: Vercel's free plan allows 12 functions and counts every
 * .js under api/. The logic lives in lib/, which is not counted.
 */
import { runApprove } from '../lib/care-approve.js';
import { runMonthly } from '../lib/care-monthly.js';
import { runWeekly } from '../lib/care-weekly.js';

export default function handler(req, res) {
  const action = req.query?.action;
  if (action === 'weekly') return runWeekly(req, res);
  if (action === 'monthly') return runMonthly(req, res);
  if (action === 'approve') return runApprove(req, res);
  return res.status(404).json({ error: 'Not found' });
}
