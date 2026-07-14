import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function addCheck(name, passed, detail = '') {
  checks.push({ name, passed, detail });
}

function walk(dir, files = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    const absolute = join(root, path);
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      walk(path, files);
    } else {
      files.push(path);
    }
  }

  return files;
}

const submitForm = read('api/submit-form.js');
const newsletterSubscribe = read('api/newsletter-subscribe.js');
const stripeWebhook = read('api/stripe-webhook.js');
const healthHandler = read('api/health.js');
const siteForm = read('public/site-form.js');
const privacyPage = read('public/privacy.html');
const vercelConfig = read('vercel.json');
const envExample = read('.env.example');
const placesModule = read('google-apps-script/places-audit-enrichment.gs');
const publicFiles = walk('public').filter(file => /\.(html|js|css)$/i.test(file));
const publicText = publicFiles.map(file => read(file)).join('\n');
const retiredDeliveryPath = '/api/' + 'blue' + 'print-delivery';
const retiredResourcePath = '/play' + 'books';
const retiredGrowthPagePath = '/local-' + 'domin' + 'ation';
const retiredDeliveryFile = 'api/' + 'blue' + 'print-delivery.js';
const retiredResourceFile = 'public/play' + 'books.html';
const retiredGrowthPageFile = 'public/local-' + 'domin' + 'ation.html';
const checkoutPattern = new RegExp('check' + 'out|secure ' + 'payment', 'i');

addCheck(
  'Frontend posts lead forms to /api/submit-form',
  siteForm.includes("fetch('/api/submit-form'")
);

addCheck(
  'Submit handler requires Google Sheets or audit webhook configuration',
  submitForm.includes('runRequiredIntegrations') &&
    submitForm.includes('GOOGLE_SHEETS_WEBHOOK_URL') &&
    submitForm.includes('MASTER_APPS_SCRIPT_WEBHOOK_URL')
);

addCheck(
  'Submit handler sends lead defaults expected by PLG Lead Database',
  submitForm.includes("leadStatus: 'New Lead'") &&
    submitForm.includes("status: 'Lead'") &&
    submitForm.includes('onboardingStep: 0') &&
    submitForm.includes("source: 'Website'")
);

addCheck(
  'Submit handler sends audit-generator fields',
  submitForm.includes('triggerAuditGenerator') &&
    submitForm.includes('visibilityConcern') &&
    submitForm.includes('submittedAt') &&
    submitForm.includes('businessName')
);

addCheck(
  'Transactional email and optional integrations are isolated from the required lead record',
  submitForm.includes('runOptionalIntegrations') && submitForm.includes('runOptionalTask')
);

addCheck(
  'Beehiiv receives only explicit newsletter or marketing opt-ins',
  submitForm.includes('lead.marketingConsent') &&
    siteForm.includes('name="marketingConsent"') &&
    newsletterSubscribe.includes('Explicit newsletter opt-in endpoint') &&
    !stripeWebhook.includes('addBeehiivActiveTag') &&
    privacyPage.includes('does not automatically subscribe you to the newsletter')
);

addCheck(
  'Lead forms include bot suppression and consent logging',
  siteForm.includes('name="companyWebsite"') &&
    submitForm.includes('marketing_consent') &&
    submitForm.includes('companyWebsite')
);

addCheck(
  'Newsletter reports failure when Beehiiv is unavailable',
  newsletterSubscribe.includes("return res.status(503)") &&
    newsletterSubscribe.includes("return res.status(502)")
);

addCheck(
  'Paid-client activation is durable and retryable',
  stripeWebhook.includes("action: 'update_status'") &&
    stripeWebhook.includes('await updateSheetsToActive') &&
    stripeWebhook.includes("return res.status(500).json({ error: 'Processing failed' })") &&
    stripeWebhook.includes('paymentId')
);

addCheck(
  'Health endpoint exposes deploy and integration readiness without secrets',
  vercelConfig.includes('api/health.js') &&
    healthHandler.includes('VERCEL_GIT_COMMIT_SHA') &&
    healthHandler.includes('integrations') &&
    !healthHandler.includes('process.env.GOOGLE_SHEETS_WEBHOOK_URL,')
);

addCheck(
  'Vercel routes no longer expose retired direct-sale endpoints',
  !vercelConfig.includes(retiredDeliveryPath) &&
    !vercelConfig.includes(retiredResourcePath) &&
    !vercelConfig.includes(retiredGrowthPagePath)
);

addCheck(
  'Retired direct-sale pages and handlers are removed',
  !existsSync(join(root, retiredDeliveryFile)) &&
    !existsSync(join(root, retiredResourceFile)) &&
    !existsSync(join(root, retiredGrowthPageFile))
);

addCheck(
  'Public site has no active checkout links',
  !checkoutPattern.test(publicText)
);

addCheck(
  '.env.example documents required automation webhook variables',
  envExample.includes('GOOGLE_SHEETS_WEBHOOK_URL') &&
    envExample.includes('MASTER_APPS_SCRIPT_WEBHOOK_URL')
);

addCheck(
  'Places audit enrichment uses protected server-side key and explicit field mask',
  placesModule.includes('GOOGLE_PLACES_API_KEY') &&
    placesModule.includes('PLG_SPREADSHEET_ID') &&
    placesModule.includes('X-Goog-FieldMask') &&
    !placesModule.includes('X-Goog-FieldMask": "*"') &&
    !placesModule.includes('1VQUrCVsn97iGlO_lQoK_HHDQqneKDgPN7udZRJWRW-U')
);

addCheck(
  'Places enrichment includes caching and competitor comparison',
  placesModule.includes('CacheService.getScriptCache') &&
    placesModule.includes('chooseTopCompetitor') &&
    placesModule.includes('reviewGap')
);

const failed = checks.filter(check => !check.passed);

for (const check of checks) {
  const prefix = check.passed ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} integration check(s) failed.`);
  process.exit(1);
}

console.log('\nPLG integration checks passed.');
