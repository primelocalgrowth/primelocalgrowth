/**
 * Renders a stored scorecard result as a shareable page at /s/<id>.
 *
 * This is the growth loop: every run becomes a linkable artifact with its own
 * OG card, instead of a score that disappears on refresh.
 *
 * Indexing is deliberate. A page is only marked indexable when the owner opted
 * into the public index AND the report has real substance; everything else is
 * noindex, so this cannot become a farm of thin auto-generated pages.
 */
import { loadResult, storeConfigured } from './utils/scorecard-store.js';

const SITE = 'https://www.primelocalgrowth.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const id = String(req.query?.id || '').trim();
  if (!storeConfigured()) return send(res, 503, notReady());

  let record = null;
  try {
    record = await loadResult(id);
  } catch (error) {
    console.error(JSON.stringify({ event: 'share_load_failed', id, message: error?.message }));
  }
  if (!record) return send(res, 404, notFound());

  // Only a consented, substantive report earns indexing.
  const indexable = record.publicConsent === true && Array.isArray(record.checks) && record.checks.length >= 6;
  res.setHeader('X-Robots-Tag', indexable ? 'index, follow' : 'noindex, nofollow');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  return send(res, 200, page(record, indexable));
}

function send(res, code, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(code).send(html);
}

function shell(title, description, bodyHtml, { indexable = false, path = '/' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${indexable ? `<link rel="canonical" href="${SITE}${esc(path)}">` : '<meta name="robots" content="noindex, nofollow">'}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/assets/gbp-results-og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/assets/gbp-results-og.jpg">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><div class="nav-inner">
  <a class="brand" href="/"><span>Prime Local Growth <small>The Google Visibility Company</small></span></a>
  <nav class="nav-links" aria-label="Primary navigation">
    <a href="/services">Services</a>
    <a href="/results">Results</a>
    <a class="btn btn-primary" href="/free-visibility-audit">Get My 3-Point Visibility Audit</a>
  </nav>
</div></header>
<main id="main">${bodyHtml}</main>
<footer class="footer"><div class="footer-bottom"><div class="wrap footer-bottom-inner">
  <p>&copy; ${new Date().getFullYear()} Prime Local Growth &middot; San Antonio, TX 78108</p>
</div></div></footer>
</body>
</html>`;
}

function page(record, indexable) {
  const label = record.businessName || record.url;
  const title = `AI Visibility Report: ${label} scored ${record.score}/100`;
  const description = `${label} scores ${record.score}/100 (${record.band}) on measurable AI visibility signals. See the checks that passed and failed.`;

  const rows = (record.checks || []).map((c) => `
    <div class="gap-item">
      <span class="gap-icon ${c.passed ? 'good' : 'bad'}" aria-hidden="true">${c.passed ? '&#10003;' : '!'}</span>
      <span class="gap-text"><strong>${esc(c.label)}</strong><br>${esc(c.evidence)}</span>
    </div>`).join('');

  const body = `
  <section class="section"><div class="wrap" style="max-width:760px;">
    <a class="breadcrumb" href="/ai-visibility-scorecard">AI Visibility Scorecard</a>
    <h1>${esc(label)} scored ${record.score}/100</h1>
    <p class="lead">${esc(record.band)} &middot; measured ${esc(new Date(record.checkedAt || record.savedAt).toDateString())}</p>
    <p class="sub">These are objective, machine-checkable signals that determine whether AI answer engines can read, understand, and cite a business. They are not opinions: each line below states the evidence.</p>
    <div class="gap-list" style="margin:28px 0;">${rows}</div>
    <div class="card" style="margin-top:28px;">
      <h2>What this does not tell you</h2>
      <p>This report measures whether AI engines <em>can</em> read and cite ${esc(label)}. It does not show what ChatGPT, Gemini, or Google's AI actually say when a customer asks for the best in the area, or who they name instead. That is what the full audit covers.</p>
      <p style="margin-top:14px;"><a class="btn btn-primary" href="/free-visibility-audit">Get My 3-Point Visibility Audit</a></p>
    </div>
    ${indexable ? '' : '<p class="sub" style="margin-top:20px;font-size:14px;">This report is private and not indexed by search engines.</p>'}
  </div></section>`;

  return shell(title, description, body, { indexable, path: `/s/${record.id}` });
}

function notFound() {
  return shell('Report not found | Prime Local Growth', 'This scorecard report is no longer available.', `
  <section class="section"><div class="wrap" style="max-width:640px;">
    <h1>That report is not available</h1>
    <p class="lead">The link may be mistyped or the report may have been removed.</p>
    <p><a class="btn btn-primary" href="/ai-visibility-scorecard">Run the scorecard</a></p>
  </div></section>`);
}

function notReady() {
  return shell('Sharing unavailable | Prime Local Growth', 'Scorecard sharing is not configured yet.', `
  <section class="section"><div class="wrap" style="max-width:640px;">
    <h1>Sharing is not switched on yet</h1>
    <p class="lead">The scorecard itself still works. Shareable reports need the result store configured.</p>
    <p><a class="btn btn-primary" href="/ai-visibility-scorecard">Run the scorecard</a></p>
  </div></section>`);
}
