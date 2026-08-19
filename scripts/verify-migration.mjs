/**
 * Verifies the Astro migration is content-preserving by diffing every built
 * page against the same page on production (which still serves the pre-Astro
 * build). Compares the <main> body and the head tags that matter for SEO,
 * normalising only insignificant whitespace.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://www.primelocalgrowth.com';
const PAGES = [
  ['/', 'index.html'],
  ['/about', 'about.html'],
  ['/ai-visibility-scorecard', 'ai-visibility-scorecard.html'],
  ['/cibolo-local-seo', 'cibolo-local-seo.html'],
  ['/contact', 'contact.html'],
  ['/free-visibility-audit', 'free-visibility-audit.html'],
  ['/gbp-scorecard', 'gbp-scorecard.html'],
  ['/google-business-profile-optimization', 'google-business-profile-optimization.html'],
  ['/live-oak-local-seo', 'live-oak-local-seo.html'],
  ['/local-seo', 'local-seo.html'],
  ['/new-braunfels-google-business-profile', 'new-braunfels-google-business-profile.html'],
  ['/results', 'results.html'],
  ['/review-growth', 'review-growth.html'],
  ['/san-antonio-local-seo', 'san-antonio-local-seo.html'],
  ['/schertz-google-business-profile', 'schertz-google-business-profile.html'],
  ['/selma-google-business-profile', 'selma-google-business-profile.html'],
  ['/services', 'services.html'],
  ['/thank-you', 'thank-you.html'],
  ['/the-system', 'the-system.html'],
  ['/universal-city-local-seo', 'universal-city-local-seo.html'],
];

// The audit CTA was inconsistent across the live pages (5 pages said one
// thing, 14 another). The migration unifies it, so normalise it away here in
// order to surface any OTHER unintended difference.
const CTA_OLD = /Get my free audit/gi;
const CTA_NEW = /Get My 3-Point Visibility Audit/gi;
const norm = (s) => s.replace(/\s+/g, ' ').replace(CTA_NEW, 'CTA').replace(CTA_OLD, 'CTA').trim();
const mainOf = (html) => {
  const m = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  return m ? norm(m[1]) : null;
};
const tag = (html, re) => { const m = html.match(re); return m ? norm(m[1]) : null; };
const meta = (html, p, k = 'property') =>
  tag(html, new RegExp(`<meta\\s+${k}=["']${p}["']\\s+content=["']([\\s\\S]*?)["']`, 'i'));

// Text-only comparison catches content loss even when markup is reformatted.
const textOf = (html) => norm(html.replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' '));

let fail = 0, warn = 0;
for (const [path, file] of PAGES) {
  const distPath = join(process.cwd(), 'dist', file);
  if (!existsSync(distPath)) { console.log(`MISSING dist  ${path}`); fail++; continue; }
  const built = readFileSync(distPath, 'utf8');

  const res = await fetch(SITE + path, { redirect: 'follow' });
  if (!res.ok) { console.log(`FETCH ${res.status}  ${path}`); fail++; continue; }
  const live = await res.text();

  const issues = [];
  for (const [label, fn] of [
    ['title', (h) => tag(h, /<title>([\s\S]*?)<\/title>/i)],
    ['description', (h) => meta(h, 'description', 'name')],
    ['canonical', (h) => tag(h, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)],
    ['og:title', (h) => meta(h, 'og:title')],
    ['og:url', (h) => meta(h, 'og:url')],
  ]) {
    const a = fn(live), b = fn(built);
    if (a !== b) issues.push(`${label}: live=${JSON.stringify(a)} built=${JSON.stringify(b)}`);
  }

  const lm = mainOf(live), bm = mainOf(built);
  if (lm && bm && lm !== bm) issues.push(`main markup differs (live ${lm.length}B vs built ${bm.length}B)`);

  const lt = textOf(live), bt = textOf(built);
  const textSame = lt === bt;

  if (issues.length) {
    // Text identical means no content was lost; markup-only deltas are benign.
    const benign = textSame && issues.every((i) => i.startsWith('main markup differs'));
    console.log(`${benign ? 'WARN ' : 'FAIL '} ${path}`);
    issues.forEach((i) => console.log(`        ${i}`));
    if (benign) warn++; else fail++;
  } else {
    console.log(`ok    ${path}${textSame ? '' : '  (text differs!)'}`);
    if (!textSame) fail++;
  }
}
console.log(`\n${PAGES.length - fail - warn} identical, ${warn} markup-only, ${fail} failing`);
process.exit(fail ? 1 : 0);
