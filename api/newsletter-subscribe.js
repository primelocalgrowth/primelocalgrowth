/**
 * Newsletter Subscribe — adds directly to Beehiiv
 * Used by the /newsletter landing page (name + email only, no business type required)
 */

import { sendEmail } from './utils/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email } = req.body;

  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  const firstName = name.split(' ')[0];
  const lastName  = name.split(' ').slice(1).join(' ') || '';

  // Add to Beehiiv
  if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
    try {
      const r = await fetch(
        `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`
          },
          body: JSON.stringify({
            email,
            reactivate_existing: false,
            send_welcome_email: true,
            utm_source: 'newsletter-page',
            custom_fields: [
              { name: 'first_name', value: firstName },
              { name: 'last_name',  value: lastName }
            ]
          })
        }
      );
      if (!r.ok) console.error('Beehiiv error:', r.status);
    } catch (err) {
      console.error('Beehiiv subscribe error:', err);
    }
  }

  // Notify Adam
  if (process.env.RESEND_API_KEY) {
    try {
      await sendEmail({
        to: 'adam@primelocalgrowth.com',
        from: 'Prime Local Growth <adam@primelocalgrowth.com>',
        subject: `📧 New newsletter subscriber: ${name}`,
        html: `<p><strong>${name}</strong> (${email}) just subscribed via the newsletter page.</p>`
      });
    } catch (err) { /* non-critical */ }
  }

  return res.status(200).json({ success: true, redirectUrl: '/thank-you' });
}
