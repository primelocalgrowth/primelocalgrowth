/**
 * Zero-infrastructure lead nurture — day-3 and day-7 follow-ups scheduled
 * at submit time via Resend scheduled_at. No cron, no database.
 * Gated on LEAD_FOLLOWUPS_ENABLED=true.
 */
import { sendEmail, getEmailFooter, escapeHtml } from './email.js';

const FROM_ADAM = 'Adam Rome <adam@primelocalgrowth.com>';

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function wrapEmail(bodyHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="padding:32px;border:1px solid #e5e5e5;">
        ${bodyHtml}
        <p style="font-size:14px;color:#666;line-height:1.6;margin:16px 0 0;">— Adam Rome<br>Prime Local Growth</p>
        ${getEmailFooter()}
      </div>
    </div>
    </body>
    </html>
  `;
}

function dayThreeEmail(lead) {
  const { firstName, email, businessName } = lead;
  const html = wrapEmail(`
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Quick story. A barbershop near San Antonio came to me with the same gaps I flagged in your audit. Solid work, loyal customers — but Google was sending new business to the shop down the road.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;"><strong>By June: 110 Google Business Profile interactions, 15 calls from Google that month, and 40 five-star reviews.</strong> The owner didn't change anything about how he cuts hair. We changed how Google sees him.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">The fixes in your audit are the same playbook. Every week they sit unfixed, the competitors above you collect the calls that should be yours.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0;">Which fix do you want to start with? Reply and tell me — I'll map out exactly how it works for ${escapeHtml(businessName)}.</p>
  `);

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `The Cibolo barbershop that reached 15 Google calls in June`,
    html,
    replyTo: 'adam@primelocalgrowth.com',
    scheduledAt: daysFromNow(3)
  });
}

function daySevenEmail(lead) {
  const { firstName, email, businessName } = lead;
  const html = wrapEmail(`
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">Last note from me on this — I don't do drip campaigns that never end.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">You requested the audit because something's off: the phone isn't ringing the way it should for the quality of work ${escapeHtml(businessName)} does. The audit showed you why. That "why" doesn't fix itself, and your competitors aren't waiting.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 16px;">If now isn't the time, no hard feelings — keep the audit, it's yours. If you are ready, reply and we will schedule a focused 15-minute findings call. The $497 sprint is one-time, with no automatic renewal, and you keep every completed fix and the scorecard.</p>
    <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0;">What's the one thing holding you back? Reply and tell me — worst case you get a straight answer.</p>
  `);

  return sendEmail({
    to: email,
    from: FROM_ADAM,
    subject: `${firstName} — one question before I close your file`,
    html,
    replyTo: 'adam@primelocalgrowth.com',
    scheduledAt: daysFromNow(7)
  });
}

export async function scheduleFollowUps(lead) {
  await Promise.all([dayThreeEmail(lead), daySevenEmail(lead)]);
}
