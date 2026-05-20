/**
 * Stripe Webhook Handler
 * Fires on checkout.session.completed
 * Sends welcome email + onboarding timeline via centralized email utilities
 *
 * Setup in Stripe Dashboard:
 *   Developers → Webhooks → Add endpoint
 *   URL: https://primelocalgrowth.com/api/stripe-webhook
 *   Events to listen: checkout.session.completed
 *   Copy the signing secret → add to Vercel env as STRIPE_WEBHOOK_SECRET
 */

import { sendCustomerWelcome, sendOnboardingChecklist, sendEmail } from './utils/email.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  // Verify Stripe signature
  let event;
  if (secret) {
    try {
      // Manual HMAC verification (no Stripe SDK needed)
      const crypto = await import('crypto');
      const [, timestampPart, v1Part] = sig.split(',').map(p => p.split('='));
      const timestamp = timestampPart;
      const v1        = v1Part;
      const payload   = `${timestamp}.${rawBody.toString()}`;
      const expected  = crypto.default
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      if (expected !== v1) {
        console.error('Stripe signature mismatch');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } catch (err) {
      console.error('Webhook signature error:', err);
      return res.status(400).json({ error: 'Signature verification failed' });
    }
  }

  let body;
  try { body = JSON.parse(rawBody.toString()); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  if (body.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session   = body.data.object;
  const email     = session.customer_details?.email || session.customer_email;
  const name      = session.customer_details?.name  || 'there';
  const productId = session.metadata?.product || detectProduct(session);

  if (!email) {
    console.error('No email in session:', session.id);
    return res.status(200).json({ received: true });
  }

  try {
    // Send welcome email with customized content based on product
    if (process.env.RESEND_API_KEY) {
      const customer = { email, name };
      await sendCustomerWelcome(customer, productId);
      console.log('Welcome email sent to', email, '— product:', productId);
    }

    // Send onboarding checklist email for management plans
    if (process.env.RESEND_API_KEY && isManagementPlan(productId)) {
      const customer = { email, name };
      await sendOnboardingChecklist(customer, productId);
      console.log('Onboarding checklist sent to', email);
    }

    // Notify Adam of new customer
    if (process.env.RESEND_API_KEY) {
      const firstName = name.split(' ')[0];
      await sendEmail({
        to: 'adam@primelocalgrowth.com',
        from: 'Prime Local Growth <adam@primelocalgrowth.com>',
        subject: `💰 New client: ${firstName} (${productId}) — ${email}`,
        html: `<p><strong>New payment received.</strong></p><p>Client: ${firstName} (${email})<br>Product: ${productId}<br>Session: ${session.id}</p>`
      });
    }
  } catch (err) {
    console.error('Error processing payment:', err);
    return res.status(500).json({ error: 'Failed to process payment' });
  }

  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────
// DETECT PRODUCT from payment link ID or amount
//
// Products that need GBP access guide:
//   starter, growth, dominate, elite         — ongoing management
//   gbp-setup                                — one-time build/optimize
//   review-pack                              — needs access to respond
//   nap-fix                                  — send just in case
//
// Products that do NOT need GBP access guide:
//   local-domination                         — DIY system, no access needed
//   audit                                    — report only, no access needed
// ─────────────────────────────────────────────
function detectProduct(session) {
  const paymentLink = session.payment_link || '';
  const amount      = session.amount_total || 0;

  // Match by Stripe Payment Link ID first (most reliable)
  const linkMap = {
    // Monthly management plans
    'plink_1TYCQxDczhj1VijZjERavlM2': 'starter',          // $297/mo Starter
    'plink_1TYCQiDczhj1VijZ2SlD9tIP': 'growth',           // $497/mo Growth
    'plink_1TYCQSDczhj1VijZaOIR8Veg': 'dominate',         // $697/mo Dominate
    // One-time services
    'plink_1TYEDeDczhj1VijZtWUwl1bo': 'local-domination', // $397 Local Domination System
    'plink_1TYCLDDczhj1VijZReoAnmLA': 'gbp-setup',        // $397 GBP Full Setup
    'plink_1TYCLtDczhj1VijZpz1yL9Sx': 'audit',            // $197 Local Visibility Audit
    'plink_1TYCLaDczhj1VijZRCuxbFQw': 'nap-fix',          // $247 NAP Consistency Fix
    'plink_1TYCKbDczhj1VijZUxLWIOGt': 'review-pack',      // $147 Review Response Pack
    // Elite — add payment link ID when created in Stripe
    // 'plink_xxx': 'elite',                               // $1,497/mo Elite
  };
  if (linkMap[paymentLink]) return linkMap[paymentLink];

  // Fallback: match by amount
  if (amount === 39700) return 'local-domination'; // $397
  if (amount === 29700) return 'starter';           // $297/mo
  if (amount === 49700) return 'growth';            // $497/mo
  if (amount === 69700) return 'dominate';          // $697/mo
  if (amount === 149700) return 'elite';            // $1,497/mo
  if (amount === 19700) return 'audit';             // $197 audit
  if (amount === 24700) return 'nap-fix';           // $247 NAP fix
  if (amount === 14700) return 'review-pack';       // $147 review pack

  return 'general';
}

// Management plans that warrant onboarding automation
function isManagementPlan(productId) {
  const managementPlans = ['starter', 'growth', 'dominate', 'elite', 'gbp-setup'];
  return managementPlans.includes(productId);
}
