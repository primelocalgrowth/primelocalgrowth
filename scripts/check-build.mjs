/**
 * Post-build guard.
 *
 * renderPrices() throws on an unrecognised token, but it cannot catch a page
 * that simply never calls it — which is how a literal {{CTA_AUDIT}} reached
 * production on /about. This checks the built output instead of the inputs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const failures = [];

const files = readdirSync(DIST, { recursive: true })
  .filter((f) => typeof f === 'string' && (f.endsWith('.html') || f.endsWith('.txt')));

for (const file of files) {
  const html = readFileSync(join(DIST, file), 'utf8');

  const tokens = html.match(/\{\{[A-Z_]+\}\}/g);
  if (tokens) failures.push(`${file}: unsubstituted ${[...new Set(tokens)].join(', ')}`);

  // The retired plan must never be quoted to new prospects.
  if (/Visibility Management/.test(html) && !/Authority \+ AI Visibility/.test(html)) {
    failures.push(`${file}: references the retired "Visibility Management" plan`);
  }

  // Recurring pricing below the floor would undercut the published tiers.
  const subFloor = html.match(/\$(?:[1-8]?\d{1,2})\/(?:mo|month)\b/g);
  if (subFloor) failures.push(`${file}: sub-floor recurring price ${[...new Set(subFloor)].join(', ')}`);

  // Both scorecards shipped as dead markup: questions and answer buttons with
  // no script bound to them, so neither tool could ever produce a lead. Any
  // page carrying the quiz markup must also load the engine that drives it.
  if (/class="[^"]*\banswer-btn\b/.test(html) && !/src="\/scorecard\.js"/.test(html)) {
    failures.push(`${file}: has quiz markup but does not load /scorecard.js`);
  }
  if (/class="[^"]*\bquestion-block\b/.test(html)) {
    const questions = (html.match(/class="[^"]*\bquestion-block\b/g) || []).length;
    const annotated = (html.match(/data-gap=/g) || []).length;
    if (annotated < questions) {
      failures.push(`${file}: ${questions} questions but only ${annotated} have data-gap copy`);
    }
  }
}

if (failures.length) {
  console.error('Build check FAILED:');
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`Build check passed (${files.length} files).`);
