/**
 * Vercel Serverless Function - Enhanced Form Handler
 * Handles: Email (Resend) + Beehiiv subscription + Google Sheets logging + Apps Script Audit + Redirect
 */
import { notifyAdamOfLead, sendLeadAutoReply } from './utils/email.js';

// In-memory rate limit: max 5 submissions per IP per 10 minutes
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
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

    await runRequiredIntegrations(lead);
    await runOptionalIntegrations(lead);

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

async function runRequiredIntegrations(lead) {
  const tasks = [];

  if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
    tasks.push(appendToGoogleSheets(lead));
  } else {
    console.warn('GOOGLE_SHEETS_WEBHOOK_URL is not set; lead was not logged to Sheets.');
  }

  if (process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL) {
    tasks.push(triggerAuditGenerator(lead));
  } else {
    console.warn('MASTER_APPS_SCRIPT_WEBHOOK_URL is not set; audit doc was not generated.');
  }

  if (tasks.length === 0) {
    throw new Error('No lead storage or audit webhook is configured.');
  }

  await Promise.all(tasks);
}

async function runOptionalIntegrations(lead) {
  const tasks = [];

  if (process.env.RESEND_API_KEY) {
    tasks.push(runOptionalTask('Lead notification email', () => notifyAdamOfLead(lead)));
    tasks.push(runOptionalTask('Lead auto-reply email', () => sendLeadAutoReply(lead)));
  }

  if (process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
    tasks.push(runOptionalTask('Beehiiv subscription', () => {
      return addToBeehiiv(lead.name, lead.email, lead.phone, lead.businessName, lead.city, lead.businessType);
    }));
  }

  await Promise.all(tasks);
}

async function runOptionalTask(label, task) {
  try {
    return await task();
  } catch (err) {
    console.error(`${label} failed:`, err);
    return null;
  }
}

async function triggerAuditGenerator(lead) {
  return await postWebhook(process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL, {
    contactName: lead.name,
    name: lead.name,
    firstName: lead.firstName,
    email: lead.email,
    phone: lead.phone,
    businessName: lead.businessName,
    city: lead.city,
    businessType: lead.businessType,
    niche: lead.niche,
    website: lead.website,
    mainService: lead.mainService,
    visibilityConcern: lead.visibilityConcern,
    situation: lead.situation,
    pagePath: lead.pagePath,
    pageUrl: lead.pageUrl,
    referrer: lead.referrer,
    attribution: lead.attribution,
    submittedAt: lead.timestamp,
    timestamp: lead.timestamp,
    source: 'Website'
  }, 'Audit generator');
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
