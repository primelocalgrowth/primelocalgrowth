import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../google-apps-script/places-audit-enrichment.gs', import.meta.url),
  'utf8'
);

const cache = new Map();
let fetchCount = 0;

const businessResponse = {
  places: [{
    id: 'place-business',
    displayName: { text: 'Test HVAC' },
    formattedAddress: '123 Main St, Schertz, TX',
    rating: 4.6,
    userRatingCount: 12,
    primaryType: 'hvac_contractor',
    primaryTypeDisplayName: { text: 'HVAC contractor' },
    websiteUri: 'https://testhvac.example',
    nationalPhoneNumber: '(210) 555-0100',
    googleMapsUri: 'https://maps.google.com/?cid=test',
    businessStatus: 'OPERATIONAL'
  }]
};

const competitorResponse = {
  places: [
    businessResponse.places[0],
    {
      id: 'place-small',
      displayName: { text: 'Small HVAC' },
      rating: 5,
      userRatingCount: 20,
      googleMapsUri: 'https://maps.google.com/?cid=small'
    },
    {
      id: 'place-large',
      displayName: { text: 'Large HVAC' },
      rating: 4.8,
      userRatingCount: 87,
      googleMapsUri: 'https://maps.google.com/?cid=large'
    }
  ]
};

const context = {
  console,
  JSON,
  Math,
  Number,
  String,
  Array,
  Error,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(name) {
          return name === 'GOOGLE_PLACES_API_KEY' ? 'test-api-key' : null;
        }
      };
    }
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) {
          return cache.get(key) || null;
        },
        put(key, value) {
          cache.set(key, value);
        }
      };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_algorithm, value) {
      return Array.from(Buffer.from(value)).slice(0, 12);
    }
  },
  UrlFetchApp: {
    fetch(_url, options) {
      fetchCount += 1;
      const body = JSON.parse(options.payload);
      const payload = body.maxResultCount === 1 ? businessResponse : competitorResponse;

      return {
        getResponseCode() {
          return 200;
        },
        getContentText() {
          return JSON.stringify(payload);
        }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context);

const lead = {
  businessName: 'Test HVAC',
  city: 'Schertz',
  mainService: 'HVAC'
};

const enrichment = context.enrichAuditLeadWithPlaces(lead);

assert.equal(enrichment.placeId, 'place-business');
assert.equal(enrichment.rating, 4.6);
assert.equal(enrichment.reviewCount, 12);
assert.equal(enrichment.category, 'HVAC contractor');
assert.equal(enrichment.competitorName, 'Large HVAC');
assert.equal(enrichment.competitorReviews, 87);
assert.equal(enrichment.reviewGap, 75);
assert.match(enrichment.notes, /Current review gap: 75/);
assert.equal(fetchCount, 2);

const cachedEnrichment = context.enrichAuditLeadWithPlaces(lead);
assert.equal(cachedEnrichment.reviewGap, 75);
assert.equal(fetchCount, 2, 'Expected cached requests to avoid additional API calls');

const replacements = new Map();
const body = {
  replaceText(token, value) {
    replacements.set(token, value);
  }
};

context.replacePlacesAuditTags(body, enrichment);

assert.equal(replacements.get('\\{\\{Google Rating\\}\\}'), '4.6');
assert.equal(replacements.get('\\{\\{Review Count\\}\\}'), '12');
assert.equal(replacements.get('\\{\\{Top Competitor\\}\\}'), 'Large HVAC');
assert.equal(replacements.get('\\{\\{Review Gap\\}\\}'), '75');

console.log('Places audit enrichment tests passed.');
