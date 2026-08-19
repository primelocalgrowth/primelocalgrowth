/**
 * Saves a scorecard run as a shareable report and returns its /s/<id> link.
 *
 * The checks are re-run here rather than accepting a score from the client.
 * Trusting a posted score would let anyone publish a fabricated "report" on
 * this domain, so the stored record is always one this server measured.
 */
import { randomUUID } from 'node:crypto';
import { runScorecard, normaliseUrl, assertPublicUrl } from './scorecard.js';
import { saveResult, storeConfigured } from './utils/scorecard-store.js';

const rateLimit = new Map();
const MAX_PER_WINDOW = 4;
const WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  for (const [key, entry] of rateLimit) {
    if (now - entry.windowStart > WINDOW_MS) rateLimit.delete(key);
  }
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimit.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!storeConfigured()) {
    return res.status(503).json({ error: 'Sharing is not enabled yet.', configured: false });
  }

  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many saved reports from this network. Please wait a few minutes.' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { url: rawUrl, businessName = '', publicConsent = false } = body;
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2000) {
    return res.status(400).json({ error: 'Please provide the website address to score.' });
  }
  if (businessName != null && typeof businessName !== 'string') {
    return res.status(400).json({ error: 'Invalid businessName' });
  }

  let target;
  try {
    target = normaliseUrl(rawUrl);
    await assertPublicUrl(target);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'That address could not be reached.' });
  }

  let result;
  try {
    result = await runScorecard(target, Date.now(), requestId);
  } catch (error) {
    console.error(JSON.stringify({ event: 'scorecard_save_run_failed', requestId, message: error?.message }));
    return res.status(502).json({ error: 'We could not score that site right now.' });
  }
  if (!result.ok) return res.status(200).json({ ok: false, reason: result.reason });

  try {
    const saved = await saveResult({
      ...result,
      businessName: String(businessName || '').slice(0, 160),
      // Publishing a named report about someone's business needs their say-so.
      publicConsent: publicConsent === true || publicConsent === 'true',
    });
    console.log(JSON.stringify({ event: 'scorecard_saved', requestId, id: saved.id, score: saved.score }));
    return res.status(200).json({ ok: true, id: saved.id, shareUrl: `/s/${saved.id}`, score: saved.score, band: saved.band });
  } catch (error) {
    console.error(JSON.stringify({ event: 'scorecard_save_failed', requestId, message: error?.message }));
    return res.status(502).json({ error: 'We could not save that report.' });
  }
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
