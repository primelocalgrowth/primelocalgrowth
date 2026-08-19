/**
 * Offline tests for api/scorecard.js.
 * Stubs globalThis.fetch and the DNS lookup seam so the suite needs no network.
 * Run: node scripts/test-scorecard.mjs
 */
import assert from 'node:assert/strict';

const scorecard = await import('../api/scorecard.js');
const handler = scorecard.default;
const deps = scorecard.__deps;

const originalFetch = globalThis.fetch;
const originalLookup = deps.lookup;

let passed = 0;
let failed = 0;
let ipCounter = 0;

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request(body, method = 'POST') {
  ipCounter += 1;
  const ip = `203.0.113.${ipCounter}`;
  return {
    method,
    body,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip }
  };
}

function serve(routes) {
  globalThis.fetch = async (url) => {
    const key = new URL(String(url)).pathname;
    const route = routes[key];
    if (typeof route === 'function') return route();
    if (!route) return new Response('not found', { status: 404 });
    return new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers ?? {} });
  };
}

function publicDns(address = '93.184.216.34') {
  deps.lookup = async () => [{ address, family: 4 }];
}

function checkById(body, id) {
  const found = body.checks.find((entry) => entry.id === id);
  assert.ok(found, `check ${id} missing from response`);
  return found;
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}: ${err?.message || err}`);
  }
}

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------
const GOOD_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'LocalBusiness', name: 'Alamo Air Conditioning', address: { '@type': 'PostalAddress', addressLocality: 'Cibolo' } },
    { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Do you offer emergency service?' }] }
  ]
});

function goodHomepage(jsonLd = GOOD_JSONLD) {
  return `<!doctype html>
<html lang="en">
<head>
  <title>Alamo Air Conditioning | Cibolo TX HVAC</title>
  <meta name="description" content="Alamo Air Conditioning repairs and installs heating and cooling systems for homeowners across Cibolo and Schertz, Texas.">
  <link rel="canonical" href="https://example.com/">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <h1>Cibolo HVAC repair and installation</h1>
  <p>We repair and replace air conditioners and furnaces for homes in Cibolo, Schertz and Universal City, usually the same day you call.</p>
  <h2>Frequently asked questions</h2>
</body>
</html>`;
}

const GOOD_SITEMAP = '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/services</loc></url></urlset>';
const GOOD_LLMS = `# Alamo Air Conditioning\n\nHVAC contractor serving Cibolo, Schertz and Universal City, Texas.\n\n## Services\n- Air conditioning repair\n- Furnace replacement\n- Duct cleaning\n\n## Contact\nCall 210-555-0134 or book online at https://example.com/book\n`;

function goodRoutes(overrides = {}) {
  return {
    '/': { body: goodHomepage(), headers: { 'content-type': 'text/html' } },
    '/robots.txt': { body: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n' },
    '/llms.txt': { body: GOOD_LLMS },
    '/sitemap.xml': { body: GOOD_SITEMAP },
    ...overrides
  };
}

// ------------------------------------------------------------
// Cases
// ------------------------------------------------------------
try {
  await test('well-optimised site scores high', async () => {
    publicDns();
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com', businessName: 'Alamo Air Conditioning' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.score, 100, `expected 100, got ${res.body.score}: ${JSON.stringify(res.body.gaps)}`);
    assert.equal(res.body.band, 'Strong');
    assert.equal(res.body.gaps.length, 0);
    assert.equal(res.body.checks.length, 8);
    assert.ok(typeof res.body.durationMs === 'number');
    assert.ok(!Number.isNaN(Date.parse(res.body.checkedAt)));
  });

  await test('site blocking GPTBot fails ai_crawlers and scores lower', async () => {
    publicDns();
    serve(goodRoutes({
      '/robots.txt': { body: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n' }
    }));
    const res = responseRecorder();
    await handler(request({ url: 'example.com' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    const crawlers = checkById(res.body, 'ai_crawlers');
    assert.equal(crawlers.passed, false);
    assert.match(crawlers.evidence, /GPTBot/);
    assert.match(crawlers.evidence, /PerplexityBot/);
    assert.ok(!/ClaudeBot/.test(crawlers.evidence), 'ClaudeBot is allowed and must not be listed');
    assert.equal(res.body.score, 80);
    assert.equal(res.body.band, 'Visible');
    assert.equal(res.body.gaps[0].id, 'ai_crawlers');
    assert.equal(res.body.gaps[0].weight, 20);
  });

  await test('malformed JSON-LD does not throw', async () => {
    publicDns();
    serve(goodRoutes({
      '/': { body: goodHomepage('{ "@type": "LocalBusiness", name: broken,,, }') }
    }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    const structured = checkById(res.body, 'structured_data');
    assert.equal(structured.passed, false);
    assert.match(structured.evidence, /none parsed as valid JSON/);
    // The visible "Frequently asked questions" heading still carries faq_schema.
    assert.equal(checkById(res.body, 'faq_schema').passed, true);
  });

  await test('missing robots.txt counts as a pass', async () => {
    publicDns();
    serve(goodRoutes({ '/robots.txt': { status: 404, body: 'Not found' } }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.body.ok, true);
    const crawlers = checkById(res.body, 'ai_crawlers');
    assert.equal(crawlers.passed, true);
    assert.match(crawlers.evidence, /No robots\.txt/);
    assert.equal(res.body.score, 100);
  });

  await test('non-POST returns 405 with Allow header', async () => {
    publicDns();
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }, 'GET'), res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['Allow'], 'POST');
    assert.equal(res.body.error, 'Method not allowed');
  });

  await test('SSRF guard rejects a literal private IP', async () => {
    publicDns();
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'http://127.0.0.1/' }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /public internet/);
  });

  await test('SSRF guard rejects a hostname resolving to a private IP', async () => {
    deps.lookup = async () => [{ address: '10.0.0.5', family: 4 }];
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'https://intranet.example.com' }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /public internet/);
  });

  await test('SSRF guard rejects a redirect onto a private IP', async () => {
    deps.lookup = async (hostname) => (hostname === 'example.com'
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '169.254.169.254', family: 4 }]);
    serve(goodRoutes({
      '/': () => new Response(null, { status: 302, headers: { location: 'http://metadata.internal/latest/meta-data/' } })
    }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
    assert.match(res.body.reason, /public internet/);
  });

  await test('non-standard port is rejected', async () => {
    publicDns();
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'http://example.com:8080/' }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /standard web ports/);
  });

  await test('non-http scheme is rejected', async () => {
    publicDns();
    serve(goodRoutes());
    const res = responseRecorder();
    await handler(request({ url: 'file:///etc/passwd' }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /http and https/);
  });

  await test('homepage fetch failure degrades to ok:false', async () => {
    publicDns();
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.url, 'https://example.com/');
    assert.ok(typeof res.body.reason === 'string' && res.body.reason.length > 0);
    assert.ok(typeof res.body.durationMs === 'number');
    assert.equal(res.body.score, undefined);
  });

  await test('homepage 500 degrades to ok:false', async () => {
    publicDns();
    serve(goodRoutes({ '/': { status: 500, body: 'boom' } }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
    assert.match(res.body.reason, /HTTP 500/);
  });

  await test('poorly optimised site scores Invisible', async () => {
    publicDns();
    serve({
      '/': { body: '<html><head><title>Home</title></head><body><h1>Welcome</h1><p>Hi.</p></body></html>' },
      '/robots.txt': { body: 'User-agent: *\nDisallow: /\n' }
    });
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.score, 0, `expected 0, got ${res.body.score}`);
    assert.equal(res.body.band, 'Invisible');
    assert.equal(res.body.gaps.length, 8);
    assert.deepEqual(res.body.gaps.map((gap) => gap.weight), [20, 20, 15, 15, 10, 10, 5, 5]);
    assert.equal(res.body.gaps[0].id, 'ai_crawlers');
  });

  await test('an HTML 404 served at /llms.txt does not count', async () => {
    publicDns();
    serve(goodRoutes({ '/llms.txt': { body: `<!doctype html><html><body>${'x'.repeat(400)}</body></html>` } }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    const llms = checkById(res.body, 'llms_txt');
    assert.equal(llms.passed, false);
    assert.match(llms.evidence, /HTML page/);
  });

  await test('answer_structure rejects a wall of text and reports the length', async () => {
    publicDns();
    const wall = 'We are a full service provider of many things. '.repeat(12);
    serve(goodRoutes({
      '/': { body: goodHomepage().replace(/<p>[\s\S]*?<\/p>/, `<p>${wall}</p>`) }
    }));
    const res = responseRecorder();
    await handler(request({ url: 'https://example.com' }), res);

    const answer = checkById(res.body, 'answer_structure');
    assert.equal(answer.passed, false);
    assert.match(answer.evidence, /^\d+ characters/);
    assert.match(answer.detail, /too long/);
  });

  await test('rate limit trips after 6 requests from one IP', async () => {
    publicDns();
    serve(goodRoutes());
    const ip = '198.51.100.77';
    const make = () => ({ method: 'POST', body: { url: 'https://example.com' }, headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip } });

    let last;
    for (let i = 0; i < 6; i += 1) {
      last = responseRecorder();
      await handler(make(), last);
      assert.equal(last.statusCode, 200, `request ${i + 1} should be allowed`);
    }
    last = responseRecorder();
    await handler(make(), last);
    assert.equal(last.statusCode, 429);
  });

  await test('missing or invalid url is a 400', async () => {
    publicDns();
    serve(goodRoutes());
    const noUrl = responseRecorder();
    await handler(request({}), noUrl);
    assert.equal(noUrl.statusCode, 400);

    const badBody = responseRecorder();
    await handler(request('not json'), badBody);
    assert.equal(badBody.statusCode, 400);

    const junk = responseRecorder();
    await handler(request({ url: 'h ttp://%%%' }), junk);
    assert.equal(junk.statusCode, 400);
  });
} finally {
  globalThis.fetch = originalFetch;
  deps.lookup = originalLookup;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
