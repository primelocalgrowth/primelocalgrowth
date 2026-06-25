/**
 * Google Reviews — fetches live reviews from Google Places API
 * Required env vars:
 *   GOOGLE_PLACES_API_KEY  — Google Cloud API key with Places API enabled
 *   GOOGLE_PLACE_ID        — Find it: maps.google.com → search your business → share → copy place_id from URL
 */

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.primelocalgrowth.com');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return res.status(200).json(cache);
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return res.status(200).json({ reviews: [], configured: false });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&reviews_sort=newest&key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Places API ${r.status}`);

    const data = await r.json();
    if (data.status !== 'OK') throw new Error(`Places status: ${data.status}`);

    const reviews = (data.result.reviews || []).map(rv => ({
      author: rv.author_name,
      rating: rv.rating,
      text: rv.text,
      time: rv.relative_time_description,
      photo: rv.profile_photo_url || null,
    }));

    const payload = {
      reviews,
      rating: data.result.rating,
      total: data.result.user_ratings_total,
      configured: true,
    };

    cache = payload;
    cacheTime = Date.now();

    return res.status(200).json(payload);
  } catch (err) {
    console.error('Reviews fetch error:', err.message);
    return res.status(200).json({ reviews: [], configured: true, error: err.message });
  }
}
