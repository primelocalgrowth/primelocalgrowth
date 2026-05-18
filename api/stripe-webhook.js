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
// DETECT PRODUCT from line items or metadata
// ─────────────────────────────────────────────
function detectProduct(session) {
  // Tag products in Stripe metadata or use payment link IDs
  const paymentLink = session.payment_link || '';
  const amount      = session.amount_total || 0;

  // Local Domination System — $397 one-time
  if (paymentLink === 'plink_1TYEDeDczhj1VijZtWUwl1bo' || amount === 39700) {
    return 'local-domination';
  }
  // Monthly plans — GBP management
  if (amount === 29700) return 'starter';
  if (amount === 49700) return 'growth';
  if (amount === 69700) return 'dominate';
  if (amount === 149700) return 'elite';

  return 'general';
}

// ─────────────────────────────────────────────
// EMAIL TEMPLATES per product
// ─────────────────────────────────────────────
function getEmailContent(firstName, productId) {
  const guideUrl = 'https://primelocalgrowth.com/downloads/gbp-access-guide';
  // 🎬 VIDEO: When your walkthrough video is ready, replace null below with the URL
  const videoUrl = null; // e.g. 'https://www.loom.com/share/...' or HeyGen/Synthesia link

  const videoLine = videoUrl
    ? `<p style="margin:16px 0;"><a href="${videoUrl}" style="display:inline-block;background:#1a1f26;color:#f59e0b;border:1px solid rgba(245,158,11,0.4);text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:6px;">▶ Watch the 2-Minute Walkthrough Video →</a></p>`
    : '';

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

  // Monthly management plans — send GBP access guide
  const planNames = { starter: 'Starter', growth: 'Growth', dominate: 'Dominate', elite: 'Elite', general: '' };
  const planName  = planNames[productId] || '';

  return {
    subject: `Welcome to PLG${planName ? ' ' + planName : ''} — one quick step to get started`,
    html: base + `
      <p>Hi ${firstName},</p>
      <p>Welcome — I'm excited to get to work on your Google listing.</p>
      <p><strong>One thing I need from you before we can start:</strong> Manager access to your Google Business Profile. It takes about 4 steps and roughly 3 minutes.</p>
      <p style="margin:24px 0;">
        <a href="${guideUrl}" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">Open the Access Guide →</a>
      </p>
      ${videoLine}
      <p><strong>What happens once you grant access:</strong></p>
      <ul style="padding-left:20px;">
        <li style="margin-bottom:8px;"><strong>Hour 0–2:</strong> I accept your invitation and run a full diagnostic audit</li>
        <li style="margin-bottom:8px;"><strong>Hours 2–12:</strong> Full 360° optimization — keywords, photos, services, Q&A, NAP</li>
        <li style="margin-bottom:8px;"><strong>Hours 12–24:</strong> Posting schedule, review monitoring, competitor tracking activated</li>
      </ul>
      <p style="background:#1a1f26;border-left:3px solid #f59e0b;padding:14px 18px;border-radius:0 6px 6px 0;font-size:14px;color:#d1d5db;">You stay the Primary Owner at all times. Manager access means I can post and edit — I cannot transfer or delete your listing.</p>
      <p>Once access is granted, I'll send you a confirmation and your first optimization report within 24 hours.</p>
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

  const { subject, html } = getEmailContent(firstName, productId);

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
