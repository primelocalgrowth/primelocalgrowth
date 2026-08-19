/**
 * Aggregate report at /ai-visibility-index.
 *
 * Original local data: how San Antonio-area service businesses actually score
 * on machine-checkable AI visibility signals. This is the citable asset — the
 * kind of thing AI answer engines quote and other sites link to — and it costs
 * nothing extra because every scorecard run already produces a data point.
 *
 * Only reports whose owner opted into the public index are counted, and the
 * page stays noindex until there is enough data to be worth indexing.
 */
import { listPublicResults, storeConfigured } from './utils/scorecard-store.js';

const SITE = 'https://www.primelocalgrowth.com';
const MIN_SAMPLE = 10; // below this the numbers are noise, not a finding

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  let records = [];
  if (storeConfigured()) {
    try {
      records = await listPublicResults();
    } catch (error) {
      console.error(JSON.stringify({ event: 'visibility_index_failed', message: error?.message }));
    }
  }

  const stats = summarise(records);
  const indexable = stats.sample >= MIN_SAMPLE;

  res.setHeader('X-Robots-Tag', indexable ? 'index, follow' : 'noindex, nofollow');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(render(stats, indexable));
}

export function summarise(records) {
  const sample = records.length;
  if (!sample) return { sample: 0, median: 0, byCheck: [], bands: {} };

  const scores = records.map((r) => r.score).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const median = scores.length % 2 ? scores[mid] : Math.round((scores[mid - 1] + scores[mid]) / 2);

  const totals = new Map();
  for (const record of records) {
    for (const check of record.checks || []) {
      const entry = totals.get(check.id) || { id: check.id, label: check.label, passed: 0, total: 0 };
      entry.total += 1;
      if (check.passed) entry.passed += 1;
      totals.set(check.id, entry);
    }
  }
  const byCheck = [...totals.values()]
    .map((e) => ({ ...e, failRate: e.total ? Math.round(((e.total - e.passed) / e.total) * 100) : 0 }))
    .sort((a, b) => b.failRate - a.failRate);

  const bands = records.reduce((acc, r) => { acc[r.band] = (acc[r.band] || 0) + 1; return acc; }, {});
  return { sample, median, byCheck, bands };
}

function render(stats, indexable) {
  const title = stats.sample
    ? `AI Visibility Index: ${stats.sample} local businesses, median score ${stats.median}/100`
    : 'AI Visibility Index | Prime Local Growth';
  const description = stats.sample
    ? `Across ${stats.sample} local service businesses the median AI visibility score is ${stats.median}/100. The most common failure is ${stats.byCheck[0]?.label || 'missing structured data'}.`
    : 'How local service businesses score on measurable AI visibility signals.';

  const rows = stats.byCheck.map((c) => `
    <tr><td>${esc(c.label)}</td><td style="text-align:right;font-variant-numeric:tabular-nums;"><strong>${c.failRate}%</strong></td><td style="text-align:right;font-variant-numeric:tabular-nums;">${c.total - c.passed}/${c.total}</td></tr>`).join('');

  const schema = stats.sample >= MIN_SAMPLE ? `
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Prime Local Growth AI Visibility Index',
    description,
    url: `${SITE}/ai-visibility-index`,
    creator: { '@type': 'Organization', name: 'Prime Local Growth', url: SITE },
    temporalCoverage: new Date().getFullYear().toString(),
    variableMeasured: stats.byCheck.map((c) => c.label),
  }, null, 2)}
</script>` : '';

  const bodyStats = stats.sample
    ? `
    <p class="lead">Across <strong>${stats.sample}</strong> local service businesses that ran the scorecard and opted in, the median AI visibility score is <strong>${stats.median}/100</strong>.</p>
    <p class="sub">Each row is a machine-checkable signal that determines whether AI answer engines can read, understand, and cite a business. Sorted by how often local businesses fail it.</p>
    <div style="overflow-x:auto;margin:28px 0;">
      <table class="compare-table" style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Signal</th><th style="text-align:right;">Fail rate</th><th style="text-align:right;">Businesses</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : `
    <p class="lead">This index is still collecting data.</p>
    <p class="sub">Every business that runs the scorecard and opts in adds a data point. Once there are enough, this page will show which AI visibility signals local businesses most often fail.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${indexable ? `<link rel="canonical" href="${SITE}/ai-visibility-index">` : '<meta name="robots" content="noindex, nofollow">'}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/assets/gbp-results-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">${schema}
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
<main id="main">
  <section class="section"><div class="wrap" style="max-width:820px;">
    <a class="breadcrumb" href="/ai-visibility-scorecard">AI Visibility Scorecard</a>
    <h1>AI Visibility Index</h1>
    ${bodyStats}
    <div class="card" style="margin-top:28px;">
      <h2>Where this data comes from</h2>
      <p>Every business that runs the free AI Visibility Scorecard is measured on the same objective signals. Businesses that opt in are included here, anonymously and in aggregate. No individual business is named on this page.</p>
      <p style="margin-top:14px;"><a class="btn btn-primary" href="/ai-visibility-scorecard">Score my business</a></p>
    </div>
  </div></section>
</main>
<footer class="footer"><div class="footer-bottom"><div class="wrap footer-bottom-inner">
  <p>&copy; ${new Date().getFullYear()} Prime Local Growth &middot; San Antonio, TX 78108</p>
</div></div></footer>
</body>
</html>`;
}
