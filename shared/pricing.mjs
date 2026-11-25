/**
 * Single source of truth for PLG pricing.
 *
 * Imported by BOTH the Astro site (page copy + JSON-LD) and the Vercel
 * functions (Stripe plan-name mapping). Changing a price here changes every
 * surface at once. Before this existed the HTML, the FAQPage JSON-LD and the
 * Stripe webhook each carried their own copy, which is how the site advertised
 * $497/month against a $997 floor for months.
 *
 * 2026-11-01: repriced for an automated, low-touch model run by a small
 * agency (market check: GBP management $125-$600/month, map-pack programs
 * $800-$1,200). Sprint $297, Profile Care $197/month, Growth $497/month,
 * Authority from $997/month. Invoiced by email through Wave; Stripe is backup.
 */

/**
 * @typedef {object} Tier
 * @property {string} id
 * @property {string} name          Display name, must match what Stripe records.
 * @property {number} price         Dollars.
 * @property {'one-time'|'month'} cadence
 * @property {boolean} [from]       True when price is a floor ("from $997").
 * @property {number} stripeMin     Lower bound for classifying a Stripe amount.
 * @property {boolean} [retired]    Never quote to new prospects.
 */

/** @type {Tier[]} */
export const TIERS = [
  {
    id: 'sprint',
    name: '30-Day Opportunity Sprint',
    fullName: '30-Day Google Maps Opportunity Sprint',
    price: 297,
    cadence: 'one-time',
    stripeMin: 270,
  },
  {
    id: 'care',
    name: 'Profile Care',
    fullName: 'Profile Care',
    price: 197,
    cadence: 'month',
    stripeMin: 180,
  },
  {
    id: 'growth',
    name: 'Growth Management',
    fullName: 'Growth Management',
    price: 497,
    cadence: 'month',
    from: true,
    stripeMin: 450,
  },
  {
    id: 'authority',
    name: 'Authority + AI Visibility',
    fullName: 'Authority + AI Visibility',
    price: 997,
    cadence: 'month',
    from: true,
    stripeMin: 900,
  },
];

/** Legacy plans that still exist on old agreements but are never quoted. */
export const RETIRED_TIERS = ['Visibility Management'];

/** Floor for any new recurring engagement. */
export const RECURRING_FLOOR = 197;

export const byId = (id) => {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown pricing tier: ${id}`);
  return tier;
};

/** "$497" / "from $997" */
export const priceLabel = (tier) =>
  `${tier.from ? 'from ' : ''}$${tier.price.toLocaleString('en-US')}`;

/** "one time" / "/month" */
export const cadenceLabel = (tier) => (tier.cadence === 'one-time' ? 'one time' : '/month');

/** "$497 one time" / "from $997/month" */
export const fullLabel = (tier) =>
  tier.cadence === 'one-time'
    ? `${priceLabel(tier)} one time`
    : `${priceLabel(tier)}/month`;

/**
 * The answer used in the FAQPage JSON-LD. This is the string Google and the AI
 * answer engines actually quote. 2026-11-25: public pages show the three
 * packages without prices (Adam's call); TIERS above still drive Stripe mapping.
 */
export const costAnswer = () =>
  'Prime Local Growth has three monthly packages: Google; Google + Social; and Full Growth, which adds a website upgrade and analytics. ' +
  'Every package is month to month, with no setup fee and no contract. ' +
  'Your price depends on the package and how competitive your market is, so Adam quotes it in writing after your free audit, before any work starts.';

/**
 * Classify a Stripe amount (in cents) to a plan name. Fallback only — an
 * explicit `metadata.plan` on the session or invoice always wins. Thresholds
 * sit below each list price so proration, tax and partial periods still land
 * on the right tier.
 */
export function planFromAmount(amountTotalCents) {
  if (!amountTotalCents) return 'unknown';
  const dollars = amountTotalCents / 100;
  const match = [...TIERS]
    .sort((a, b) => b.stripeMin - a.stripeMin)
    .find((t) => dollars >= t.stripeMin);
  return match ? match.name : 'Custom';
}

/**
 * Token map for hand-written HTML fragments. Lets page copy carry {{PRICE_*}}
 * placeholders so the visible numbers and the JSON-LD are driven by the same
 * source, without rewriting the markup into components.
 */
export const PRICE_TOKENS = {
  '{{PRICE_SPRINT}}': () => priceLabel(byId('sprint')),
  '{{PRICE_CARE}}': () => priceLabel(byId('care')),
  '{{PRICE_GROWTH}}': () => priceLabel(byId('growth')).replace('from ', ''),
  '{{PRICE_AUTHORITY}}': () => priceLabel(byId('authority')).replace('from ', ''),
};

/**
 * Copy tokens that are not prices but still must not drift. The audit CTA
 * appears in page bodies as well as the nav and footer.
 */
export const AUDIT_CTA_LABEL = 'Get my free audit';

export const COPY_TOKENS = {
  '{{CTA_AUDIT}}': () => AUDIT_CTA_LABEL,
};

/** Substitutes every {{PRICE_*}} and {{CTA_*}} token in a raw HTML string. */
export function renderPrices(html) {
  let out = html;
  for (const [token, value] of Object.entries({ ...PRICE_TOKENS, ...COPY_TOKENS })) {
    out = out.split(token).join(value());
  }
  const leftover = out.match(/\{\{(?:PRICE|CTA)_[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`Unknown token(s): ${[...new Set(leftover)].join(', ')}`);
  return out;
}
