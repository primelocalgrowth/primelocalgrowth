/**
 * Vercel Serverless Function - Enhanced Form Handler
 * Handles: Email (Resend) + Beehiiv subscription + Google Sheets logging + Apps Script Audit + Redirect
 */
import { notifyAdamOfLead, sendLeadAutoReply } from './utils/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, businessName, city, businessType } = req.body;

    // Validate required fields
    if (!name || !email || !businessName || !city || !businessType) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const timestamp = new Date().toISOString();
    const lead = { name, email, phone, businessName, city, businessType, timestamp };

  // ============================================================
    // 1. TRIGGER MASTER APPS SCRIPT WEBHOOK (FIRE & FORGET)
    // ============================================================
    try {
      const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxrQMcS2jdABKRocVKlN7WzeMZXTnI1VQfDXAvV5Nathbh4OEqe-R-eiioC8VREXtI_/exec';
      // Notice there is NO "await" here! It sends the data and moves on instantly.
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: name,
          email: email,
          phone: phone,
          businessName: businessName,
          city: city,
          businessType: businessType
        })
      }).catch(err => console.error('Webhook error:', err));
    } catch (err) {
      console.error('Apps Script Webhook trigger failed:', err);
    }

    // ============================================================
    // 2. RESEND EMAIL NOTIFICATIONS
    // ============================================================
    if (process.env.RESEND_API_KEY) {
      try {
        await notifyAdamOfLead(lead);
      } catch (err) {
        console.error('Lead notification send failed:', err);
      }
      try {
        await sendLeadAutoReply(lead);
      } catch (err) {
        console.error('Auto-reply send failed:', err);
      }
    }

    // ============================================================
    // 3. BEEHIIV INTEGRATION
    // ============================================================
    if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
      try {
        await addToBeehiiv(name, email, phone, businessName, city, businessType);
      } catch (err) {
        console.error('Beehiiv add failed:', err);
      }
    }

    // ============================================================
    // 4. GOOGLE SHEETS INTEGRATION
    // ============================================================
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await appendToGoogleSheets(name, email, phone, businessName, city, businessType, timestamp);
      } catch (err) {
        console.error('Google Sheets append failed:', err);
      }
    }

    // Return success with redirect
    return res.status(200).json({
      success: true,
      message: 'Form submitted successfully!',
      redirectUrl: '/thank-you',
      data: { name, email, phone, businessName, city, businessType, timestamp }
    });

  } catch (error) {
    console.error('Form submission error:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

// ============================================================
// HELPER FUNCTIONS (BEEHIIV & SHEETS)
// ============================================================
async function addToBeehiiv(name, email, phone, businessName, city, businessType) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) return;

  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ') || '';

  const response = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
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
        { name: 'city', value: city || '' },
        { name: 'business_type', value: businessType }
      ]
    })
  });

  if (!response.ok) {
    console.warn(`Beehiiv response: ${response.status}`);
    return null;
  }
  return await response.json();
}

async function appendToGoogleSheets(name, email, phone, businessName, city, businessType, timestamp) {
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
      city: city || '',
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
