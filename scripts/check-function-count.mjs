/**
 * Vercel's free plan allows 12 serverless functions and counts EVERY .js/.mjs/.ts
 * file under api/, helpers included. Exceeding it makes the whole deployment
 * fail while GitHub checks stay green, so the site silently stops updating
 * (this happened on 2026-11-01). Put shared code in lib/, not api/utils/.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 12;
const files = readdirSync(join(process.cwd(), 'api'), { recursive: true })
  .filter((f) => typeof f === 'string' && /\.(js|mjs|cjs|ts)$/.test(f));

if (files.length > LIMIT) {
  console.error(`Function count FAILED: ${files.length} files under api/ (limit ${LIMIT}). Move helpers to lib/.`);
  files.forEach((f) => console.error('  api/' + f));
  process.exit(1);
}
console.log(`Function count ok: ${files.length}/${LIMIT} files under api/.`);
