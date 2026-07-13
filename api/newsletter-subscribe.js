/**
 * Explicit newsletter opt-in endpoint.
 * Beehiiv owns newsletter contacts and sends its configured welcome email.
 * Resend is intentionally not used here; it is reserved for transactional mail.
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { name = '', email = '', companyWebsite = '' } = req.body;

  // Honeypot: acknowledge bots without creating a subscription.
  if (String(companyWebsite).trim()) {
    return res.status(200).json({ success: true, redirectUrl: '/thank-you' });
  }

  if (typeof name !== 'string' || typeof email !== 'string' || name.length > 120 || email.length > 254) {
    return res.status(400).json({ error: 'Invalid name or email' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) {
    return res.status(400).json({ error: 'Name and email required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    console.error('Newsletter unavailable: Beehiiv environment variables are missing.');
    return res.status(503).json({ error: 'Newsletter signup is temporarily unavailable.' });
  }

  const firstName = cleanName.split(/\s+/)[0];
  const lastName = cleanName.split(/\s+/).slice(1).join(' ');

  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          email: cleanEmail,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: 'newsletter-page',
          custom_fields: [
            { name: 'first_name', value: firstName },
            { name: 'last_name', value: lastName }
          ]
        })
      }
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error(`Beehiiv subscription failed (${response.status}): ${detail}`);
      return res.status(502).json({ error: 'We could not complete the subscription. Please try again.' });
    }

    return res.status(200).json({ success: true, redirectUrl: '/thank-you' });
  } catch (error) {
    console.error('Beehiiv subscription request failed:', error.message);
    return res.status(502).json({ error: 'We could not complete the subscription. Please try again.' });
  }
}
