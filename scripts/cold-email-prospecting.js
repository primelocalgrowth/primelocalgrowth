/**
 * Cold Email Prospecting v2 (Apollo.io + Resend)
 * - Trades-focused targeting in PLG's home market
 * - CAN-SPAM compliant: postal address + unsubscribe line, suppression list honored
 * - Honest copy: free audit offer only, no invented claims
 * - Capped sends per run to protect deliverability
 *
 * Usage: node --env-file=.env.local scripts/cold-email-prospecting.js
 * Env: APOLLO_API_KEY, RESEND_API_KEY, optional COLD_EMAIL_POSTAL_ADDRESS
 * Unsubscribes: add the address (one per line) to unsubscribes.txt — never emailed again.
 */

import fs from 'fs';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const POSTAL_ADDRESS = process.env.COLD_EMAIL_POSTAL_ADDRESS || 'Prime Local Growth, Cibolo, TX 78108';

const MAX_SENDS_PER_RUN = 20;

const CITIES = [
  { name: 'Cibolo', state: 'TX' },
  { name: 'Schertz', state: 'TX' },
  { name: 'Universal City', state: 'TX' },
  { name: 'Converse', state: 'TX' },
  { name: 'New Braunfels', state: 'TX' },
];

// Trades only: high customer value, fastest to feel the pain of a missed call.
const INDUSTRY_MAP = {
  'HVAC Contractor': 'HVAC',
  'Plumber': 'Plumbing',
  'Roofing Contractor': 'Roofing',
  'Electrician': 'Electrical',
  'General Contractor': 'Construction',
};

const SENT_EMAILS_FILE = './sent-emails.json';
const UNSUBSCRIBES_FILE = './unsubscribes.txt';
const LOG_FILE = './cold-email-log.txt';

let sentEmails = new Set();
if (fs.existsSync(SENT_EMAILS_FILE)) {
  sentEmails = new Set(JSON.parse(fs.readFileSync(SENT_EMAILS_FILE, 'utf8')));
}

let unsubscribed = new Set();
if (fs.existsSync(UNSUBSCRIBES_FILE)) {
  unsubscribed = new Set(
    fs.readFileSync(UNSUBSCRIBES_FILE, 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
  );
}

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + '\n');
}

async function searchApolloIO(businessType, city) {
  const industry = INDUSTRY_MAP[businessType] || businessType;
  try {
    const response = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_API_KEY },
      body: JSON.stringify({
        q_organization_industry: industry,
        q_organization_locations: [`${city.name}, ${city.state}`],
        organization_num_employees_range: ['1', '50'],
        page: 1,
        per_page: 10,
      }),
    });
    if (!response.ok) {
      log(`Apollo error for ${businessType} in ${city.name}: HTTP ${response.status}`);
      return [];
    }
    const data = await response.json();
    return (data.organizations || [])
      .filter(org => org.domain && org.name)
      .map(org => ({
        name: org.name,
        city: city.name,
        businessType,
        website: `https://${org.domain}`,
      }));
  } catch (err) {
    log(`Apollo search failed for ${businessType} in ${city.name}: ${err.message}`);
    return [];
  }
}

async function extractEmailFromWebsite(website) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(website, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const html = await response.text();
    const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const filtered = matches.filter(e =>
      !/google|facebook|twitter|sentry|wixpress|example|\.png|\.jpg|\.gif|\.webp/i.test(e) && e.length < 60
    );
    return filtered[0] || null;
  } catch {
    return null;
  }
}

function buildColdEmail(business) {
  const subject = `Quick question about ${business.name}'s Google listing`;

  const body = [
    `Hi — Adam here, owner of Prime Local Growth in Cibolo. I help ${business.businessType.toLowerCase()}s and other trades in the ${business.city} area get found on Google.`,
    '',
    `I put together free visibility audits for local service businesses: I review your Google Business Profile, reviews, and the competitors outranking you, and send back a plain-English list of what's costing you calls and what to fix first. No charge, no obligation, and if everything looks good I'll tell you that too.`,
    '',
    `Want me to run one for ${business.name}? Just reply "yes" and I'll have it to you within a couple of days.`,
    '',
    'Adam Rome',
    'Prime Local Growth — Veteran-owned',
    'primelocalgrowth.com · 210-646-1436',
    '',
    '--',
    `You received this one-time note because ${business.name} is a local service business in my service area. If you'd rather not hear from me, reply "unsubscribe" and you won't — no hard feelings.`,
    POSTAL_ADDRESS,
  ].join('\n');

  return { subject, body };
}

async function sendEmail(to, subject, body) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'adam@primelocalgrowth.com', to, subject, text: body }),
    });
    if (!response.ok) {
      log(`Resend error for ${to}: HTTP ${response.status}`);
      return false;
    }
    sentEmails.add(to);
    log(`SENT ${to} (${subject})`);
    return true;
  } catch (err) {
    log(`Send failed for ${to}: ${err.message}`);
    return false;
  }
}

async function main() {
  if (!APOLLO_API_KEY || !RESEND_API_KEY) {
    console.error('Missing APOLLO_API_KEY or RESEND_API_KEY. Run via: node --env-file=.env.local scripts/cold-email-prospecting.js');
    process.exit(1);
  }

  log(`--- Run started (cap ${MAX_SENDS_PER_RUN}) ---`);
  let sent = 0;

  outer: for (const city of CITIES) {
    for (const businessType of Object.keys(INDUSTRY_MAP)) {
      if (sent >= MAX_SENDS_PER_RUN) break outer;

      const leads = await searchApolloIO(businessType, city);
      for (const lead of leads) {
        if (sent >= MAX_SENDS_PER_RUN) break outer;

        const email = (await extractEmailFromWebsite(lead.website) || '').toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        if (sentEmails.has(email) || unsubscribed.has(email)) continue;

        const message = buildColdEmail(lead);
        if (await sendEmail(email, message.subject, message.body)) sent++;

        await new Promise(r => setTimeout(r, 2000));
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  fs.writeFileSync(SENT_EMAILS_FILE, JSON.stringify([...sentEmails], null, 2));
  log(`--- Run complete: ${sent} email(s) sent ---`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
