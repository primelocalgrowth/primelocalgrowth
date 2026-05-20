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
- **Anthropic Claude API**: ANTHROPIC_API_KEY — triggers instant audit on form submission via /plg-internet-visibility-audit
- **Beehiiv**: pub_0044836f-7866-4885-8bff-804d13fe76e1 — newsletter + automation
- **Resend**: RESEND_API_KEY — transactional email (form alerts, auto-replies, audit reports)
- **Stripe**: payment links for Starter/Growth/Dominate/Elite plans — keys via env vars only
- **Google Review link**: https://g.page/r/CSRlPk-HmJb0EAI/review

## Key Files
- `index.html` — all page content, edit here for copy/layout changes
- `vercel.json` — routing rules, never break this
- `api/` — form handler and integrations
- `public/downloads/` — lead magnets and guides

## Rules
- Never hardcode API keys — use `process.env.VAR` or Vercel env vars
- Test locally before pushing to main
- Keep `robots.txt` and `sitemap.xml` updated after adding new pages
