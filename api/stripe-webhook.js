/**
 * Stripe Webhook Handler
 * Fires on: checkout.session.completed, invoice.paid
 * Actions: transactional onboarding email + Google Sheets status update.
 * Beehiiv is intentionally excluded because payment is not newsletter consent.
 *
 * Setup in Vercel env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  (from Stripe Dashboard > Webhooks)
 *   RESEND_API_KEY         (shared with submit-form.js)
 *   GOOGLE_SHEETS_WEBHOOK_URL
 */

import { sendCustomerWelcome, sendOnboardingChecklist } from './utils/email.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing Stripe signature or webhook secret');
    return res.status(400).json({ error: 'Missing signature' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = await verifyStripeWebhook(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutComplete(event.data.object, event.id);
    } else if (event.type === 'invoice.paid') {
      await handleInvoicePaid(event.data.object, event.id);
    }
  } catch (err) {
    // Log but return 200 so Stripe doesn't retry — errors here are our problem, not Stripe's
    console.error(`Handler error for ${event.type}:`, err.message);
    return res.status(500).json({ error: 'Processing failed' });
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutComplete(session, eventId) {
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';
  const productId = session.metadata?.product_id || 'sprint';
  const plan = session.metadata?.plan || getPlanFromAmount(session.amount_total);

  if (!email) {
    console.warn('checkout.session.completed: no customer email found');
    return;
  }

  const customer = { email, name };

  await updateSheetsToActive(email, name, plan, session.payment_intent || eventId);

  const followUps = await Promise.allSettled([
    sendCustomerWelcome(customer, productId),
    sendOnboardingChecklist(customer, productId),
    notifyAdamOfNewClient(customer, plan, session.amount_total),
  ]);
  logRejectedFollowUps(followUps, eventId);
}

// Emailed Stripe invoices don't emit checkout.session.completed, so the
// invoice-first sales motion (free audit → email → invoice) onboards here.
// Renewals and Checkout subscriptions also emit invoice.paid. Checkout already
// onboards through checkout.session.completed, so only manual invoices run here.
async function handleInvoicePaid(invoice, eventId) {
  const reason = invoice.billing_reason;
  if (reason !== 'manual') return;

  const email = invoice.customer_email;
  const name = invoice.customer_name || '';
  if (!email) {
    console.warn('invoice.paid: no customer email found');
    return;
  }

  const plan = invoice.metadata?.plan || getPlanFromAmount(invoice.amount_paid);
  const productId = invoice.metadata?.product_id || 'sprint';
  const customer = { email, name };

  await updateSheetsToActive(email, name, plan, invoice.id || eventId);

  const followUps = await Promise.allSettled([
    sendCustomerWelcome(customer, productId),
    sendOnboardingChecklist(customer, productId),
    notifyAdamOfNewClient(customer, plan, invoice.amount_paid),
  ]);
  logRejectedFollowUps(followUps, eventId);
}

async function updateSheetsToActive(email, name, plan, paymentId) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      action: 'update_status',
      email,
      name,
      leadStatus: 'Active Client',
      status: 'Active',
      plan,
      startDate: new Date().toISOString().split('T')[0],
      onboardingStep: 1,
      paymentId,
      lastPaymentAt: new Date().toISOString(),
      source: 'stripe-webhook'
    })
  });

  const text = await res.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
  if (!res.ok || result.success === false) {
    throw new Error(`Sheets update failed: ${result.error || result.message || `HTTP ${res.status}`}`);
  }
}

function logRejectedFollowUps(results, eventId) {
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(JSON.stringify({ event: 'stripe_follow_up_failed', eventId, taskIndex: index, error: result.reason?.message || 'unknown' }));
    }
  });
}

async function notifyAdamOfNewClient(customer, plan, amountTotal) {
  const { sendEmail } = await import('./utils/email.js');
  const dollars = amountTotal ? `$${(amountTotal / 100).toFixed(0)}` : 'unknown amount';

  await sendEmail({
    to: 'adam@primelocalgrowth.com',
    from: 'Prime Local Growth <adam@primelocalgrowth.com>',
    subject: `New client payment: ${customer.name || customer.email} — ${plan}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0f172a;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;color:#22c55e;">New Client Payment Received</h2>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e5e5;border-top:none;">
          <p><strong>Name:</strong> ${customer.name || 'N/A'}</p>
          <p><strong>Email:</strong> <a href="mailto:${customer.email}">${customer.email}</a></p>
          <p><strong>Plan:</strong> ${plan}</p>
          <p><strong>Amount:</strong> ${dollars}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr style="margin:16px 0;border:none;border-top:1px solid #e5e5e5;">
          <p style="font-size:13px;color:#666;">Welcome email + onboarding checklist sent automatically. Sheets updated to Active Client.</p>
        </div>
      </div>
    `
  });
}

// Current primary offer: $497 one-time Opportunity Sprint or $497/mo Visibility Management.
// Higher amounts are retained for custom or previously issued proposals.
function getPlanFromAmount(amountTotal) {
  if (!amountTotal) return 'unknown';
  const dollars = amountTotal / 100;
  if (dollars >= 950) return 'Custom Growth';
  if (dollars >= 650) return 'Custom Foundation';
  if (dollars >= 450) return 'Opportunity Sprint / Visibility Management';
  return 'Custom';
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function verifyStripeWebhook(rawBody, sig, secret) {
  // Manual HMAC verification — avoids requiring stripe npm package on Vercel Edge
  const { createHmac, timingSafeEqual } = await import('crypto');

  const parts = sig.split(',').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parts.t;
  const expectedSig = parts.v1;

  if (!timestamp || !expectedSig) throw new Error('Malformed stripe-signature header');

  const tolerance = 300; // 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    throw new Error('Timestamp too old — possible replay attack');
  }

  const payload = `${timestamp}.${rawBody}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');

  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (hmacBuf.length !== expectedBuf.length || !timingSafeEqual(hmacBuf, expectedBuf)) {
    throw new Error('Signature mismatch');
  }

  return JSON.parse(rawBody);
}
