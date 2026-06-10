# Cold Email Prospecting — Setup & Execution

## API Keys Required

### 1. Google Places API Key
- Go to [Google Cloud Console](https://console.cloud.google.com)
- Create new project or select existing
- Enable **Places API** (Maps section)
- Create API key in Credentials
- Copy key and set as environment variable

### 2. Resend API Key
- Already stored in Vercel env as `RESEND_API_KEY`
- For local testing, copy from Vercel dashboard → Settings → Environment Variables
- Paste into `.env.local` file

## Setup

```bash
# 1. Install dependencies
npm install node-fetch

# 2. Create .env.local file in root
cat > .env.local << EOF
GOOGLE_PLACES_API_KEY=your_key_here
RESEND_API_KEY=your_key_here
EOF

# 3. Run the prospecting script
node scripts/cold-email-prospecting.js
```

## What the Script Does

1. **Searches** 5 Texas cities for 8 business types (HVAC, Plumbing, Dental, etc.)
2. **Extracts** emails from business websites where available
3. **Deduplicates** against `sent-emails.json` (prevents re-sending)
4. **Personalizes** cold emails with business name, city, seasonal angle
5. **Sends** up to 30 emails via Resend with conversational, non-marketing copy
6. **Logs** sent-emails.json for future tracking

## Email Approach

- **Tone**: Direct, conversational (not marketing speak)
- **Angle**: Summer peak season, missed local leads, Google visibility gap
- **CTA**: Quick 15-min call, not pushy
- **Personalization**: Business name, city, relevant seasonal context
- **Subject lines**: 4 variants, randomly selected per email

## Output

- Terminal logs each search, extraction, and send
- `sent-emails.json` updated with all sent addresses
- Ready to check responses manually or track in email

## Notes

- Expects up to 30 valid emails from Places API results
- Skips emails already sent (checks sent-emails.json)
- Rate limiting: 500ms between API searches, 1000ms between Resend sends
- Website scraping is basic (may miss some emails — that's OK, we have 30 target anyway)

## Troubleshooting

- **"Places API error"**: Check API key is valid and Places API enabled
- **"RESEND_API_KEY not found"**: Verify .env.local has key or check Vercel dashboard
- **No emails extracted**: Some businesses don't publish emails on websites — script will skip those
- **Rate limit hit**: Google Places may throttle; script handles gracefully and continues
