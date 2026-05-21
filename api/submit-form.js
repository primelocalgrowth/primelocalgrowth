/**
 * Vercel Serverless Function - Enhanced Form Handler
 * Handles: Email (Resend) + Beehiiv subscription + Google Sheets logging + Redirect
 * Audit: Manual via /plg-internet-visibility-audit skill (free), delivered by Adam
 */

import { notifyAdamOfLead, sendLeadAutoReply } from './utils/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, businessName, businessType } = req.body;

    // Validate required fields
    if (!name || !email || !businessName || !businessType) {
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
    const lead = { name, email, phone, businessName, businessType, timestamp };

    // Send email notification to Adam
    if (process.env.RESEND_API_KEY) {
      try {
        await notifyAdamOfLead(lead);
      } catch (err) {
        console.error('Lead notification send failed:', err);
      }
    }

    // Send auto-reply to lead
    if (process.env.RESEND_API_KEY) {
      try {
        await sendLeadAutoReply(lead);
      } catch (err) {
        console.error('Auto-reply send failed:', err);
      }
    }

    // Add to Beehiiv
    if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
      try {
        await addToBeehiiv(name, email, phone, businessName, businessType);
      } catch (err) {
        console.error('Beehiiv add failed:', err);
      }
    }

    // Add to Google Sheets
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await appendToGoogleSheets(name, email, phone, businessName, businessType, timestamp);
      } catch (err) {
        console.error('Google Sheets append failed:', err);
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
        businessName,
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
// BEEHIIV INTEGRATION
// ============================================================

async function addToBeehiiv(name, email, phone, businessName, businessType) {
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
          { name: 'business_name', value: businessName },
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

async function appendToGoogleSheets(name, email, phone, businessName, businessType, timestamp) {
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
      business_name: businessName,
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

