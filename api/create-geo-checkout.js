/**
 * GEO Tier Checkout — creates a Stripe Checkout Session for the
 * AI Visibility (GEO) plan ($997/mo) and redirects the buyer to Stripe.
 *
 * Use: Adam emails the link https://www.primelocalgrowth.com/api/create-geo-checkout
 * to a prospect after the audit call. Keeps PLG's email-only, no-public-checkout model.
 *
 * Env (set in Vercel — never hardcode):
 *   STRIPE_SECRET_KEY     — live secret key
 *   STRIPE_GEO_PRICE_ID   — recurring $997/mo Price ID (create once in Stripe)
 *
 * No Stripe SDK — raw form-encoded call, same approach as stripe-webhook.js.
 */
export default async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_GEO_PRICE_ID;

  if (!secretKey || !priceId) {
    console.error('GEO checkout: missing STRIPE_SECRET_KEY or STRIPE_GEO_PRICE_ID');
    return res.status(500).send('Checkout is not configured yet. Email adam@primelocalgrowth.com and he will send your link directly.');
  }

  const origin = `https://${req.headers.host || 'www.primelocalgrowth.com'}`;

  const form = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'allow_promotion_codes': 'true',
    'billing_address_collection': 'required',
    'success_url': `${origin}/thank-you?plan=geo`,
    'cancel_url': `${origin}/services`,
    'subscription_data[metadata][plan]': 'AI Visibility (GEO)'
  });

  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const session = await resp.json();
    if (!resp.ok || !session.url) {
      console.error('GEO checkout: Stripe error', session.error?.message || resp.status);
      return res.status(502).send('Could not start checkout. Email adam@primelocalgrowth.com and he will send your link directly.');
    }
    // 303 so the browser follows with GET to Stripe's hosted checkout
    res.writeHead(303, { Location: session.url });
    return res.end();
  } catch (err) {
    console.error('GEO checkout error:', err.message);
    return res.status(500).send('Could not start checkout. Email adam@primelocalgrowth.com and he will send your link directly.');
  }
}
