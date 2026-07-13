import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const submitHandler = (await import('../api/submit-form.js')).default;
const newsletterHandler = (await import('../api/newsletter-subscribe.js')).default;

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request(body, ip) {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip }
  };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

try {
  process.env.GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.test/sheets';
  process.env.BEEHIIV_API_KEY = 'test-key';
  process.env.BEEHIIV_PUBLICATION_ID = 'test-publication';
  delete process.env.RESEND_API_KEY;
  delete process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL;

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const baseLead = {
    name: 'Test Owner',
    email: 'owner@example.com',
    phone: '2105550100',
    businessName: 'Test Service Co',
    city: 'Cibolo, TX'
  };

  let res = responseRecorder();
  await submitHandler(request({ ...baseLead, marketingConsent: false }, '203.0.113.10'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1, 'non-opted-in audit lead should only call the required Sheets webhook');
  assert.equal(calls[0].url, process.env.GOOGLE_SHEETS_WEBHOOK_URL);
  assert.equal(JSON.parse(calls[0].options.body).marketing_consent, 'No');

  calls.length = 0;
  res = responseRecorder();
  await submitHandler(request({ ...baseLead, email: 'optin@example.com', marketingConsent: true }, '203.0.113.11'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2, 'opted-in audit lead should call Sheets and Beehiiv');
  assert.ok(calls.some(call => call.url.includes('api.beehiiv.com')));

  calls.length = 0;
  res = responseRecorder();
  await submitHandler(request({ ...baseLead, email: 'bot@example.com', companyWebsite: 'spam.example' }, '203.0.113.12'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 0, 'honeypot submission should not reach any integration');

  delete process.env.BEEHIIV_API_KEY;
  delete process.env.BEEHIIV_PUBLICATION_ID;
  res = responseRecorder();
  await newsletterHandler(request({ name: 'Newsletter Reader', email: 'reader@example.com' }, '203.0.113.20'), res);
  assert.equal(res.statusCode, 503, 'newsletter must not claim success when Beehiiv is unavailable');

  process.env.BEEHIIV_API_KEY = 'test-key';
  process.env.BEEHIIV_PUBLICATION_ID = 'test-publication';
  calls.length = 0;
  res = responseRecorder();
  await newsletterHandler(request({ name: 'Newsletter Reader', email: 'reader@example.com' }, '203.0.113.21'), res);
  assert.equal(res.statusCode, 200);
  const newsletterPayload = JSON.parse(calls[0].options.body);
  assert.equal(newsletterPayload.reactivate_existing, true);
  assert.equal(newsletterPayload.send_welcome_email, true);

  const stripeSource = readFileSync(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8');
  assert.ok(!stripeSource.includes('addBeehiivActiveTag'), 'Stripe must not add paying clients to Beehiiv');
  assert.ok(stripeSource.includes("if (reason !== 'manual') return;"), 'Checkout subscriptions must not be onboarded twice');

  console.log('Backend routing tests passed.');
} finally {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
}
