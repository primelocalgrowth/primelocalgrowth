/**
 * Stripe Webhook — Blueprint Auto-Delivery
 * Fires on checkout.session.completed → sends PDF download email via Resend
 *
 * ENV VARS REQUIRED (add in Vercel Dashboard → Settings → Environment Variables):
 *   STRIPE_WEBHOOK_SECRET   — from Stripe Dashboard → Webhooks → your endpoint → Signing secret
 *   RESEND_API_KEY          — already set
 *   STRIPE_PRICE_GBP        — Price ID for The Google Business Blueprint ($47)
 *   STRIPE_PRICE_REVIEWS    — Price ID for The Review Generation Blueprint ($37)
 *   STRIPE_PRICE_SOCIAL     — Price ID for The Local Social Blueprint ($47)
 *   STRIPE_PRICE_NAP        — Price ID for The NAP & Citations Blueprint ($27)
 *   STRIPE_PRICE_BUNDLE     — Price ID for The Complete Bundle ($97)
 *
 * HOW TO GET PRICE IDs:
 *   Stripe Dashboard → Products → click a product → copy the Price ID (starts with price_)
 *
 * HOW TO GET WEBHOOK SECRET:
 *   Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   Endpoint URL: https://primelocalgrowth.com/api/blueprint-delivery
 *   Event to listen for: checkout.session.completed
 *   After saving → click endpoint → reveal Signing secret → copy to STRIPE_WEBHOOK_SECRET
 */

import crypto from 'crypto';

// Disable Vercel's automatic body parsing — required for Stripe signature verification
export const config = {
  api: { bodyParser: false }
};

// ─── Product → file mapping ───────────────────────────────────────────────────
// Base URL where your PDFs live (static files in /public/downloads/)
const BASE = 'https://primelocalgrowth.com/downloads';

const BLUEPRINTS = {
  GBP:     { name: 'The Google Business Blueprint',     file: `${BASE}/blueprint-google-business.pdf`,  price: '$47' },
  REVIEWS: { name: 'The Review Generation Blueprint',   file: `${BASE}/blueprint-review-generation.pdf`, price: '$37' },
  SOCIAL:  { name: 'The Local Social Blueprint',        file: `${BASE}/blueprint-local-social.pdf`,      price: '$47' },
  NAP:     { name: 'The NAP & Citations Blueprint',     file: `${BASE}/blueprint-nap-citations.pdf`,     price: '$27' },
};

const ALL_FOUR = Object.values(BLUEPRINTS);

// Maps Stripe Price IDs (from env vars) to blueprint(s)
function getPriceMap() {
  return {
    [process.env.STRIPE_PRICE_GBP]:     [BLUEPRINTS.GBP],
    [process.env.STRIPE_PRICE_REVIEWS]: [BLUEPRINTS.REVIEWS],
    [process.env.STRIPE_PRICE_SOCIAL]:  [BLUEPRINTS.SOCIAL],
    [process.env.STRIPE_PRICE_NAP]:     [BLUEPRINTS.NAP],
    [process.env.STRIPE_PRICE_BUNDLE]:  ALL_FOUR,
  };
}

// ─── Stripe signature verification ────────────────────────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts    = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).slice(2);
  const received  = parts.find(p => p.startsWith('v1=')).slice(3);
  const signed    = `${timestamp}.${rawBody}`;
  const expected  = crypto.createHmac('sha256', secret).update(signed).digest('hex');

  // Prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(expected,  'hex')
  );
}

// ─── Read raw body from request stream ────────────────────────────────────────
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// ─── Send delivery email via Resend ───────────────────────────────────────────
async function sendDeliveryEmail(toEmail, toName, blueprints) {
  const isBundle   = blueprints.length > 1;
  const firstName  = toName ? toName.split(' ')[0] : 'there';

  // Build download buttons for each blueprint
  const downloadButtons = blueprints.map(bp => `
    <tr>
      <td style="padding:10px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#0f1419;border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:18px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;">Blueprint</p>
              <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#ffffff;">${bp.name}</p>
              <a href="${bp.file}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 24px;border-radius:6px;">
                Download PDF →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f1419;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1419;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1f26,#0f1419);border-radius:12px 12px 0 0;padding:36px 40px 28px;text-align:center;border-bottom:3px solid #f59e0b;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;">Prime Local Growth</p>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">
              Your ${isBundle ? 'Blueprints are' : 'Blueprint is'} ready. 🎉
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#1a1f26;padding:32px 40px;">
            <p style="margin:0 0 20px;font-size:16px;color:#d1d5db;line-height:1.8;">Hey ${firstName},</p>
            <p style="margin:0 0 24px;font-size:16px;color:#d1d5db;line-height:1.8;">
              Your purchase is confirmed and your ${isBundle ? 'blueprints are' : 'blueprint is'} ready to download right now.
              Click the button${isBundle ? 's' : ''} below — each one opens a direct PDF download.
            </p>

            <!-- Download buttons -->
            <table width="100%" cellpadding="0" cellspacing="0">
              ${downloadButtons}
            </table>

            <p style="margin:28px 0 0;font-size:14px;color:#9ca3af;line-height:1.7;">
              <strong style="color:#ffffff;">Bookmark this email.</strong> These links are permanent — you can re-download any time.
            </p>
          </td>
        </tr>

        <!-- What to do next -->
        <tr>
          <td style="background:#1a1f26;padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:24px;">
              <tr>
                <td style="padding:0 24px;">
                  <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f59e0b;">Recommended next step</p>
                  <p style="margin:0 0 12px;font-size:15px;color:#d1d5db;line-height:1.7;">
                    Start with <strong style="color:#fff;">Section 1</strong> of whichever blueprint matters most right now.
                    Don't try to do everything at once — one section implemented beats five sections half-read.
                  </p>
                  <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">
                    Hit reply if you have questions. We respond to every email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Upsell — only show for single blueprint buyers -->
        ${!isBundle ? `
        <tr>
          <td style="background:#1a1f26;padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1419;border-radius:8px;padding:20px 24px;">
              <tr>
                <td style="padding:0 24px;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f59e0b;">Want all 4 blueprints?</p>
                  <p style="margin:0 0 12px;font-size:14px;color:#9ca3af;line-height:1.7;">
                    Grab the complete bundle for $97 — includes every blueprint plus the Local Social and ${blueprints[0].name.includes('NAP') ? 'Review Generation' : 'NAP & Citations'} guides.
                  </p>
                  <a href="https://buy.stripe.com/eVq5kD9Bo6j1eQrdjkdfG07" style="display:inline-block;background:transparent;color:#f59e0b;text-decoration:none;font-weight:600;font-size:14px;padding:9px 20px;border-radius:6px;border:1px solid rgba(245,158,11,0.4);">
                    Get The Complete Bundle — $97 →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#0f1419;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;border-top:1px solid rgba(245,158,11,0.15);">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f59e0b;">Prime Local Growth</p>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">hello@primelocalgrowth.com &nbsp;·&nbsp; primelocalgrowth.com</p>
            <p style="margin:8px 0 0;font-size:11px;color:#4b5563;">
              Questions about your purchase? Reply to this email — we respond personally.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Prime Local Growth <hello@primelocalgrowth.com>',
      to:      [toEmail],
      subject: `Your ${isBundle ? 'Local Growth Blueprints are' : `${blueprints[0].name} is`} ready to download`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return res.json();
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Read raw body
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read body:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  // 2. Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let valid = false;
  try {
    valid = verifyStripeSignature(rawBody.toString(), sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature verification error:', err);
    return res.status(400).json({ error: 'Signature verification failed' });
  }

  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 3. Parse event
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 4. Only handle completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, action: 'ignored' });
  }

  const session = event.data.object;

  // Only process paid sessions
  if (session.payment_status !== 'paid') {
    return res.status(200).json({ received: true, action: 'not_paid' });
  }

  // 5. Get customer details from session
  const customerEmail = session.customer_details?.email || session.customer_email;
  const customerName  = session.customer_details?.name  || '';

  if (!customerEmail) {
    console.error('No customer email on session:', session.id);
    return res.status(200).json({ received: true, action: 'no_email' });
  }

  // 6. Get price IDs from line items (expand was set on the payment link, or use metadata)
  //    Stripe sends line_items in the session for payment links
  const priceMap    = getPriceMap();
  let blueprints    = [];

  // Try line_items first
  if (session.line_items?.data?.length) {
    for (const item of session.line_items.data) {
      const priceId = item.price?.id;
      if (priceId && priceMap[priceId]) {
        blueprints.push(...priceMap[priceId]);
      }
    }
  }

  // Fallback: check metadata set on payment link
  if (blueprints.length === 0 && session.metadata?.blueprint) {
    const key = session.metadata.blueprint.toUpperCase();
    if (BLUEPRINTS[key]) blueprints.push(BLUEPRINTS[key]);
    if (key === 'BUNDLE')  blueprints.push(...ALL_FOUR);
  }

  // Fallback: check payment link ID via env vars
  if (blueprints.length === 0) {
    console.warn('Could not map price to blueprint. Session:', session.id, 'Line items:', JSON.stringify(session.line_items));
    // Still return 200 so Stripe doesn't retry
    return res.status(200).json({ received: true, action: 'unmapped_product', session: session.id });
  }

  // Deduplicate (bundle already includes all)
  const unique = [...new Map(blueprints.map(b => [b.file, b])).values()];

  // 7. Send delivery email
  try {
    await sendDeliveryEmail(customerEmail, customerName, unique);
    console.log(`Delivery email sent to ${customerEmail} for: ${unique.map(b => b.name).join(', ')}`);
  } catch (err) {
    console.error('Failed to send delivery email:', err);
    // Return 500 so Stripe retries
    return res.status(500).json({ error: 'Email delivery failed' });
  }

  return res.status(200).json({ received: true, action: 'email_sent', to: customerEmail });
}
