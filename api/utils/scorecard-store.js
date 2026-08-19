/**
 * Persistence for scorecard results.
 *
 * Results are stored so a run can become a shareable page instead of a number
 * that vanishes on refresh. Backed by Vercel Blob; if BLOB_READ_WRITE_TOKEN is
 * not configured the scorecard still works and simply does not offer sharing,
 * so a missing store degrades the feature rather than breaking the tool.
 */
import { put, list } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const PREFIX = 'scorecards/';

export const storeConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Short, URL-safe, unguessable. Not sequential: ids must not be enumerable. */
export function newId() {
  return randomBytes(9).toString('base64url');
}

export async function saveResult(record) {
  if (!storeConfigured()) return null;
  const id = newId();
  const payload = { ...record, id, savedAt: new Date().toISOString() };
  await put(`${PREFIX}${id}.json`, JSON.stringify(payload), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 3600,
  });
  return payload;
}

export async function loadResult(id) {
  if (!storeConfigured()) return null;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(String(id || ''))) return null;

  // Resolve through list() rather than guessing the public URL, so a caller
  // cannot probe the blob store with crafted paths.
  const { blobs } = await list({ prefix: `${PREFIX}${id}.json`, limit: 1 });
  const match = blobs.find((b) => b.pathname === `${PREFIX}${id}.json`);
  if (!match) return null;

  const res = await fetch(match.url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  return await res.json();
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
        const res = await fetch(b.url, { signal: AbortSignal.timeout(5000) });
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    })
  );
  return records.filter((r) => r && r.publicConsent === true);
}
