/**
 * Vercel Serverless Function - Enhanced Form Handler
 * Handles: Email (Resend) + Beehiiv subscription + Google Sheets logging + Redirect
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, businessType } = req.body;

    // Validate required fields
    if (!name || !email || !businessType) {
      return res.status(400).json({
        error: 'Please fill in all required fields'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address'
      });
    }

    const timestamp = new Date().toISOString();

    // Send email notification (Resend)
    if (process.env.RESEND_API_KEY) {
      try {
        await sendEmailNotification(name, email, phone, businessType, timestamp);
      } catch (err) {
        console.error('Email send failed:', err);
        // Continue - don't fail the form
      }
    }

    // Add to Beehiiv
    if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
      try {
        await addToBeehiiv(name, email, phone, businessType);
      } catch (err) {
        console.error('Beehiiv add failed:', err);
        // Continue - don't fail the form
      }
    }

    // Add to Google Sheets
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await appendToGoogleSheets(name, email, phone, businessType, timestamp);
      } catch (err) {
        console.error('Google Sheets append failed:', err);
        // Continue - don't fail the form
      }
    }

    // Return success with redirect
    return res.status(200).json({
      success: true,
      message: 'Form submitted successfully!',
      redirectUrl: '/thank-you',
      data: {
        name,
        email,
        phone,
        businessType,
        timestamp
      }
    });

  } catch (error) {
    console.error('Form submission error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}

// ============================================================
// EMAIL (Resend)
// ============================================================

async function sendEmailNotification(name, email, phone, businessType, timestamp) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const phoneDisplay = phone ? `<div class="field"><div class="label">Phone:</div><div class="value"><a href="tel:${phone}">${escapeHtml(phone)}</a></div></div>` : '';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { border-bottom: 3px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
          .field { margin: 15px 0; padding: 10px; background-color: #f9fafb; border-left: 4px solid #f59e0b; }
          .label { font-weight: bold; color: #1f2937; }
          .value { color: #4b5563; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>New Lead: ${escapeHtml(name)}</h1></div>
          <div class="field"><div class="label">Name:</div><div class="value">${escapeHtml(name)}</div></div>
          <div class="field"><div class="label">Email:</div><div class="value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div></div>
          ${phoneDisplay}
          <div class="field"><div class="label">Business:</div><div class="value">${escapeHtml(businessType)}</div></div>
          <div class="field"><div class="label">Submitted:</div><div class="value">${new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</div></div>
        </div>
      </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Prime Local Growth <adam@primelocalgrowth.com>',
      to: 'adam@primelocalgrowth.com',
      replyTo: email,
      subject: `🔥 New Lead: ${name} — ${businessType}`,
      html: emailHtml
    })
  });

  if (!response.ok) {
    throw new Error(`Resend error: ${response.status}`);
  }

  return await response.json();
}

// ============================================================
// BEEHIIV INTEGRATION
// ============================================================

async function addToBeehiiv(name, email, phone, businessType) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) return;

  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ') || '';

  const response = await fetch(
    `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        email,
        reactivate_existing: false,
        send_welcome_email: false,
        utm_source: 'website-form',
        custom_fields: [
          { name: 'first_name', value: firstName },
          { name: 'last_name', value: lastName },
          { name: 'phone', value: phone || '' },
          { name: 'business_type', value: businessType }
        ]
      })
    }
  );

  if (!response.ok) {
    console.warn(`Beehiiv response: ${response.status}`);
    return null;
  }

  return await response.json();
}

// ============================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================

async function appendToGoogleSheets(name, email, phone, businessType, timestamp) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp,
      name,
      email,
      phone: phone || '',
      business_type: businessType,
      source: 'website-form',
      segment: 'Cold Leads',
      status: 'New',
      notes: ''
    })
  });

  if (!response.ok) {
    throw new Error(`Sheets error: ${response.status}`);
  }

  return await response.json();
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
