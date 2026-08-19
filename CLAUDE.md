# primelocalgrowth-website

Live marketing site for Prime Local Growth. Deployed on Vercel, auto-deploys from the main branch.

## Stack
- Astro (static output, no client framework)
- `src/pages/` - the 20 built pages; `index.astro` keeps its own design system, the other 19 use `layouts/Base.astro`
- `src/layouts/Base.astro` - shared head, nav, footer, per-page body scripts
- `src/components/` - Nav, Footer, Logo
- `src/content-html/` - page bodies preserved verbatim from the pre-Astro site, injected with `set:html`
- `shared/pricing.mjs` - SINGLE SOURCE for pricing, imported by both the site and `api/`
- `src/config/site.mjs` - shared CTA and contact details
- `public/` - static assets plus 10 standalone pages passed through untouched
- `api/` - Vercel serverless functions
- `vercel.json` - routing, headers, deployment config

## Pricing changes
Edit `shared/pricing.mjs` and nothing else. It drives the visible page copy (via
`{{PRICE_*}}` tokens in `src/content-html/`), the FAQPage JSON-LD, and the Stripe
plan-name mapping in `api/stripe-webhook.js`. Before this existed those three
surfaces each held their own copy and drifted apart.

## Verifying a change
- `npm run build` - build all pages
- `node scripts/verify-migration.mjs` - diffs every built page against production

## Deploy
- Live URL: https://primelocalgrowth.com
- Deploy: push to main for automatic Vercel deployment
- Preview: `npx vercel`
- Local dev: `npm run dev`

## Integrations
- Beehiiv: newsletter automation
- Resend: transactional email for form alerts and auto-replies
- Google Sheets / Apps Script: lead intake via `/api/submit-form`
- Google Review link: https://g.page/r/CSRlPk-HmJb0EAI/review
- Audits: free visibility audit flow through `/free-visibility-audit`

## Key Files
- `src/pages/index.astro` - homepage content and primary conversion path
- `vercel.json` - routing rules
- `api/submit-form.js` - lead form submission to email, Beehiiv, Sheets, and audit automation
- `api/newsletter-subscribe.js` - newsletter signup to Beehiiv and Adam notification
- `api/utils/email.js` - centralized email utilities
- `public/site-form.js` - frontend lead form behavior
- `public/downloads/` - lead magnets and guides

## Rules
- Never hardcode API keys; use `process.env.VAR` or Vercel environment variables.
- Test locally before pushing to main.
- Never edit prices anywhere except `shared/pricing.mjs`.
- Keep `robots.txt` and `sitemap.xml` updated after adding or removing public pages.
