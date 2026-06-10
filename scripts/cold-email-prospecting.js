/**
 * Cold Email Prospecting Script (Apollo.io)
 * Queries Apollo.io for businesses in 5 Texas cities
 * Extracts verified emails, deduplicates, sends personalized cold emails via Resend
 *
 * Usage: node api/cold-email-prospecting.js
 * Requires: APOLLO_API_KEY, RESEND_API_KEY in environment
 */

import fs from 'fs';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const CITIES = [
  { name: 'Cibolo', state: 'TX' },
  { name: 'Schertz', state: 'TX' },
  { name: 'Universal City', state: 'TX' },
  { name: 'Converse', state: 'TX' },
  { name: 'New Braunfels', state: 'TX' }
];

const INDUSTRY_MAP = {
  'HVAC Contractor': 'HVAC',
  'Plumber': 'Plumbing',
  'Dentist': 'Dental',
  'Roofing Contractor': 'Roofing',
  'Landscaper': 'Landscaping',
  'Auto Repair': 'Automotive',
  'Medical Spa': 'Wellness',
  'General Contractor': 'Construction'
};

// Track sent emails to prevent duplicates
const SENT_EMAILS_FILE = './sent-emails.json';
let sentEmails = new Set();

// Load existing sent emails
if (fs.existsSync(SENT_EMAILS_FILE)) {
  const data = JSON.parse(fs.readFileSync(SENT_EMAILS_FILE, 'utf8'));
  sentEmails = new Set(data);
}

async function searchApolloIO(businessType, city) {
  const industry = INDUSTRY_MAP[businessType] || businessType;
  const locationQuery = `${city.name}, ${city.state}`;

  try {
    const response = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        q_organization_industry: industry,
        q_organization_locations: [locationQuery],
        organization_num_employees_range: ['1', '10000'],
        page: 1,
        per_page: 10
      })
    });

    if (!response.ok) {
      console.error(`Apollo API error for ${businessType} in ${city.name}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const organizations = data.organizations || [];

    if (organizations.length > 0) {
      console.log(`  → Found ${organizations.length} organizations for ${businessType}`);
    } else {
      console.log(`  → No results for ${businessType} in ${city.name}`);
    }

    const leads = [];
    for (const org of organizations) {
      if (org.domain && org.name) {
        leads.push({
          name: org.name,
          domain: org.domain,
          email: null,
          city: city.name,
          businessType: businessType,
          website: `https://${org.domain}`,
          phone: org.phone_number || null,
          address: org.primary_address || null
        });
      }
    }

    return leads;
  } catch (err) {
    console.error(`Apollo search failed for ${businessType} in ${city.name}:`, err.message);
    return [];
  }
}

async function extractEmailFromWebsite(website) {
  if (!website) return null;

  try {
    const response = await fetch(website, { timeout: 5000 });
    if (!response.ok) return null;

    const html = await response.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex);

    if (matches && matches.length > 0) {
      const filtered = matches.filter(email =>
        !email.includes('google') &&
        !email.includes('facebook') &&
        !email.includes('twitter') &&
        email.includes(('@')) &&
        email.length < 60
      );
      return filtered[0] || null;
    }
  } catch (err) {
    // Timeout or fetch error
  }
  return null;
}

function buildColdEmail(business, city, rankData) {
  const businessName = business.name || 'Local Business';
  const firstName = businessName.split(' ')[0];

  const subjects = [
    `${firstName}: Local visibility report for ${city}`,
    `Quick question about your Google visibility (${city})`,
    `${city} businesses are losing leads — here's proof`,
    `Summer strategy call for ${businessName}?`
  ];

  const bodies = [
    `Hi ${firstName},\n\nJust audited your Google presence. You're missing out on searches in ${city} that are ready to buy right now.\n\nWe help local service businesses capture these leads before summer ends.\n\nFree 15-min call this week?\n\nAdam\nPrime Local Growth`,

    `${firstName},\n\nNoticed your profile doesn't show up for high-intent searches in your area. This time of year, that's costing you.\n\nWe fix this for service businesses in ${city} — results in 7-30 days.\n\nWorth a quick conversation?\n\nAdam`,

    `Hey ${firstName},\n\n${city} businesses are booking work through Google. Are you?\n\nWe've helped contractors, HVAC shops, and plumbers 2x their leads. Summer's the window.\n\nQuick question: how are you getting clients right now?\n\nAdam\nPrime Local Growth`,

    `${firstName},\n\nSummer's peak season. Most businesses in ${city} are scrambling for leads.\n\nWe help them get found first.\n\nAre you running at capacity, or is Google visibility something to tackle?\n\nAdam`
  ];

  const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
  const randomBody = bodies[Math.floor(Math.random() * bodies.length)];

  return {
    subject: randomSubject,
    body: randomBody
  };
}

async function sendEmail(to, subject, body) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not found in environment');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'adam@primelocalgrowth.com',
        to: to,
        subject: subject,
        text: body
      })
    });

    if (!response.ok) {
      console.error(`Resend error for ${to}: ${response.status}`);
      return false;
    }

    sentEmails.add(to);
    console.log(`✓ Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('Starting Apollo.io cold email prospecting...\n');

  if (!APOLLO_API_KEY) {
    console.error('ERROR: APOLLO_API_KEY not found in environment');
    process.exit(1);
  }

  if (!RESEND_API_KEY) {
    console.error('ERROR: RESEND_API_KEY not found in environment');
    process.exit(1);
  }

  const allLeads = [];
  let totalProcessed = 0;
  let totalSent = 0;

  // Search all city + business type combinations
  for (const city of CITIES) {
    for (const businessType of Object.keys(INDUSTRY_MAP)) {
      if (totalProcessed >= 30) break;

      console.log(`Searching ${businessType} in ${city.name}...`);

      const results = await searchApolloIO(businessType, city);

      for (const lead of results) {
        if (totalProcessed >= 30) break;

        let email = lead.email;

        // Try to extract email from website if not already provided
        if (!email && lead.website) {
          email = await extractEmailFromWebsite(lead.website);
        }

        if (email && !sentEmails.has(email)) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(email)) {
            allLeads.push({
              name: lead.name,
              email: email,
              city: city.name,
              businessType: businessType,
              phone: lead.phone,
              website: lead.website,
              address: lead.address
            });
            totalProcessed++;
          }
        }
      }

      if (totalProcessed >= 30) break;

      // Rate limiting for Apollo API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (totalProcessed >= 30) break;
  }

  console.log(`\nFound ${allLeads.length} leads with valid emails.\n`);

  // Send cold emails
  for (const lead of allLeads) {
    const email = buildColdEmail(lead, lead.city, {});
    const sent = await sendEmail(lead.email, email.subject, email.body);

    if (sent) {
      totalSent++;
    }

    // Rate limiting for Resend
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Save sent emails to prevent duplicates
  fs.writeFileSync(SENT_EMAILS_FILE, JSON.stringify(Array.from(sentEmails), null, 2));

  console.log(`\n✓ Campaign complete: ${totalSent}/${allLeads.length} emails sent`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
