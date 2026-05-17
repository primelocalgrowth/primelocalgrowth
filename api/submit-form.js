/**
 * Prime Local Growth - Form Handler
 * Handles form submissions with email, Beehiiv, and Google Sheets integration
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, businessType } = req.body;

    // Validate required fields
    if (!name || !email || !businessType) {
      return res.status(400).json({
        error: 'Please fill in all required fields',
        received: { name, email, businessType }
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

    // Run all integrations in parallel (don't fail if one fails)
    const results = await Promise.allSettled([
      sendEmailNotification(name, email, phone, businessType, timestamp),
      addToBeehiiv(name, email, phone, businessType),
      appendToGoogleSheets(name, email, phone, businessType, timestamp)
    ]);

    console.log('Integration results:', {
      email: results[0].status,
      beehiiv: results[1].status,
      sheets: results[2].status
    });

    // Return success regardless of integration status
    return res.status(200).json({
      success: true,
      message: 'Form submitted successfully!',
      redirectUrl: '/thank-you',
      data: { name, email, phone, businessType, submittedAt: timestamp }
    });

  } catch (error) {
    console.error('Form submission error:', error);
    return res.status(500).json({
      error: 'Server error processing submission',
      details: error.message
    });
  }
}

/**
 * Send email notification via Resend
 */
async function sendEmailNotification(name, email, phone, businessType, timestamp) {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { border-bottom: 3px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { color: #1a1a1a; margin: 0; font-size: 24px; }
            .content { line-height: 1.6; }
            .field { margin: 15px 0; padding: 10px; background-color: #f9fafb; border-left: 4px solid #f59e0b; }
            .label { font-weight: bold; color: #1f2937; margin-bottom: 5px; }
            .value { color: #4b5563; font-size: 14px; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
            .cta { margin: 20px 0; }
            .button { background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔥 New Lead Submission</h1>
            </div>
            <div class="content">
              <p>You have received a new lead from your website contact form:</p>

              <div class="field">
                <div class="label">Name:</div>
                <div class="value">${escapeHtml(name)}</div>
              </div>

              <div class="field">
                <div class="label">Email:</div>
                <div class="value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>
              </div>

              ${phone ? `<div class="field">
                <div class="label">Phone:</div>
                <div class="value"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></div>
              </div>` : ''}

              <div class="field">
                <div class="label">Business Type:</div>
                <div class="value">${escapeHtml(businessType)}</div>
              </div>

              <div class="field">
                <div class="label">Submitted:</div>
                <div class="value">${new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</div>
              </div>

              <div class="cta">
                <p><strong>Next step:</strong> Follow up with ${escapeHtml(name)} at your earliest convenience.</p>
                ${phone ? `<p>You can reach them at: <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>` : ''}
              </div>
            </div>
            <div class="footer">
              <p>This email was sent from your Prime Local Growth contact form at www.primelocalgrowth.com</p>
              <p>Lead has been automatically added to Beehiiv newsletter and Google Sheets database.</p>
            </div>
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
        from: 'onboarding@resend.dev',
        to: 'adam@primelocalgrowth.com',
        replyTo: email,
        subject: `🔥 New Lead: ${name} (${businessType})`,
        html: emailHtml,
        tags: [
          {
            name: 'category',
            value: 'lead_submission'
          },
          {
            name: 'business_type',
            value: businessType
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('Email sent successfully:', result.id);
    return result;

  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}

/**
 * Add subscriber to Beehiiv newsletter
 */
async function addToBeehiiv(name, email, phone, businessType) {
  try {
    const beehiivApiKey = process.env.BEEHIIV_API_KEY;
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;

    if (!beehiivApiKey || !publicationId) {
      console.warn('Beehiiv credentials not configured, skipping subscriber add');
      return null;
    }

    const firstName = name.split(' ')[0];
    const lastName = name.split(' ').slice(1).join(' ') || '';

    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${beehiivApiKey}`
        },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: false,
          utm_source: 'website-form',
          utm_medium: 'contact-form',
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
      const errorData = await response.json();
      // Don't throw - subscriber might already exist
      console.warn('Beehiiv subscriber issue:', errorData);
      return null;
    }

    const result = await response.json();
    console.log('Beehiiv subscriber added:', result.data?.id);
    return result;

  } catch (error) {
    console.error('Beehiiv integration error:', error);
    // Don't throw - let form succeed even if Beehiiv fails
    return null;
  }
}

/**
 * Append to Google Sheets via Apps Script webhook
 */
async function appendToGoogleSheets(name, email, phone, businessType, timestamp) {
  try {
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn('Google Sheets webhook not configured, skipping sheet append');
      return null;
    }

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
      const errorText = await response.text();
      console.warn('Google Sheets append issue:', errorText);
      return null;
    }

    console.log('Row appended to Google Sheets');
    return await response.json();

  } catch (error) {
    console.error('Google Sheets integration error:', error);
    // Don't throw - let form succeed even if Sheets fails
    return null;
  }
}

/**
 * Escape HTML special characters to prevent injection
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
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
