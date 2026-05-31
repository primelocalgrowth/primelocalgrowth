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
    const {
      name,
      email,
      phone = '',
      businessName,
      city = '',
      businessType = 'local-service',
      website = '',
      mainService = '',
      visibilityConcern = '',
      situation = '',
      pagePath = '',
      pageUrl = '',
      referrer = '',
      attribution = {}
    } = req.body;

    // Validate required fields
    if (!email || !businessName) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const timestamp = new Date().toISOString();
    const leadName = name || businessName;
    const firstName = getFirstName(leadName);
    const niche = mainService || businessType;
    const lead = { name: leadName, firstName, email, phone, businessName, city, businessType, niche, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, attribution, timestamp };

    // ============================================================
    // 1. TRIGGER AUDIT GENERATOR WEBHOOK
    // ============================================================
    if (process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL) {
      await postWebhook(process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL, {
        contactName: leadName,
        name: leadName,
        firstName,
        email,
        phone,
        businessName,
        city,
        businessType,
        niche,
        website,
        mainService,
        visibilityConcern,
        situation,
        pagePath,
        pageUrl,
        referrer,
        attribution,
        submittedAt: timestamp,
        timestamp,
        source: 'Website'
      }, 'Audit generator');
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
        await addToBeehiiv(leadName, email, phone, businessName, city, businessType);
      } catch (err) {
        console.error('Beehiiv add failed:', err);
      }
    }

    // ============================================================
    // 4. GOOGLE SHEETS INTEGRATION
    // ============================================================
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await appendToGoogleSheets(lead);
      } catch (err) {
        console.error('Google Sheets append failed:', err);
      }
    }

    // Return success with redirect
    return res.status(200).json({
      success: true,
      message: 'Form submitted successfully!',
      redirectUrl: '/thank-you',
      data: { name: leadName, firstName, email, phone, businessName, city, businessType, niche, timestamp }
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

async function appendToGoogleSheets(lead) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;
  const { name, firstName, email, phone, businessName, city, businessType, niche, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, attribution, timestamp } = lead;

  return await postWebhook(webhookUrl, {
    firstName,
    name,
    businessName,
    email,
    phone: phone || '',
    city: city || '',
    niche: niche || '',
    leadStatus: 'New Lead',
    status: 'Lead',
    plan: '',
    startDate: '',
    onboardingStep: 0,
    submittedAt: timestamp,
    source: 'Website',
    timestamp,
    business_name: businessName,
    business_type: businessType,
    website: website || '',
    main_service: mainService || '',
    visibility_concern: visibilityConcern || '',
    situation: situation || '',
    source_detail: 'inbound',
    segment: 'Inbound Leads',
    legacy_status: 'New',
    page_path: pagePath || '',
    page_url: pageUrl || '',
    referrer: referrer || '',
    utm_source: attribution?.utm_source || '',
    utm_medium: attribution?.utm_medium || '',
    utm_campaign: attribution?.utm_campaign || '',
    utm_term: attribution?.utm_term || '',
    utm_content: attribution?.utm_content || '',
    gclid: attribution?.gclid || '',
    notes: [visibilityConcern, situation, attribution ? JSON.stringify(attribution) : ''].filter(Boolean).join('\n\n')
  }, 'Google Sheets');
}

function getFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

async function postWebhook(url, payload, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let result = {};

  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = { raw: text };
    }
  }

  if (!response.ok || result.success === false) {
    const reason = result.error || result.message || text || `HTTP ${response.status}`;
    throw new Error(`${label} webhook failed: ${reason}`);
  }

  return result;
}
