/**
 * Splits index.html into the raw fragments index.astro reassembles.
 * The homepage keeps its own design system (inline CSS, anchor nav, own
 * footer), so it gets its own layout rather than being forced onto site.css.
 *
 * The JSON-LD @graph is extracted to data and its pricing answer is patched
 * from shared/pricing.mjs at build time, so the string Google and the AI
 * answer engines quote can no longer drift from the page copy.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const lines = readFileSync(join(ROOT, 'index.html'), 'utf8').split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

mkdirSync(join(ROOT, 'src/content-html'), { recursive: true });
mkdirSync(join(ROOT, 'src/data'), { recursive: true });

// <style> contents (exclusive of the tags)
writeFileSync(join(ROOT, 'src/content-html/index-style.css'), slice(93, 330), 'utf8');

// body: skip-link through the sticky CTA, before the trailing scripts
writeFileSync(join(ROOT, 'src/content-html/index-body.html'), slice(334, 683), 'utf8');

// the page's inline <script> contents
writeFileSync(join(ROOT, 'src/content-html/index-inline.js'), slice(687, 774), 'utf8');

// JSON-LD graph -> data, so pricing can be injected
const jsonld = slice(22, 87);
const graph = JSON.parse(jsonld);
writeFileSync(join(ROOT, 'src/data/home-schema.json'), JSON.stringify(graph, null, 2), 'utf8');

console.log('index-style.css  ', slice(93, 330).length, 'B');
console.log('index-body.html  ', slice(334, 683).length, 'B');
console.log('index-inline.js  ', slice(687, 774).length, 'B');
console.log('home-schema.json ', JSON.stringify(graph).length, 'B  types:',
  graph['@graph'].map(n => n['@type']).join(', '));
