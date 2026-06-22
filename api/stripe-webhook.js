/**
 * Stripe Webhook Handler
 * Fires on: checkout.session.completed, customer.subscription.created
 * Actions: welcome email + onboarding checklist + Beehiiv active tag + Sheets status update
 *
 * Setup in Vercel env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  (from Stripe Dashboard > Webhooks)
 *   RESEND_API_KEY         (shared with submit-form.js)
 *   BEEHIIV_API_KEY
 *   BEEHIIV_PUBLICATION_ID
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
      await handleCheckoutComplete(event.data.object);
    } else if (event.type === 'customer.subscription.created') {
      await handleSubscriptionCreated(event.data.object);
    }
  } catch (err) {
    // Log but return 200 so Stripe doesn't retry — errors here are our problem, not Stripe's
    console.error(`Handler error for ${event.type}:`, err.message);
  }

  return res.status(200).json({ received: true });
}

async function handleCheckoutComplete(session) {
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';
  const productId = session.metadata?.product_id || 'sprint';
  const plan = session.metadata?.plan || getPlanFromAmount(session.amount_total);

  if (!email) {
    console.warn('checkout.session.completed: no customer email found');
    return;
  }

  const customer = { email, name };

  await Promise.allSettled([
    sendCustomerWelcome(customer, productId),
    sendOnboardingChecklist(customer, productId),
    addBeehiivActiveTag(email, name, plan),
    updateSheetsToActive(email, name, plan),
    notifyAdamOfNewClient(customer, plan, session.amount_total),
  ]);
}

async function handleSubscriptionCreated(subscription) {
  // Fetch customer details from Stripe
  const customerId = subscription.customer;
  const plan = getPlanFromStripePrice(subscription.items?.data?.[0]?.price?.unit_amount);

  // We don't have email from the subscription object directly — it comes via customer
  // Rely on checkout.session.completed for the primary onboarding trigger
  // This handler exists to catch subscriptions created outside of Checkout
  console.log(`Subscription created for customer ${customerId}, plan: ${plan}`);
}

async function addBeehiivActiveTag(email, name, plan) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) return;

  const firstName = name.split(' ')[0] || '';
  const lastName = name.split(' ').slice(1).join(' ') || '';

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      email,
      reactivate_existing: true,
      send_welcome_email: false,
      utm_source: 'stripe-webhook',
      custom_fields: [
        { name: 'first_name', value: firstName },
        { name: 'last_name', value: lastName },
        { name: 'client_status', value: 'active' },
        { name: 'plan', value: plan }
      ]
    })
  });

  if (!res.ok) console.warn(`Beehiiv tag update failed: ${res.status}`);
}

async function updateSheetsToActive(email, name, plan) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_status',
      email,
      name,
      leadStatus: 'Active Client',
      status: 'Active',
      plan,
      startDate: new Date().toISOString().split('T')[0],
      onboardingStep: 1,
      source: 'stripe-webhook'
    })
  });

  if (!res.ok) console.warn(`Sheets update failed: ${res.status}`);
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

function getPlanFromAmount(amountTotal) {
  if (!amountTotal) return 'unknown';
  const dollars = amountTotal / 100;
  if (dollars >= 1400) return 'Elite';
  if (dollars >= 950) return 'AI Visibility (GEO)';
  if (dollars >= 650) return 'Dominate';
  if (dollars >= 450) return 'Sprint';
  if (dollars >= 280) return 'Starter';
  return 'unknown';
}

function getPlanFromStripePrice(unitAmount) {
  if (!unitAmount) return 'unknown';
  const dollars = unitAmount / 100;
  if (dollars >= 1400) return 'Elite';
  if (dollars >= 950) return 'AI Visibility (GEO)';
  if (dollars >= 650) return 'Dominate';
  if (dollars >= 450) return 'Sprint';
  if (dollars >= 280) return 'Starter';
  return 'unknown';
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
  const { createHmac } = await import('crypto');

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

  if (hmac !== expectedSig) throw new Error('Signature mismatch');

  return JSON.parse(rawBody);
}
