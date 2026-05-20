# primelocalgrowth-website

Live marketing site for Prime Local Growth. Deployed on Vercel, auto-deploys from main branch.

## Stack
- Static HTML/CSS/JS (no framework build step for the main site)
- `index.html` — main site entry point
- `public/` — static assets served directly
- `api/` — serverless functions (Vercel edge functions)
- `vercel.json` — routing and deployment config
- Vite used for bundling where configured

## Deploy
- **Live URL**: https://primelocalgrowth.com
- **Deploy**: `npx vercel --prod` or push to main (auto-deploy)
- **Preview**: `npx vercel` (creates preview URL)
- Local dev: `npx serve public` or `python3 -m http.server 5173`

## Integrations
- **Beehiiv**: pub_0044836f-7866-4885-8bff-804d13fe76e1 — newsletter + automation
- **Resend**: RESEND_API_KEY — transactional email (form alerts, auto-replies, welcome sequences, delivery)
- **Stripe**: payment links for Starter/Growth/Dominate/Elite plans — webhook at /api/stripe-webhook for auto-delivery
- **Google Review link**: https://g.page/r/CSRlPk-HmJb0EAI/review
- **Audits**: Manual via /plg-internet-visibility-audit skill (Claude API called by Adam, not auto-triggered)

## Key Files
- `index.html` — all page content, edit here for copy/layout changes
- `vercel.json` — routing rules, never break this
- `api/submit-form.js` — lead form submission → email to Adam + auto-reply + Beehiiv + Sheets
- `api/stripe-webhook.js` — Stripe payment completion → welcome email + onboarding checklist
- `api/blueprint-delivery.js` — Blueprint purchase → auto-deliver PDF via email
- `api/newsletter-subscribe.js` — Newsletter signup → add to Beehiiv + notify Adam
- `api/utils/email.js` — centralized email utilities (sendEmail, notifyAdamOfLead, sendLeadAutoReply, sendCustomerWelcome, sendOnboardingChecklist)
- `public/downloads/` — lead magnets and guides

## Rules
- Never hardcode API keys — use `process.env.VAR` or Vercel env vars
- Test locally before pushing to main
- Keep `robots.txt` and `sitemap.xml` updated after adding new pages
