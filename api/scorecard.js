/**
 * Vercel Serverless Function - AI Visibility Scorecard
 * Runs objective, server-side checks on a prospect's website (robots.txt,
 * llms.txt, JSON-LD, answer structure, title/meta, sitemap, canonical) and
 * returns a weighted 0-100 score with per-check evidence.
 *
 * Deliberately does NOT query ChatGPT/Gemini/Perplexity or any LLM API - real
 * assistant-visibility testing is reserved for the paid tier. Everything here
 * is deterministic and free to run.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

// Seam for tests: DNS is stubbed so the suite needs no network.
export const __deps = { lookup: dnsLookup };

// In-memory rate limit: max 6 scorecards per IP per 10 minutes.
// Per-instance only (Vercel functions aren't guaranteed to share state across
// invocations), but still bounds abuse from a single warm instance. Expired
// entries are swept on each call so the map can't grow unbounded.
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const TOTAL_BUDGET_MS = 12000;
const HOMEPAGE_TIMEOUT_MS = 7000;
const ASSET_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'PrimeLocalGrowth-Scorecard/1.0 (+https://primelocalgrowth.com)';

const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];

const WEIGHTS = {
  ai_crawlers: 20,
  structured_data: 20,
  faq_schema: 15,
  answer_structure: 15,
  llms_txt: 10,
  title_meta: 10,
  sitemap: 5,
  https_canonical: 5
};

function isRateLimited(ip) {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(key);
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many scorecards from this network. Please wait a few minutes.' });
  }

  const body = parseBody(req.body);
  if (!body) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { url: rawUrl, businessName = '' } = body;
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2000) {
    return res.status(400).json({ error: 'Please provide the website address you want scored.' });
  }
  if (businessName != null && typeof businessName !== 'string') {
    return res.status(400).json({ error: 'Invalid businessName' });
  }

  let target;
  try {
    target = normaliseUrl(rawUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await assertPublicUrl(target);
  } catch (err) {
    console.error(JSON.stringify({ event: 'scorecard_blocked_host', requestId, host: target.hostname, reason: err.message }));
    return res.status(400).json({ error: 'That address could not be reached from the public internet.' });
  }

  const result = await runScorecard(target, startedAt, requestId);
  return res.status(200).json(result);
}

/**
 * Runs the checks and returns the result object. Extracted from the handler so
 * that saving a shareable report can re-run the checks server-side rather than
 * trusting a score posted by the client — otherwise anyone could publish a
 * fabricated report on this domain.
 *
 * Callers MUST have already passed `target` through normaliseUrl() and
 * assertPublicUrl(); this function does not re-validate the host.
 */
export async function runScorecard(target, startedAt = Date.now(), requestId = 'internal') {
  const deadline = startedAt + TOTAL_BUDGET_MS;

  let homepage;
  try {
    homepage = await safeFetch(target.toString(), HOMEPAGE_TIMEOUT_MS, deadline);
    if (!homepage.response.ok) throw new Error(`HTTP ${homepage.response.status}`);
  } catch (err) {
    console.error(JSON.stringify({ event: 'scorecard_homepage_failed', requestId, url: target.toString(), error: err?.message || 'unknown' }));
    // Lead tool: degrade instead of 500-ing at a prospect.
    return {
      ok: false,
      url: target.toString(),
      reason: describeFetchFailure(err),
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    };
  }

  const html = await readCapped(homepage.response);
  const finalUrl = new URL(homepage.finalUrl);
  const origin = finalUrl.origin;

  const [robots, llms, sitemap] = await Promise.all([
    fetchText(new URL('/robots.txt', origin).toString(), deadline),
    fetchText(new URL('/llms.txt', origin).toString(), deadline),
    fetchText(new URL('/sitemap.xml', origin).toString(), deadline)
  ]);

  const jsonLd = extractJsonLd(html);

  const checks = [
    checkAiCrawlers(robots),
    checkStructuredData(jsonLd),
    checkFaqSchema(jsonLd, html),
    checkAnswerStructure(html),
    checkLlmsTxt(llms),
    checkTitleMeta(html),
    checkSitemap(sitemap),
    checkHttpsCanonical(finalUrl, html)
  ];

  const score = Math.round(checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0));
  const gaps = checks
    .filter((check) => !check.passed)
    .sort((a, b) => b.weight - a.weight)
    .map(({ id, label, weight, detail }) => ({ id, label, weight, detail }));

  return {
    ok: true,
    url: finalUrl.toString(),
    score,
    band: bandFor(score),
    checks,
    gaps,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt
  };
}

// ============================================================
// REQUEST / URL HANDLING
// ============================================================
function parseBody(raw) {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw;
}

export function normaliseUrl(input) {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('That does not look like a valid website address.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https addresses can be scored.');
  }
  // Embedded credentials are a classic way to smuggle a different host past a check.
  if (parsed.username || parsed.password) {
    throw new Error('That does not look like a valid website address.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Only standard web ports (80 and 443) can be scored.');
  }
  if (!parsed.hostname || !parsed.hostname.includes('.') && isIP(parsed.hostname) === 0) {
    throw new Error('That does not look like a valid website address.');
  }

  parsed.hash = '';
  return parsed;
}

export async function assertPublicUrl(parsed) {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad_protocol');
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') throw new Error('bad_port');

  const literal = isIP(parsed.hostname) ? parsed.hostname : null;
  if (literal) {
    if (isPrivateAddress(literal)) throw new Error('private_ip');
    return;
  }

  let addresses;
  try {
    addresses = await __deps.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error('dns_failed');
  }
  if (!addresses?.length) throw new Error('dns_empty');
  // Any private answer disqualifies the host - a split-horizon record should not
  // become a path into the Vercel network.
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) throw new Error('private_ip');
  }
}

function isPrivateAddress(address) {
  const value = String(address || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const version = isIP(value);
  if (version === 4) return isPrivateV4(value);
  if (version === 6) return isPrivateV6(value);
  return true;
}

function isPrivateV4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                                  // 0.0.0.0/8
  if (a === 10) return true;                                 // 10/8
  if (a === 127) return true;                                // loopback
  if (a === 100 && b >= 64 && b <= 127) return true;         // CGNAT 100.64/10
  if (a === 169 && b === 254) return true;                   // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16/12
  if (a === 192 && b === 168) return true;                   // 192.168/16
  if (a === 192 && b === 0) return true;                     // 192.0.0/24 + 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true;       // benchmarking
  if (a >= 224) return true;                                 // multicast + reserved
  return false;
}

function isPrivateV6(address) {
  const value = address.split('%')[0];
  // IPv4-mapped (::ffff:127.0.0.1) inherits the v4 verdict.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return isPrivateV4(mapped[1]);
  if (value === '::' || value === '::1') return true;
  const head = value.slice(0, 4);
  if (/^f[cd]/.test(head)) return true;                      // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true;                   // fe80::/10 link-local
  if (/^ff/.test(head)) return true;                         // multicast
  return false;
}

// ============================================================
// FETCHING
// ============================================================
function remaining(deadline) {
  return deadline - Date.now();
}

async function safeFetch(startUrl, timeoutMs, deadline) {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const budget = Math.min(timeoutMs, remaining(deadline));
    if (budget <= 0) throw new Error('time_budget_exhausted');

    const parsed = new URL(current);
    await assertPublicUrl(parsed);

    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(budget),
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      await discardBody(response);
      if (!location) return { response, finalUrl: parsed.toString() };
      // Each hop is re-validated: a public host can still redirect to 169.254.169.254.
      current = new URL(location, parsed).toString();
      continue;
    }

    return { response, finalUrl: parsed.toString() };
  }

  throw new Error('too_many_redirects');
}

// Auxiliary assets never fail the scorecard - a miss is data, not an error.
async function fetchText(url, deadline) {
  try {
    const { response } = await safeFetch(url, ASSET_TIMEOUT_MS, deadline);
    if (!response.ok) {
      await discardBody(response);
      return { ok: false, status: response.status, text: '' };
    }
    const text = await readCapped(response);
    return { ok: true, status: response.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err?.message || 'unknown' };
  }
}

async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return String(text || '').slice(0, MAX_BODY_BYTES);
  }

  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    // Truncated transfer still yields usable markup for the checks below.
  }
  return out;
}

async function discardBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Nothing to release.
  }
}

function describeFetchFailure(err) {
  const message = String(err?.message || '');
  if (/time_budget_exhausted|timeout|aborted|TimeoutError/i.test(message) || err?.name === 'TimeoutError') {
    return 'The site did not respond in time, so it could not be scored.';
  }
  if (/too_many_redirects/i.test(message)) return 'The site redirected too many times to be scored.';
  if (/private_ip|bad_port|bad_protocol/i.test(message)) return 'That address could not be reached from the public internet.';
  if (/dns_failed|dns_empty|ENOTFOUND|EAI_AGAIN/i.test(message)) return 'That domain could not be resolved.';
  if (/^HTTP \d+/.test(message)) return `The homepage returned ${message}.`;
  return 'The homepage could not be fetched.';
}

// ============================================================
// CHECKS
// ============================================================
function check(id, label, passed, evidence, detail) {
  return { id, label, passed, weight: WEIGHTS[id], evidence, detail };
}

function checkAiCrawlers(robots) {
  if (!robots.ok || !robots.text.trim()) {
    return check('ai_crawlers', 'AI crawlers allowed', true, 'No robots.txt found, so nothing is blocked.', 'AI assistants can crawl this site.');
  }

  const groups = parseRobots(robots.text);
  const blocked = AI_AGENTS.filter((agent) => isAgentBlocked(groups, agent));

  if (!blocked.length) {
    return check('ai_crawlers', 'AI crawlers allowed', true, 'robots.txt does not block any major AI crawler.', 'AI assistants can crawl this site.');
  }

  return check(
    'ai_crawlers',
    'AI crawlers allowed',
    false,
    `Blocked in robots.txt: ${blocked.join(', ')}.`,
    'These crawlers are how ChatGPT, Claude, Perplexity and Google AI read your site. Blocked means invisible.'
  );
}

function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one rule block.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (field === 'disallow' || field === 'allow') {
      current.rules.push({ type: field, path: value });
    }
  }

  return groups;
}

function isAgentBlocked(groups, agent) {
  const name = agent.toLowerCase();
  const specific = groups.filter((group) => group.agents.includes(name));
  const applicable = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
  if (!applicable.length) return false;

  const rules = applicable.flatMap((group) => group.rules);
  const blocksRoot = rules.some((rule) => rule.type === 'disallow' && (rule.path === '/' || rule.path === '/*'));
  const allowsRoot = rules.some((rule) => rule.type === 'allow' && (rule.path === '/' || rule.path === '/*'));
  return blocksRoot && !allowsRoot;
}

function checkLlmsTxt(llms) {
  const text = llms.text || '';
  const bytes = Buffer.byteLength(text, 'utf8');
  // Some hosts answer 200 with a styled 404 page; that is not an llms.txt.
  const looksLikeHtml = /^\s*(<!doctype html|<html\b)/i.test(text);

  if (llms.ok && !looksLikeHtml && bytes > 200) {
    return check('llms_txt', 'llms.txt published', true, `llms.txt found (${bytes} bytes).`, 'AI assistants have a curated map of what this business does.');
  }

  const evidence = !llms.ok
    ? 'No llms.txt at the site root.'
    : looksLikeHtml
      ? '/llms.txt returned an HTML page, not a plain-text file.'
      : `llms.txt is only ${bytes} bytes, too thin to be useful.`;

  return check('llms_txt', 'llms.txt published', false, evidence, 'An llms.txt file tells AI assistants what you do, where you serve, and which pages matter.');
}

const BUSINESS_TYPE_PATTERN = /^(Organization|LocalBusiness|Corporation|NGO|.*Business.*|.*Service.*|.*Store|.*Shop|Restaurant|Dentist|Physician|Attorney|LegalService|MedicalClinic|MedicalBusiness|HealthAndBeautyBusiness|AutomotiveBusiness|FoodEstablishment|EntertainmentBusiness|EmergencyService|GovernmentOffice|SportsActivityLocation|TravelAgency|RealEstateAgent|InsuranceAgency|FinancialService|Plumber|Electrician|Locksmith|RoofingContractor|HVACBusiness|GeneralContractor|MovingCompany|Physiotherapy|DaySpa|BeautySalon|HairSalon|NailSalon|VeterinaryCare|ChildCare|SelfStorage|Notary)$/i;

function extractJsonLd(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push({ ok: true, data: JSON.parse(raw) });
    } catch {
      // Malformed JSON-LD is common and must never break the scorecard.
      blocks.push({ ok: false, data: null });
    }
  }

  return blocks;
}

function collectTypes(blocks) {
  const types = new Set();

  const walk = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;

    const type = node['@type'];
    if (typeof type === 'string') types.add(type);
    else if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') types.add(t);

    for (const key of ['@graph', 'mainEntity', 'hasPart', 'about', 'publisher', 'provider', 'itemListElement']) {
      if (node[key]) walk(node[key], depth + 1);
    }
  };

  for (const block of blocks) if (block.ok) walk(block.data, 0);
  return [...types];
}

function checkStructuredData(blocks) {
  const parsed = blocks.filter((block) => block.ok).length;
  const types = collectTypes(blocks);
  const businessTypes = types.filter((type) => BUSINESS_TYPE_PATTERN.test(type));

  if (businessTypes.length) {
    return check('structured_data', 'Business schema markup', true, `JSON-LD @type found: ${types.join(', ')}.`, 'Machines can read who this business is, where it is, and what it sells.');
  }

  const evidence = !blocks.length
    ? 'No JSON-LD blocks on the homepage.'
    : parsed === 0
      ? `${blocks.length} JSON-LD block(s) found but none parsed as valid JSON.`
      : `JSON-LD present but no business type. Found: ${types.join(', ') || 'no @type values'}.`;

  return check('structured_data', 'Business schema markup', false, evidence, 'LocalBusiness or Organization schema is the single strongest signal that an AI answer engine can identify you.');
}

function checkFaqSchema(blocks, html) {
  const hasFaqType = collectTypes(blocks).some((type) => /^(FAQPage|QAPage)$/i.test(type));
  if (hasFaqType) {
    return check('faq_schema', 'FAQ content for AI answers', true, 'FAQPage schema found in JSON-LD.', 'Question-and-answer content is what assistants quote back to searchers.');
  }

  const headingMatch = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  while ((match = headingMatch.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (/frequently asked|FAQ/i.test(text)) {
      return check('faq_schema', 'FAQ content for AI answers', true, `Visible FAQ section found: "${truncate(text, 60)}".`, 'Question-and-answer content is what assistants quote back to searchers.');
    }
  }

  return check('faq_schema', 'FAQ content for AI answers', false, 'No FAQPage schema and no visible FAQ heading.', 'AI assistants answer questions. Pages with no questions on them rarely get cited.');
}

function checkAnswerStructure(html) {
  const h1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(html);
  if (!h1) {
    return check('answer_structure', 'Direct answer under the headline', false, 'No <h1> on the homepage.', 'Assistants look for a headline followed by a short, direct answer. There is no headline to anchor to.');
  }

  const after = html.slice(h1.index + h1[0].length);
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after);
  if (!paragraph) {
    return check('answer_structure', 'Direct answer under the headline', false, 'No paragraph follows the <h1>.', 'Put one plain-language paragraph right under the headline saying what you do and where.');
  }

  const text = stripTags(paragraph[1]);
  const length = text.length;
  const excerpt = truncate(text, 90);

  if (length >= 40 && length <= 320) {
    return check('answer_structure', 'Direct answer under the headline', true, `${length} characters: "${excerpt}"`, 'The opening paragraph is a quotable answer, not a wall of text.');
  }

  const detail = length < 40
    ? 'The first paragraph is too short to answer anything. Aim for 40-320 characters.'
    : 'The first paragraph is too long to be quoted. Aim for 40-320 characters, then expand below.';

  return check('answer_structure', 'Direct answer under the headline', false, `${length} characters: "${excerpt}"`, detail);
}

function checkTitleMeta(html) {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';
  const description = getMetaContent(html, 'description');

  const titleOk = title.length >= 15 && title.length <= 65;
  const descriptionOk = description.length >= 50 && description.length <= 165;
  const evidence = `Title ${title.length} chars (want 15-65), meta description ${description.length} chars (want 50-165).`;

  if (titleOk && descriptionOk) {
    return check('title_meta', 'Title and meta description', true, evidence, 'Both are in the range search and AI snippets use without truncating.');
  }

  const problems = [];
  if (!title.length) problems.push('the title tag is missing');
  else if (!titleOk) problems.push(title.length < 15 ? 'the title is too short' : 'the title will be truncated');
  if (!description.length) problems.push('the meta description is missing');
  else if (!descriptionOk) problems.push(description.length < 50 ? 'the meta description is too thin' : 'the meta description will be truncated');

  return check('title_meta', 'Title and meta description', false, evidence, `Fix: ${problems.join(' and ')}.`);
}

function getMetaContent(html, name) {
  const pattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag);
    if (!nameMatch || nameMatch[1].toLowerCase() !== name) continue;
    const contentMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (contentMatch) return decodeEntities(contentMatch[1] ?? contentMatch[2] ?? contentMatch[3] ?? '').trim();
  }
  return '';
}

function checkSitemap(sitemap) {
  if (!sitemap.ok) {
    return check('sitemap', 'XML sitemap', false, 'No sitemap.xml at the site root.', 'A sitemap is how crawlers discover every page instead of only the ones you link from the homepage.');
  }

  const count = (sitemap.text.match(/<loc\b[^>]*>/gi) || []).length;
  if (count > 0) {
    return check('sitemap', 'XML sitemap', true, `sitemap.xml lists ${count} URL${count === 1 ? '' : 's'}.`, 'Crawlers have a full index of the site.');
  }

  return check('sitemap', 'XML sitemap', false, 'sitemap.xml exists but contains no <loc> entries.', 'An empty sitemap tells crawlers there is nothing worth indexing.');
}

function checkHttpsCanonical(finalUrl, html) {
  const secure = finalUrl.protocol === 'https:';
  const canonical = /<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i.test(html)
    || /<link\b[^>]*\bhref\s*=[^>]*rel\s*=\s*["']?canonical["']?/i.test(html);

  if (secure && canonical) {
    return check('https_canonical', 'HTTPS and canonical URL', true, 'Served over HTTPS with a rel=canonical link.', 'One secure, unambiguous address for every page.');
  }

  const problems = [];
  if (!secure) problems.push('the site is not served over HTTPS');
  if (!canonical) problems.push('there is no rel=canonical link');

  return check('https_canonical', 'HTTPS and canonical URL', false, `${problems.join(' and ')}.`, 'Without these, crawlers can index duplicate versions of the same page and split your authority.');
}

// ============================================================
// SHARED HELPERS
// ============================================================
function bandFor(score) {
  if (score >= 90) return 'Strong';
  if (score >= 70) return 'Visible';
  if (score >= 40) return 'Partially visible';
  return 'Invisible';
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function stripTags(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function truncate(value, max) {
  const text = String(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
