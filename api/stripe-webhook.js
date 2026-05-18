/**
 * Stripe Webhook Handler
 * Fires on checkout.session.completed
 * Sends the client a welcome email with the GBP Access Guide PDF link
 *
 * Setup in Stripe Dashboard:
 *   Developers → Webhooks → Add endpoint
 *   URL: https://primelocalgrowth.com/api/stripe-webhook
 *   Events to listen: checkout.session.completed
 *   Copy the signing secret → add to Vercel env as STRIPE_WEBHOOK_SECRET
 */

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
  const firstName = name.split(' ')[0];
  const productId = session.metadata?.product || detectProduct(session);

  if (!email) {
    console.error('No email in session:', session.id);
    return res.status(200).json({ received: true });
  }

  await sendWelcomeEmail(email, firstName, productId, session);

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

// Does this product require GBP Manager access?
function needsGbpAccess(productId) {
  const noAccessProducts = ['local-domination', 'audit'];
  return !noAccessProducts.includes(productId);
}

// ─────────────────────────────────────────────
// EMAIL TEMPLATES per product
// ─────────────────────────────────────────────
function getEmailContent(firstName, productId, sendGuide = true) {
  const guideUrl = 'https://primelocalgrowth.com/downloads/gbp-access-guide';
  const videoUrl = 'https://primelocalgrowth.com/welcome-video'; // 🎬 live

  const videoLine = `<p style="margin:16px 0;"><a href="${videoUrl}" style="display:inline-block;background:#1a1f26;color:#f59e0b;border:1px solid rgba(245,158,11,0.4);text-decoration:none;font-family:Arial,sans-serif;font-weight:600;font-size:14px;padding:10px 22px;border-radius:6px;">▶ Watch the 2-Minute Walkthrough First →</a></p>`;

  const base = `
    <div style="font-family:'Georgia',serif;max-width:600px;margin:0 auto;color:#1a1a1a;font-size:16px;line-height:1.7;">
      <div style="background:#0f1419;padding:24px 32px;border-radius:8px 8px 0 0;margin-bottom:0;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#fff;">Prime <span style="color:#f59e0b;">Local</span> Growth</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;">
  `;
  const footer = `
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0;">
        <p style="font-size:14px;color:#666;">Questions? Hit reply — I read every email personally.<br>
        — Adam Rome · Prime Local Growth · adam@primelocalgrowth.com</p>
      </div>
    </div>
  `;

  if (productId === 'local-domination') {
    return {
      subject: `You're in — here's your Local Domination System`,
      html: base + `
        <p>Hi ${firstName},</p>
        <p>Your Local Domination System is ready. Here's everything in one place:</p>
        <p style="margin:24px 0;">
          <a href="https://primelocalgrowth.com/local-domination" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">Access Your System →</a>
        </p>
        <p><strong>What to do first:</strong></p>
        <ol style="padding-left:20px;">
          <li style="margin-bottom:8px;">Read Week 1 of the roadmap — it's designed to take 20–30 minutes</li>
          <li style="margin-bottom:8px;">Run through the GBP audit checklist on your own listing</li>
          <li style="margin-bottom:8px;">If you get stuck on anything, just reply to this email</li>
        </ol>
        <p>If you'd rather have me handle it entirely, the Growth plan is the next step: <a href="https://primelocalgrowth.com/services" style="color:#f59e0b;">primelocalgrowth.com/services</a></p>
      ` + footer
    };
  }

  // GBP management plans + one-time services that need access
  const planNames = { starter: 'Starter', growth: 'Growth', dominate: 'Dominate', elite: 'Elite', 'gbp-setup': 'GBP Setup', 'nap-fix': 'NAP Fix', 'review-pack': 'Review Pack', general: '' };
  const planName  = planNames[productId] || '';

  const guideBlock = sendGuide ? `
      <p><strong>Step 2 — Grant Manager access (3 minutes):</strong></p>
      <p style="margin:20px 0;">
        <a href="${guideUrl}" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">Open the Step-by-Step Access Guide →</a>
      </p>
      <p style="font-size:14px;color:#666;">Add <strong>primelocalgrowth@gmail.com</strong> as a <strong>Manager</strong> (not Owner). You stay in full control at all times.</p>
  ` : '';

  return {
    subject: `Welcome to PLG${planName ? ' ' + planName : ''} — watch this first (2 min)`,
    html: base + `
      <p>Hi ${firstName},</p>
      <p>Welcome — I'm excited to get started on your Google listing.</p>
      <p><strong>Step 1 — Watch this 2-minute video</strong> so you know exactly what we're doing and why:</p>
      ${videoLine}
      ${guideBlock}
      <p><strong>What happens once you grant access:</strong></p>
      <ul style="padding-left:20px;">
        <li style="margin-bottom:8px;"><strong>Hour 0–2:</strong> I accept your invitation and run a full diagnostic audit</li>
        <li style="margin-bottom:8px;"><strong>Hours 2–12:</strong> Full 360° optimization — keywords, photos, services, Q&A, NAP</li>
        <li style="margin-bottom:8px;"><strong>Hours 12–24:</strong> Posting schedule, review monitoring, competitor tracking activated</li>
      </ul>
      <p style="background:#1a1f26;border-left:3px solid #f59e0b;padding:14px 18px;border-radius:0 6px 6px 0;font-size:14px;color:#d1d5db;">You stay the Primary Owner at all times. Manager access means I can post and optimize — I cannot transfer or delete your listing.</p>
      <p>I'll send you a confirmation when access is accepted and again when your first optimization is complete — typically within 24 hours.</p>
    ` + footer
  };
}

// ─────────────────────────────────────────────
// SEND EMAIL via Resend
// ─────────────────────────────────────────────
async function sendWelcomeEmail(email, firstName, productId, session) {
  if (!process.env.RESEND_API_KEY) {
    console.log('No RESEND_API_KEY — skipping email for', email);
    return;
  }

  const { subject, html } = getEmailContent(firstName, productId, needsGbpAccess(productId));

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    'Adam Rome <adam@primelocalgrowth.com>',
        to:      email,
        subject,
        html,
        reply_to: 'adam@primelocalgrowth.com'
      })
    });

    if (!r.ok) console.error('Resend error:', r.status, await r.text());
    else console.log('Welcome email sent to', email, '— product:', productId);
  } catch (err) {
    console.error('Send email failed:', err);
  }

  // Notify Adam
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    'Prime Local Growth <adam@primelocalgrowth.com>',
        to:      'adam@primelocalgrowth.com',
        subject: `💰 New client: ${firstName} (${productId}) — ${email}`,
        html:    `<p><strong>New payment received.</strong></p><p>Client: ${firstName} (${email})<br>Product: ${productId}<br>Session: ${session.id}</p>`
      })
    });
  } catch { /* non-critical */ }
}
