/**
 * Prime Local Growth - Google Places audit enrichment
 *
 * Setup:
 * 1. Add GOOGLE_PLACES_API_KEY and PLG_SPREADSHEET_ID to Apps Script
 *    Project Settings -> Script Properties.
 * 2. Paste this file into the audit-generator Apps Script project.
 * 3. Call enrichAuditLeadWithPlaces(lead) before creating the audit document.
 * 4. Call replacePlacesAuditTags(body, places) while replacing document tags.
 * 5. Optionally call updateLeadPlacesByEmail(lead.email, places).
 */

const PLACES_AUDIT_CONFIG = {
  SPREADSHEET_ID_PROPERTY: "PLG_SPREADSHEET_ID",
  LEAD_SHEET: "PLG Lead Database",
  API_URL: "https://places.googleapis.com/v1/places:searchText",
  CACHE_SECONDS: 21600,
  BUSINESS_RESULT_LIMIT: 1,
  COMPETITOR_RESULT_LIMIT: 6,
  FIELD_MASK: [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.websiteUri",
    "places.nationalPhoneNumber",
    "places.googleMapsUri",
    "places.businessStatus"
  ].join(",")
};

const PLACES_SHEET_HEADERS = [
  "Google Place ID",
  "Google Rating",
  "Review Count",
  "Google Category",
  "Google Maps URL",
  "Top Competitor",
  "Competitor Rating",
  "Competitor Reviews",
  "Review Gap",
  "Places Audit Notes"
];

function enrichAuditLeadWithPlaces(lead) {
  const businessQuery = buildBusinessQuery(lead);
  const competitorQuery = buildCompetitorQuery(lead);

  if (!businessQuery) {
    return emptyPlacesEnrichment("Business name is required for Places enrichment.");
  }

  const businessResults = searchPlacesText(
    businessQuery,
    PLACES_AUDIT_CONFIG.BUSINESS_RESULT_LIMIT
  );

  const business = chooseBusinessMatch(businessResults, lead);

  if (!business) {
    return emptyPlacesEnrichment(`No Google place found for: ${businessQuery}`);
  }

  const competitorResults = competitorQuery
    ? searchPlacesText(competitorQuery, PLACES_AUDIT_CONFIG.COMPETITOR_RESULT_LIMIT)
    : [];

  const competitor = chooseTopCompetitor(competitorResults, business);
  const businessReviews = toNumber(business.userRatingCount);
  const competitorReviews = competitor ? toNumber(competitor.userRatingCount) : 0;

  return {
    placeId: cleanPlacesValue(business.id),
    businessName: getPlaceDisplayName(business),
    formattedAddress: cleanPlacesValue(business.formattedAddress),
    rating: toNumber(business.rating),
    reviewCount: businessReviews,
    category: getPlaceCategory(business),
    website: cleanPlacesValue(business.websiteUri),
    phone: cleanPlacesValue(business.nationalPhoneNumber),
    mapsUrl: cleanPlacesValue(business.googleMapsUri),
    businessStatus: cleanPlacesValue(business.businessStatus),
    competitorName: competitor ? getPlaceDisplayName(competitor) : "",
    competitorRating: competitor ? toNumber(competitor.rating) : 0,
    competitorReviews,
    competitorMapsUrl: competitor ? cleanPlacesValue(competitor.googleMapsUri) : "",
    reviewGap: Math.max(competitorReviews - businessReviews, 0),
    notes: buildPlacesAuditNotes(business, competitor)
  };
}

function searchPlacesText(textQuery, maxResultCount) {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GOOGLE_PLACES_API_KEY");

  if (!apiKey) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY script property.");
  }

  const normalizedQuery = cleanPlacesValue(textQuery).toLowerCase();
  const cacheKey = `places:${makePlacesCacheKey(normalizedQuery)}:${maxResultCount}`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const response = UrlFetchApp.fetch(PLACES_AUDIT_CONFIG.API_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_AUDIT_CONFIG.FIELD_MASK
    },
    payload: JSON.stringify({
      textQuery: textQuery,
      maxResultCount: maxResultCount,
      languageCode: "en",
      regionCode: "US"
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(`Places API ${status}: ${text.slice(0, 300)}`);
  }

  const parsed = JSON.parse(text || "{}");
  const places = Array.isArray(parsed.places) ? parsed.places : [];

  cache.put(cacheKey, JSON.stringify(places), PLACES_AUDIT_CONFIG.CACHE_SECONDS);
  return places;
}

function buildBusinessQuery(lead) {
  return [
    cleanPlacesValue(lead && lead.businessName),
    cleanPlacesValue(lead && lead.city)
  ].filter(Boolean).join(", ");
}

function buildCompetitorQuery(lead) {
  const niche = cleanPlacesValue(
    lead && (lead.mainService || lead.niche || lead.businessType)
  );
  const city = cleanPlacesValue(lead && lead.city);

  if (!niche || !city) return "";
  return `${niche} in ${city}`;
}

function chooseBusinessMatch(places, lead) {
  if (!Array.isArray(places) || places.length === 0) return null;

  const target = normalizePlacesText(lead && lead.businessName);
  const exact = places.find(place => normalizePlacesText(getPlaceDisplayName(place)) === target);

  return exact || places[0];
}

function chooseTopCompetitor(places, business) {
  if (!Array.isArray(places)) return null;

  const candidates = places.filter(place => {
    if (!place) return false;
    if (business.id && place.id === business.id) return false;

    return normalizePlacesText(getPlaceDisplayName(place)) !==
      normalizePlacesText(getPlaceDisplayName(business));
  });

  candidates.sort((a, b) => {
    const reviewDifference = toNumber(b.userRatingCount) - toNumber(a.userRatingCount);
    if (reviewDifference !== 0) return reviewDifference;
    return toNumber(b.rating) - toNumber(a.rating);
  });

  return candidates[0] || null;
}

function replacePlacesAuditTags(body, places) {
  const values = places || emptyPlacesEnrichment("");
  const replacements = {
    "{{Google Place ID}}": values.placeId,
    "{{Google Rating}}": formatPlacesRating(values.rating),
    "{{Review Count}}": String(values.reviewCount || 0),
    "{{Google Category}}": values.category,
    "{{Google Maps URL}}": values.mapsUrl,
    "{{Top Competitor}}": values.competitorName || "No competitor identified",
    "{{Competitor Rating}}": formatPlacesRating(values.competitorRating),
    "{{Competitor Reviews}}": String(values.competitorReviews || 0),
    "{{Review Gap}}": String(values.reviewGap || 0),
    "{{Places Audit Notes}}": values.notes
  };

  Object.keys(replacements).forEach(token => {
    body.replaceText(escapePlacesRegex(token), cleanPlacesValue(replacements[token]));
  });
}

function updateLeadPlacesByEmail(email, places) {
  const normalizedEmail = cleanPlacesValue(email).toLowerCase();
  if (!normalizedEmail) return false;

  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty(PLACES_AUDIT_CONFIG.SPREADSHEET_ID_PROPERTY);
  if (!spreadsheetId) {
    throw new Error("Missing PLG_SPREADSHEET_ID script property.");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(PLACES_AUDIT_CONFIG.LEAD_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;

  ensurePlacesSheetHeaders(sheet);
  const headerMap = getPlacesHeaderMap(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const emailIndex = headerMap.Email;

  if (emailIndex === undefined) {
    throw new Error("PLG Lead Database is missing the Email header.");
  }

  const rowOffset = rows.findIndex(row => {
    return cleanPlacesValue(row[emailIndex]).toLowerCase() === normalizedEmail;
  });

  if (rowOffset < 0) return false;

  const rowNumber = rowOffset + 2;
  const updates = {
    "Google Place ID": places.placeId,
    "Google Rating": places.rating || "",
    "Review Count": places.reviewCount || 0,
    "Google Category": places.category,
    "Google Maps URL": places.mapsUrl,
    "Top Competitor": places.competitorName,
    "Competitor Rating": places.competitorRating || "",
    "Competitor Reviews": places.competitorReviews || 0,
    "Review Gap": places.reviewGap || 0,
    "Places Audit Notes": places.notes
  };

  Object.keys(updates).forEach(header => {
    sheet.getRange(rowNumber, headerMap[header] + 1).setValue(updates[header]);
  });

  return true;
}

function ensurePlacesSheetHeaders(sheet) {
  const headerMap = getPlacesHeaderMap(sheet);

  PLACES_SHEET_HEADERS.forEach(header => {
    if (headerMap[header] === undefined) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headerMap[header] = sheet.getLastColumn() - 1;
    }
  });
}

function getPlacesHeaderMap(sheet) {
  const values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};

  values.forEach((header, index) => {
    const name = cleanPlacesValue(header);
    if (name) map[name] = index;
  });

  return map;
}

function buildPlacesAuditNotes(business, competitor) {
  const businessName = getPlaceDisplayName(business) || "The business";
  const businessReviews = toNumber(business.userRatingCount);
  const rating = formatPlacesRating(business.rating);

  if (!competitor) {
    return `${businessName} has ${businessReviews} Google reviews with a ${rating} rating. No comparable competitor was identified automatically.`;
  }

  const competitorName = getPlaceDisplayName(competitor);
  const competitorReviews = toNumber(competitor.userRatingCount);
  const gap = Math.max(competitorReviews - businessReviews, 0);

  return `${businessName} has ${businessReviews} Google reviews with a ${rating} rating. ${competitorName} has ${competitorReviews} reviews. Current review gap: ${gap}.`;
}

function emptyPlacesEnrichment(notes) {
  return {
    placeId: "",
    businessName: "",
    formattedAddress: "",
    rating: 0,
    reviewCount: 0,
    category: "",
    website: "",
    phone: "",
    mapsUrl: "",
    businessStatus: "",
    competitorName: "",
    competitorRating: 0,
    competitorReviews: 0,
    competitorMapsUrl: "",
    reviewGap: 0,
    notes: cleanPlacesValue(notes)
  };
}

function getPlaceDisplayName(place) {
  if (!place || !place.displayName) return "";
  return cleanPlacesValue(place.displayName.text || place.displayName);
}

function getPlaceCategory(place) {
  if (!place) return "";
  if (place.primaryTypeDisplayName) {
    return cleanPlacesValue(
      place.primaryTypeDisplayName.text || place.primaryTypeDisplayName
    );
  }
  return cleanPlacesValue(place.primaryType);
}

function makePlacesCacheKey(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return digest
    .slice(0, 12)
    .map(byte => (`0${(byte + 256).toString(16)}`).slice(-2))
    .join("");
}

function normalizePlacesText(value) {
  return cleanPlacesValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatPlacesRating(value) {
  const rating = toNumber(value);
  return rating ? rating.toFixed(1) : "N/A";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanPlacesValue(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function escapePlacesRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
