/**
 * One-shot mechanical migration of the shared-chrome pages into Astro.
 *
 * Extracts each page's head metadata and <main> body, then emits:
 *   src/content-html/<slug>.html  - the body, byte-for-byte
 *   src/pages/<slug>.astro        - a thin wrapper around Base.astro
 *
 * The body is injected with set:html from a ?raw import rather than being
 * rewritten as Astro markup, so the rendered output is identical and the
 * migration is verifiable by diffing. Pages can be converted to real
 * components incrementally afterwards.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PAGES = [
  'about', 'ai-visibility-scorecard', 'cibolo-local-seo', 'contact',
  'free-visibility-audit', 'gbp-scorecard', 'google-business-profile-optimization',
  'live-oak-local-seo', 'local-seo', 'new-braunfels-google-business-profile',
  'results', 'review-growth', 'san-antonio-local-seo',
  'schertz-google-business-profile', 'selma-google-business-profile', 'services',
  'thank-you', 'the-system', 'universal-city-local-seo',
];

const pick = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

const attr = (html, prop, kind = 'property') =>
  pick(html, new RegExp(`<meta\\s+${kind}=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']\\s*/?>`, 'i'));

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

mkdirSync(join(ROOT, 'src/content-html'), { recursive: true });
mkdirSync(join(ROOT, 'src/pages'), { recursive: true });

const report = [];

for (const slug of PAGES) {
  const src = join(ROOT, 'public', `${slug}.html`);
  if (!existsSync(src)) { report.push([slug, 'MISSING']); continue; }
  const html = readFileSync(src, 'utf8');

  const title = pick(html, /<title>([\s\S]*?)<\/title>/i);
  const description = attr(html, 'description', 'name');
  const canonical = pick(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  const ogTitle = attr(html, 'og:title');
  const ogDescription = attr(html, 'og:description');
  const ogImage = attr(html, 'og:image');
  const ogType = attr(html, 'og:type');

  // Body: inner HTML of <main ...> ... </main>
  const mainMatch = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (!mainMatch) { report.push([slug, 'NO <main>']); continue; }
  const body = mainMatch[1];

  // Some pages carry a fixed CTA between </main> and <footer>. Line-based
  // detection misses it on the minified city pages, so match on the raw string.
  const betweenMatch = html.match(/<\/main>([\s\S]*?)<footer/i);
  const between = betweenMatch ? betweenMatch[1].trim() : '';

  // Head extras the layout does not already emit: inline styles and JSON-LD.
  const headOnly = html.slice(0, html.search(/<\/head>/i));
  const extras = [
    ...(headOnly.match(/<style[\s\S]*?<\/style>/gi) || []),
    ...(headOnly.match(/<script[^>]*application\/ld\+json[\s\S]*?<\/script>/gi) || []),
  ];

  writeFileSync(join(ROOT, 'src/content-html', `${slug}.html`), body, 'utf8');

  const path = canonical
    ? new URL(canonical).pathname.replace(/\/$/, '') || '/'
    : `/${slug}`;

  const props = [
    `  title="${esc(title)}"`,
    `  description="${esc(description || '')}"`,
    `  path="${esc(path)}"`,
  ];
  if (ogTitle && ogTitle !== title) props.push(`  ogTitle="${esc(ogTitle)}"`);
  if (ogDescription && ogDescription !== description) props.push(`  ogDescription="${esc(ogDescription)}"`);
  if (ogImage) props.push(`  ogImage="${esc(ogImage)}"`);
  if (ogType && ogType !== 'website') props.push(`  ogType="${esc(ogType)}"`);

  // Body scripts and the sticky CTA vary per page: the form pages need
  // site-form.js and the city pages deliberately omit exit-intent.js. Carrying
  // the defaults over would have silently broken the lead forms.
  const tail = html.slice(html.search(/<\/footer>/i));
  const pageScripts = [...tail.matchAll(/<script[^>]*src=["']\/([a-z0-9-]+)\.js["']/gi)].map((m) => m[1]);
  const stickyAudit = /<div class=["']sticky-audit["']/i.test(html);
  if (pageScripts.length) props.push(`  scripts={${JSON.stringify(pageScripts)}}`);
  if (stickyAudit) props.push('  stickyAudit');

  // JSON-LD / inline <style> are emitted verbatim into the head slot.
  const beforeFooterSlot = between
    ? `
  <Fragment slot="before-footer" set:html={beforeFooter} />`
    : '';
  const beforeFooterConst = between
    ? `const beforeFooter = ${JSON.stringify(between)};
`
    : '';

  const headSlot = extras.length
    ? `\n  <Fragment slot="head" set:html={headExtras} />`
    : '';
  const headConst = extras.length
    ? `const headExtras = ${JSON.stringify(extras.join('\n'))};\n`
    : '';

  const astro = `---
import Base from '../layouts/Base.astro';
import body from '../content-html/${slug}.html?raw';
import { renderPrices } from '../../shared/pricing.mjs';
${headConst}${beforeFooterConst}---
<Base
${props.join('\n')}
>${headSlot}
  <Fragment set:html={renderPrices(body)} />${beforeFooterSlot}
</Base>
`;

  writeFileSync(join(ROOT, 'src/pages', `${slug}.astro`), astro, 'utf8');
  report.push([slug, `ok  path=${path}  body=${body.length}B  headExtras=${extras.length}${between ? '  +beforeFooter' : ''}`]);
}

for (const [slug, status] of report) console.log(slug.padEnd(42), status);
console.log(`\n${report.filter(r => r[1].startsWith('ok')).length}/${PAGES.length} migrated`);
