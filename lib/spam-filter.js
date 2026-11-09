/**
 * Drops cold pitches and bot posts before they become fake leads.
 *
 * Real submissions on this site are short notes from owners about their own
 * Google profile. Spam that has reached the contact form so far is sales copy
 * (flash sales, data licensing) or a form filled in under a second. The checks
 * are deliberately narrow so a real owner who pastes their website link still
 * gets through: one link is fine, a sales phrase or several links are not.
 * Lives in lib/, not api/: Vercel counts every .js under api/ as a function.
 */

const MIN_FORM_AGE_MS = 2500;

const PITCH = [
  /flash sale/i,
  /exclusive (offer|invitation|deal)/i,
  /official invitation/i,
  /limited (stock|time offer)/i,
  /marked down/i,
  /\b\d{2}% off\b/i,
  /up to \d{2}% less/i,
  /view the sale/i,
  /looking to licen[sc]e/i,
  /licen[sc]e (your|our) (data|content|images|photos)/i,
  /(buy|purchase|sell) (backlinks|guest posts?|followers|traffic)/i,
  /guest post(ing)? (opportunit|service)/i,
  /we (offer|provide|specialize in) (seo|lead generation|web design|link building)/i,
  /(lead generation|link building|cold email) (service|compan|agency)/i,
  /\b(forex|crypto(currency)?|casino|viagra|loan offer)\b/i,
  /reply (stop|unsubscribe)/i,
  /click here to (claim|win|get)/i,
];

const linkCount = (text) => (String(text || '').match(/https?:\/\/|www\./gi) || []).length;

/** Returns a short reason string when the submission looks like spam, otherwise ''. */
export function detectSpam({ situation = '', visibilityConcern = '', name = '', businessName = '', formAge } = {}) {
  if (typeof formAge === 'number' && Number.isFinite(formAge) && formAge >= 0 && formAge < MIN_FORM_AGE_MS) return 'filled_too_fast';

  const body = `${situation}\n${visibilityConcern}`;
  if (linkCount(body) >= 3) return 'many_links';

  for (const re of PITCH) {
    if (re.test(body)) return 'sales_pitch';
  }

  if (linkCount(`${name} ${businessName}`) >= 1) return 'link_in_name';
  return '';
}
