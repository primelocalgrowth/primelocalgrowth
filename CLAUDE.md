# primelocalgrowth-website

Live marketing site for Prime Local Growth. Deployed on Vercel, auto-deploys from the main branch.

## Stack
- Static HTML/CSS/JS
- `index.html` - main site entry point
- `public/` - static assets served directly
- `api/` - Vercel serverless functions
- `vercel.json` - routing and deployment config
- Vite build pipeline

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
- `index.html` - homepage content and primary conversion path
- `vercel.json` - routing rules
- `api/submit-form.js` - lead form submission to email, Beehiiv, Sheets, and audit automation
- `api/newsletter-subscribe.js` - newsletter signup to Beehiiv and Adam notification
- `api/utils/email.js` - centralized email utilities
- `public/site-form.js` - frontend lead form behavior
- `public/downloads/` - lead magnets and guides

## Rules
- Never hardcode API keys; use `process.env.VAR` or Vercel environment variables.
- Test locally before pushing to main.
- Keep `robots.txt` and `sitemap.xml` updated after adding or removing public pages.
