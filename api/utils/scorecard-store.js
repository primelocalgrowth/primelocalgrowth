/**
 * Persistence for scorecard results.
 *
 * Results are stored so a run can become a shareable page instead of a number
 * that vanishes on refresh. Backed by a PRIVATE Vercel Blob store: these are
 * reports about identifiable businesses, so blobs require the store token to
 * read and are never fetchable by URL alone. The /s/<id> page is the only way
 * a report is exposed, which keeps the consent gate meaningful.
 *
 * If BLOB_READ_WRITE_TOKEN is absent the scorecard still works and sharing
 * simply reports itself unavailable, so a missing store degrades the feature
 * rather than breaking the tool.
 */
import { put, list, get } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const PREFIX = 'scorecards/';
const ACCESS = 'private';

export const storeConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Short, URL-safe, unguessable. Ids must not be enumerable. */
export function newId() {
  return randomBytes(9).toString('base64url');
}

const pathFor = (id) => `${PREFIX}${id}.json`;
const validId = (id) => /^[A-Za-z0-9_-]{8,32}$/.test(String(id || ''));

export async function saveResult(record) {
  if (!storeConfigured()) return null;
  const id = newId();
  const payload = { ...record, id, savedAt: new Date().toISOString() };
  await put(pathFor(id), JSON.stringify(payload), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: false,
  });
  return payload;
}

async function readJson(pathname, timeoutMs = 6000) {
  const result = await get(pathname, {
    access: ACCESS,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  if (!result || !result.stream) return null;
  const text = await new Response(result.stream).text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadResult(id) {
  if (!storeConfigured() || !validId(id)) return null;
  try {
    return await readJson(pathFor(id));
  } catch {
    // A missing blob throws rather than resolving null in some SDK paths.
    return null;
  }
}

/**
 * Results whose owner opted into the public index. Used for the aggregate
 * report; never returns anything that was not explicitly consented.
 */
export async function listPublicResults(limit = 500) {
  if (!storeConfigured()) return [];
  const { blobs } = await list({ prefix: PREFIX, limit });
  const records = await Promise.all(
    blobs.map(async (b) => {
      try {
        return await readJson(b.pathname, 5000);
      } catch {
        return null;
      }
    })
  );
  return records.filter((r) => r && r.publicConsent === true);
}
