# Website Integration Setup Guide

Your website now has enhanced forms that integrate with **Beehiiv** (email) and **Google Sheets** (lead database). Follow this guide to configure each integration.

## ✅ Status
- ✅ Forms updated with phone field
- ✅ API handler ready for integrations
- ✅ Thank-you page created
- ⏳ Environment variables need to be configured
- ⏳ Beehiiv automation setup
- ⏳ Google Sheets webhook deployment

---

## Step 1: Configure Resend (Email Notifications)

**Status:** Already working (keeps sending emails to adam@primelocalgrowth.com)

Your existing `RESEND_API_KEY` is already configured in Vercel. No changes needed.

---

## Step 2: Configure Beehiiv Integration

### Get Your Beehiiv Credentials

1. Go to [Beehiiv Dashboard](https://dashboard.beehiiv.com)
2. Click **Settings** → **Integrations** → **API**
3. Copy your **API Key** (starts with `pak_`)
4. Go to **Publications** and find your publication
5. Copy the **Publication ID** (in the URL or settings, looks like `pub_xxxxx`)

### Set Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/projects)
2. Select your **primelocalgrowth** project
3. Go to **Settings** → **Environment Variables**
4. Add two new variables:
   - **Name:** `BEEHIIV_API_KEY`
     **Value:** `pak_xxxxxxxxxxxxx`
     **Environments:** Production, Preview, Development
   - **Name:** `BEEHIIV_PUBLICATION_ID`
     **Value:** `pub_xxxxxxxxxxxxx`
     **Environments:** Production, Preview, Development
5. Click **Save**

### Verify the Integration

1. Test the form on your website
2. Check Beehiiv dashboard → **Subscribers**
3. New subscriber should appear with:
   - **Email:** Test email
   - **Custom fields:** name, phone, business_type populated

---

## Step 3: Deploy Google Apps Script Webhook

This is the **recommended path** for Google Sheets integration (no service account credentials needed).

### Deploy the Script

1. Go to [Google Apps Script](https://script.google.com)
2. Create a **New Project**
3. Copy the entire code from: `/path/to/google-apps-script/sheets-webhook.gs`
4. Paste into the Apps Script editor
5. **Replace** `const SHEET_ID = "YOUR_SHEET_ID"` with your actual Google Sheet ID:
   - Open your sheet at: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`
   - Copy the `SHEET_ID` portion
6. Click **Deploy** → **New Deployment**
   - **Type:** Web app
   - **Execute as:** Your email (account that owns the sheet)
   - **Who has access:** Anyone
7. Click **Deploy**
8. Click **"Copy URL"** on the deployment confirmation

### Get Your Webhook URL

The deployment will show you a URL like:
```
https://script.google.com/macros/d/1234567890abcdefghijklmnop/userweb
```

Copy this entire URL.

### Set Webhook in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/projects)
2. Select your **primelocalgrowth** project
3. **Settings** → **Environment Variables**
4. Add new variable:
   - **Name:** `GOOGLE_SHEETS_WEBHOOK_URL`
   - **Value:** Paste the webhook URL you copied
   - **Environments:** Production, Preview, Development
5. Click **Save**

### Set Up Your Google Sheet

Create a new Google Sheet with these tabs:

#### Tab 1: "Leads"
Headers in row 1:
```
Timestamp | Name | Email | Business Type | Phone | Source | Segment | Status | Notes
```

#### Tab 2: "Submissions" (for debugging)
Headers in row 1:
```
Date | Email | Result | Error Message
```

#### Tab 3: "Metrics" (for tracking)
Headers in row 1:
```
Week | Form Submissions | Lead Magnet Downloads | Newsletter Opens | Newsletter Clicks | Consultation Bookings | Closed Deals
```

### Test the Integration

1. Go to your website form
2. Fill it out and submit:
   - Name: "Test Lead"
   - Email: "test@example.com"
   - Phone: "(555) 123-4567"
   - Business Type: "Test"
3. Check:
   - ✅ New row appears in "Leads" tab within 10 seconds
   - ✅ "Submissions" tab has a "success" entry
   - ✅ You get redirected to `/thank-you`

---

## Step 4: Set Up Beehiiv Automations

Once subscribers are being added, create these automations in Beehiiv:

### Automation 1: Welcome Sequence (Cold Leads)

**Trigger:** New subscriber OR subscriber added to "Cold Leads" segment

**Email 1 (Immediate):**
```
Subject: Get your free GBP audit report 📊

Hi [Name],

I've put together a free Google Business Profile audit report just for you.

This 10-minute audit shows:
✅ Your current GBP visibility score
✅ Top 3 optimization opportunities
✅ How you stack up vs. competitors

[DOWNLOAD REPORT BUTTON]

Questions? Just reply to this email.

Best,
Adam
Prime Local Growth
```

**Email 2 (Day 3):**
```
Subject: How [Business Type] businesses are getting 40+ reviews

Hi [Name],

I've been auditing Google Business Profiles for [Business Type] businesses, 
and there's a pattern to who ranks #1 locally.

It's not about having tons of reviews. It's about the RIGHT reviews + the RIGHT optimizations.

One of my clients, Kannon, went from 0→40 reviews and started getting 20+ inbound calls/week 
using this exact strategy.

Want to see how this could work for your business?

[SCHEDULE 20-MIN CALL]

Best,
Adam
```

**Email 3 (Day 7):**
```
Subject: The #1 mistake local businesses make on Google

Hi [Name],

Most [Business Type] businesses I audit are leaving $10K-50K on the table because 
they're missing ONE critical GBP optimization.

Here's what it is: [Explain the optimization]

This is low-hanging fruit that takes 10 minutes and could add thousands in revenue.

If you want me to check your profile and tell you if you're doing this:

[SCHEDULE CALL]

Best,
Adam
```

### Automation 2: Hot Lead Alert

**Trigger:** Subscriber clicks "Schedule Call" link

**Send email to:** adam@primelocalgrowth.com

```
Subject: 🔥 HOT LEAD: [Name] | [Business Type]

Name: [Name]
Email: [Email]
Phone: [Phone]
Business: [Business Type]

→ They clicked the call button. Follow up immediately!
```

---

## Step 5: Test Everything End-to-End

1. **Form submission:**
   - Fill out form with test data
   - Submit
   - ✅ Redirected to `/thank-you`?

2. **Email notification:**
   - Check email at adam@primelocalgrowth.com
   - ✅ Email received with all fields (including phone)?

3. **Beehiiv:**
   - Go to Beehiiv dashboard
   - ✅ New subscriber added?
   - ✅ Custom fields populated (name, phone, business_type)?

4. **Google Sheets:**
   - Open your Google Sheet
   - Go to "Leads" tab
   - ✅ New row with all data?

5. **Beehiiv automations:**
   - Check your test email in Beehiiv subscribers
   - ✅ Should have received first email?
   - ✅ Custom fields shown in subscriber detail?

---

## Troubleshooting

### Form submits but shows error

**Check:**
1. Browser console (F12 → Console tab) for JavaScript errors
2. Vercel logs: Dashboard → Logs → Function Logs
3. Each integration might be failing silently (form still succeeds)

### Subscriber not appearing in Beehiiv

**Check:**
1. `BEEHIIV_API_KEY` is correct (starts with `pak_`)
2. `BEEHIIV_PUBLICATION_ID` is correct (starts with `pub_`)
3. Subscriber might already exist (Beehiiv won't error, just won't re-add)
4. Check Beehiiv dashboard → check archived/inactive subscribers

### Row not appearing in Google Sheets

**Check:**
1. Sheet name is exactly **"Leads"** (case-sensitive)
2. Headers are in row 1
3. `GOOGLE_SHEETS_WEBHOOK_URL` is set correctly
4. Google Apps Script was deployed as **Web App** with **Anyone** access
5. Check "Submissions" tab for error messages

### Thank-you page not showing

**Check:**
1. Form needs to succeed and get a `redirectUrl` in response
2. If Beehiiv/Sheets fail, form still succeeds and redirects
3. Check browser network tab (F12 → Network) to see API response

---

## Next Steps

Once all integrations are working:

1. **Monitor submissions** — Check Google Sheets daily for new leads
2. **Set up Beehiiv automations** — Follow the templates above
3. **Create segments** — Move subscribers Cold → Warm → Hot → Client
4. **Connect Calendly** — When subscribers click "Book", they schedule a call
5. **Track metrics** — Update "Metrics" sheet weekly to monitor conversion rates

---

## Environment Variables Summary

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx          # Already set
BEEHIIV_API_KEY=pak_xxxxxxxxxxxxxxxxxxxxx        # Set now
BEEHIIV_PUBLICATION_ID=pub_xxxxxxxxxxxxx         # Set now
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google...  # Set after deploying script
```

---

## Questions?

- **Beehiiv API docs:** https://developers.beehiiv.com
- **Vercel environment variables:** https://vercel.com/docs/projects/environment-variables
- **Google Apps Script:** https://developers.google.com/apps-script
- **Email:** adam@primelocalgrowth.com

---

**Last updated:** May 17, 2026  
**Status:** Ready for configuration
