/**
 * Email utilities — shared across all API handlers
 * Eliminates duplication, ensures consistency, optimizes for cost/speed
 */

const RESEND_BASE = 'https://api.resend.com/emails';
const FROM_ADAM = 'Adam Rome <adam@primelocalgrowth.com>';
const FROM_PLG = 'Prime Local Growth <adam@primelocalgrowth.com>';

/**
 * Standard unsubscribe footer for all emails
 */
function getEmailFooter() {
  return `
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 20px;">
    <div style="font-size:12px;color:#999;text-align:center;">
      <p style="margin:0;padding:0;line-height:1.6;">
        Prime Local Growth · <a href="tel:210-646-1436" style="color:#0ea5e9;text-decoration:none;">210-646-1436</a> ·
        <a href="mailto:adam@primelocalgrowth.com" style="color:#0ea5e9;text-decoration:none;">adam@primelocalgrowth.com</a>
      </p>
      <p style="margin:4px 0 0;padding:0;">
        <a href="https://www.primelocalgrowth.com/newsletter" style="color:#0ea5e9;text-decoration:none;">Subscribe to Newsletter</a> ·
        <a href="https://www.primelocalgrowth.com/preferences" style="color:#0ea5e9;text-decoration:none;">Manage Preferences</a>
      </p>
    </div>
  `;
}

/**
 * Send email via Resend API
 * @param {Object} config - { to, from, subject, html, replyTo? }
 * @returns {Promise}
 */
export async function sendEmail(config) {
  const { to, from, subject, html, replyTo } = config;

  if (!process.env.RESEND_API_KEY) {
    console.warn('No RESEND_API_KEY — email skipped:', subject);
    return null;
  }

  try {
    const response = await fetch(RESEND_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo && { reply_to: replyTo })
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend error ${response.status}: ${error}`);
    }

    return await response.json();
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

/**
 * Send notification to Adam about form submission
 */
export async function notifyAdamOfLead(lead) {
  const { name, email, phone, businessName, businessType, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, attribution = {}, timestamp } = lead;
  const sourceLabel = attribution.utm_source || attribution.gclid || attribution.fbclid || referrer || 'direct / unknown';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0f172a;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;color:#0ea5e9;">New Lead: ${escapeHtml(name)}</h2>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e5e5e5;border-top:none;font-family:Arial,sans-serif;">
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Business:</strong> ${escapeHtml(businessName)}</p>
        <p><strong>Type:</strong> ${escapeHtml(businessType)}</p>
        ${website ? `<p><strong>Website:</strong> ${escapeHtml(website)}</p>` : ''}
        ${mainService ? `<p><strong>Main Service:</strong> ${escapeHtml(mainService)}</p>` : ''}
        ${visibilityConcern ? `<p><strong>Visibility Concern:</strong><br>${escapeHtml(visibilityConcern)}</p>` : ''}
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p><strong>Phone:</strong> <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone) || 'N/A'}</a></p>
        <p><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>
        <p><strong>Landing/Page:</strong> ${escapeHtml(pagePath || pageUrl || 'N/A')}</p>
        ${situation ? `<p><strong>Situation:</strong><br>${escapeHtml(situation)}</p>` : ''}
        ${attribution.utm_campaign ? `<p><strong>Campaign:</strong> ${escapeHtml(attribution.utm_campaign)}</p>` : ''}
        <p><strong>Submitted:</strong> ${new Date(timestamp).toLocaleString()}</p>
        ${getEmailFooter()}
      </div>
    </div>
  `;

  return sendEmail({
    to: 'adam@primelocalgrowth.com',
    from: FROM_PLG,
    subject: `New Lead: ${name} — ${businessName}`,
    html,
    replyTo: email
  });
}

/**
 * Send auto-reply to lead with next steps
 */
export async function sendLeadAutoReply(lead) {
  const { name, email, businessName, businessType } = lead;
  const firstName = name.split(' ')[0];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#1b3a6b;padding:24px 32px;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Prime Local Growth</p>
      </div>
      <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;">
        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>

        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Got your info for ${escapeHtml(businessName)}. I'm running your free Google visibility audit right now — checking your Google Business Profile, reviews, keywords, and comparing you to local competitors.</p>

        <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 24px;"><strong>You'll get the full report within 24 hours</strong> showing exactly what's working and what's holding you back.</p>

        <p style="font-size:14px;color:#666;line-height:1.6;margin:0;">Questions in the meantime? Just reply to this email — I read every one personally.</p>

        <p style="font-size:14px;color:#666;line-height:1.6;margin:16px 0 0;">— Adam Rome<br>Prime Local Growth<br><a href="tel:210-646-1436" style="color:#0ea5e9;text-decoration:none;">210-646-1436</a></p>

        ${getEmailFooter()}
      </div>
    </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `Your audit is underway, ${firstName}`,
    html,
    replyTo: 'adam@primelocalgrowth.com'
  });
}

/**
 * Send welcome email after manual onboarding approval
 */
export async function sendCustomerWelcome(customer, productId) {
  const { email, name } = customer;
  const firstName = name ? name.split(' ')[0] : 'there';
  const videoUrl = 'https://primelocalgrowth.com/welcome-video';
  const guideUrl = 'https://primelocalgrowth.com/downloads/gbp-access-guide';

  const noAccessProducts = ['audit'];
  const sendGuide = !noAccessProducts.includes(productId);

  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a1a;font-size:16px;line-height:1.7;">
      <div style="background:#0f1419;padding:24px 32px;border-radius:8px 8px 0 0;margin-bottom:0;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#fff;">Prime <span style="color:#f59e0b;">Local</span> Growth</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;">
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Welcome — I'm excited to get started on your Google listing.</p>
        <p><strong>Step 1 — Watch this 2-minute video</strong> so you know exactly what we're doing:</p>
        <p style="margin:16px 0;">
          <a href="${videoUrl}" style="display:inline-block;background:#1a1f26;color:#f59e0b;border:1px solid rgba(245,158,11,0.4);text-decoration:none;font-family:Arial,sans-serif;font-weight:600;font-size:14px;padding:10px 22px;border-radius:6px;">
            ▶ Watch the 2-Minute Walkthrough →
          </a>
        </p>
        ${sendGuide ? `
          <p><strong>Step 2 — Grant Manager access (3 minutes):</strong></p>
          <p style="margin:20px 0;">
            <a href="${guideUrl}" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">
              Open the Step-by-Step Access Guide →
            </a>
          </p>
          <p style="font-size:14px;color:#666;">Add <strong>primelocalgrowth@gmail.com</strong> as a <strong>Manager</strong> (not Owner). You stay in full control.</p>
        ` : ''}
        <p><strong>What happens next:</strong></p>
        <ul style="padding-left:20px;">
          <li><strong>Hour 0–2:</strong> I accept your invitation and run a full diagnostic audit</li>
          <li><strong>Hours 2–12:</strong> Full 360° optimization — keywords, photos, services, Q&A</li>
          <li><strong>Hours 12–24:</strong> Posting schedule, review monitoring activated</li>
        </ul>
        <p style="background:#1a1f26;border-left:3px solid #f59e0b;padding:14px 18px;border-radius:0 6px 6px 0;font-size:14px;color:#d1d5db;">You stay the Primary Owner. Manager access means I can optimize — I cannot transfer or delete your listing.</p>
        <p style="font-size:14px;color:#666;">Questions? Hit reply — I read every email personally.<br>— Adam Rome · Prime Local Growth · adam@primelocalgrowth.com</p>
        ${getEmailFooter()}
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `Welcome to PLG — watch this first (2 min)`,
    html,
    replyTo: 'adam@primelocalgrowth.com'
  });
}

/**
 * Send onboarding checklist email after manual approval
 */
export async function sendOnboardingChecklist(customer, productId) {
  const { email, name } = customer;
  const firstName = name ? name.split(' ')[0] : 'there';

  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#0f1419;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;color:#fff;font-size:24px;">Here's What Happens Next</h2>
        <p style="margin:8px 0 0;color:#f59e0b;font-size:14px;">Your onboarding timeline</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;font-size:16px;line-height:1.7;">
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Your request is confirmed. Here's exactly what happens from here:</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin-bottom:16px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#92400e;font-size:14px;text-transform:uppercase;">Today</p>
              <p style="margin:0;color:#1a1a1a;">You get the GBP access guide. Follow it to add me as Manager to your listing.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin-bottom:16px;margin-top:16px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#92400e;font-size:14px;text-transform:uppercase;">24 Hours</p>
              <p style="margin:0;color:#1a1a1a;">I'll run your complete GBP audit and send you a report showing exactly what's working and what needs to change.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin-bottom:16px;margin-top:16px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#92400e;font-size:14px;text-transform:uppercase;">48 Hours</p>
              <p style="margin:0;color:#1a1a1a;">First optimization complete — photos optimized, keywords updated, services added, Q&A seeded.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin-top:16px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#92400e;font-size:14px;text-transform:uppercase;">Weekly</p>
              <p style="margin:0;color:#1a1a1a;">Google Posts every week, review monitoring, competitor tracking. I send you a report every Friday.</p>
            </td>
          </tr>
        </table>

        <p><strong>Reply to this email if:</strong></p>
        <ul style="padding-left:20px;">
          <li>You have questions about the process</li>
          <li>Your GBP login isn't working</li>
          <li>You need to reschedule the Manager handoff</li>
          <li>Anything else comes up</li>
        </ul>

        <p>I read and respond to every email personally — usually within an hour.</p>

        <p style="font-size:14px;color:#666;margin:0;">
          — Adam Rome · Prime Local Growth · adam@primelocalgrowth.com
        </p>
        ${getEmailFooter()}
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `Your onboarding timeline (starts today)`,
    html,
    replyTo: 'adam@primelocalgrowth.com'
  });
}

/**
 * HTML escape utility
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Send review request to customer
 */
export async function sendReviewRequest(customer) {
  const { email, name } = customer;
  const firstName = name ? name.split(' ')[0] : 'there';
  const reviewUrl = 'https://g.page/r/CSRlPk-HmJb0EBM/review';

  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a1a;font-size:16px;line-height:1.7;">
      <div style="background:#0f1419;padding:24px 32px;border-radius:8px 8px 0 0;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#fff;">Prime <span style="color:#f59e0b;">Local</span> Growth</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;">
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Your Google listing is live and optimized. If your business is getting results, we'd love a review to help others find you.</p>
        <p style="margin:24px 0;">
          <a href="${reviewUrl}" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">
            Leave a Review on Google →
          </a>
        </p>
        <p>It only takes 60 seconds and makes a huge difference in helping local customers find you.</p>
        <p style="font-size:14px;color:#666;margin:0;">— Adam Rome · Prime Local Growth · adam@primelocalgrowth.com</p>
        ${getEmailFooter()}
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    from: 'Adam Rome <adam@primelocalgrowth.com>',
    subject: `${firstName}, your Google listing is ready for reviews`,
    html,
    replyTo: 'adam@primelocalgrowth.com'
  });
}

export { escapeHtml };
