import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import submit from '../api/submit-form.js';
import stripe from '../api/stripe-webhook.js';
import newsletter from '../api/newsletter-subscribe.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const recorder = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const calls = [];
const mock = (body) => { calls.length = 0; globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(body, { status: 200 }); }; };
async function payment(status, type = 'checkout.session.completed') {
  const raw = JSON.stringify({ id: 'evt_fixture', type, data: { object: { id: 'cs_fixture', payment_status: status, customer_email: 'fixture@example.com', amount_total: 99700 } } });
  const time = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${time}.${raw}`).digest('hex');
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST'; req.headers = { 'stripe-signature': `t=${time},v1=${signature}` };
  const res = recorder(); await stripe(req, res); return res;
}
try {
  process.env.GOOGLE_SHEETS_WEBHOOK_URL = 'https://fixture.invalid/sheets';
  process.env.STRIPE_WEBHOOK_SECRET = 'local-test-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL;
  delete process.env.BEEHIIV_API_KEY;
  let index = 0;
  for (const body of ['<html>login</html>', '{}', 'null', '{"success":false}', '']) {
    mock(body);
    const res = recorder();
    await submit({ method: 'POST', headers: { 'x-forwarded-for': `198.51.100.${++index}` }, body: { email: 'fixture@example.com', businessName: 'Fixture Plumbing' } }, res);
    assert.equal(res.statusCode, 502, `Lead capture must reject ${body || 'empty body'}`);
    assert.equal((await payment('paid')).statusCode, 500, 'Unacknowledged activation must be retryable');
  }
  mock('{"success":true}');
  assert.equal((await payment('unpaid')).statusCode, 200);
  assert.equal(calls.length, 0, 'Unpaid checkout must not activate or send');
  assert.equal((await payment('paid', 'checkout.session.async_payment_succeeded')).statusCode, 200);
  assert.equal(calls.length, 1, 'Confirmed delayed payment must activate');
  assert.equal(JSON.parse(calls[0].options.body).status, 'Active');
  mock('{"success":true}');
  const blank = recorder();
  await submit({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.99' }, body: { email: 'fixture@example.com', businessName: '   ' } }, blank);
  assert.equal(blank.statusCode, 400);
  assert.equal(calls.length, 0);
  process.env.RESEND_API_KEY = 'fixture-key';
  delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  mock('{}');
  const rejectedNotification = recorder();
  await submit({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.100' }, body: { email: 'fixture@example.com', businessName: 'Fixture Plumbing' } }, rejectedNotification);
  assert.equal(rejectedNotification.statusCode, 502, 'Unacknowledged notification is not recoverable capture');
  mock('{"id":"fixture-message"}');
  const notificationCapture = recorder();
  await submit({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.101' }, body: { email: 'fixture@example.com', businessName: 'Fixture Plumbing' } }, notificationCapture);
  assert.equal(notificationCapture.statusCode, 200, 'Acknowledged Adam notification preserves a lead when Sheets is unavailable');
  assert.ok(calls.every(call => call.options.signal instanceof AbortSignal));
  delete process.env.RESEND_API_KEY;
  mock('{"success":true}');
  process.env.BEEHIIV_API_KEY = 'fixture-key';
  process.env.BEEHIIV_PUBLICATION_ID = 'fixture-publication';
  const res = recorder();
  await newsletter({ method: 'POST', body: { name: 'Fixture', email: 'fixture@example.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(calls[0].options.signal instanceof AbortSignal, 'Newsletter request must have a deadline');
  console.log('PASS backend reliability: rejected false acknowledgements, unpaid/delayed payment gates, blank business, bounded newsletter');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
