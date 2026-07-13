/**
 * Vercel Serverless Function - Enhanced Form Handler
 * Handles: Google Sheets lead capture + Apps Script audit + transactional email.
 * Beehiiv is used only when the lead separately opts in to marketing.
 */
import { notifyAdamOfLead, sendLeadAutoReply } from './utils/email.js';

// In-memory rate limit: max 5 submissions per IP per 10 minutes.
// Per-instance only (Vercel functions aren't guaranteed to share state across
// invocations), but still bounds abuse from a single warm instance. Expired
// entries are swept on each call so the map can't grow unbounded over the
// life of a long-warm instance.
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(key);
  }

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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
  }

  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

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
      source = '',
      attribution = {},
      marketingConsent = false,
      companyWebsite = ''
    } = req.body;

    // Honeypot: bots fill this visually hidden field. Return a generic success
    // without invoking downstream services so the field does not become an oracle.
    if (String(companyWebsite || '').trim()) {
      return res.status(200).json({ success: true, redirectUrl: '/thank-you' });
    }

    const fields = { name, email, phone, businessName, city, businessType, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, source };
    const limits = { name: 120, email: 254, phone: 40, businessName: 160, city: 120, businessType: 100, website: 500, mainService: 160, visibilityConcern: 2000, situation: 2000, pagePath: 500, pageUrl: 1000, referrer: 1000, source: 160 };
    for (const [key, value] of Object.entries(fields)) {
      if (value != null && typeof value !== 'string') {
        return res.status(400).json({ error: `Invalid ${key}` });
      }
      if (String(value || '').length > limits[key]) {
        return res.status(400).json({ error: `${key} is too long` });
      }
    }

    const cleanAttribution = {};
    if (attribution && typeof attribution === 'object' && !Array.isArray(attribution)) {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) {
        const value = attribution[key];
        if (typeof value === 'string') cleanAttribution[key] = value.slice(0, 250);
      }
    }

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
    const optedIntoMarketing = marketingConsent === true || marketingConsent === 'true' || marketingConsent === 'on';
    const lead = { name: leadName, firstName, email, phone, businessName, city, businessType, niche, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, source, attribution: cleanAttribution, marketingConsent: optedIntoMarketing, timestamp };

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
    return res.status(500).json({ error: 'We could not save your request. Please try again or contact Adam directly.' });
  }
}

// ============================================================
// HELPER FUNCTIONS (BEEHIIV & SHEETS)
// ============================================================
async function addToBeehiiv(name, email, phone, businessName, city, businessType, source = '', pagePath = '') {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) return;

  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ') || '';
  const combined = `${source}|${pagePath}`;
  const leadSource = /ai-visibility/.test(combined) ? 'ai-visibility-scorecard'
    : /gbp-scorecard/.test(combined) ? 'gbp-scorecard'
    : /roi-calculator/.test(combined) ? 'roi-calculator'
    : /newsletter/.test(combined) ? 'newsletter'
    : (source || 'website');

  const response = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      email,
      reactivate_existing: true,
      send_welcome_email: false,
      utm_source: leadSource,
      custom_fields: [
        { name: 'first_name', value: firstName },
        { name: 'last_name', value: lastName },
        { name: 'phone', value: phone || '' },
        { name: 'business_name', value: businessName },
        { name: 'city', value: city || '' },
        { name: 'business_type', value: businessType },
        { name: 'lead_source', value: leadSource }
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
  if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
    throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured.');
  }
  await appendToGoogleSheets(lead);
}

async function runOptionalIntegrations(lead) {
  const tasks = [];

  if (process.env.RESEND_API_KEY) {
    tasks.push(runOptionalTask('Lead notification email', () => notifyAdamOfLead(lead)));
    tasks.push(runOptionalTask('Lead auto-reply email', () => sendLeadAutoReply(lead)));

  }

  if (process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL) {
    tasks.push(runOptionalTask('Audit generator', () => triggerAuditGenerator(lead)));
  }

  if (lead.marketingConsent && process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID) {
    tasks.push(runOptionalTask('Beehiiv subscription', () => {
      return addToBeehiiv(lead.name, lead.email, lead.phone, lead.businessName, lead.city, lead.businessType, lead.source, lead.pagePath);
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
    source: 'Website',
    leadSource: lead.source,
    auditType: /ai-visibility/.test(lead.source || '') ? 'ai-visibility' : 'gbp'
  }, 'Audit generator');
}

async function appendToGoogleSheets(lead) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;
  const { name, firstName, email, phone, businessName, city, businessType, niche, website, mainService, visibilityConcern, situation, pagePath, pageUrl, referrer, attribution, marketingConsent, timestamp } = lead;

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
    marketing_consent: marketingConsent ? 'Yes' : 'No',
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
