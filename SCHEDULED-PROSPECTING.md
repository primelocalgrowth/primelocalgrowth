# Weekly Prospecting Automation

## Goal
Generate 25 qualified prospects → 4 audit requests → 2 new clients → $1K MRR with zero manual outreach

## Cadence
**Every Tuesday at 9:00 AM** (local timezone)

## Task
Run `/plg-prospect-pipeline` which:
1. Pulls target prospects from Apollo.io (HVAC, plumbing, dental, roofing in competitive markets)
2. Runs GBP gap analysis on each (visibility score, review count, citation gaps)
3. Generates 25 personalized emails with specific pain points
4. Outputs: CSV with emails + tracking spreadsheet

## Setup Options

### Option A: Remote Schedule (Claude.ai)
When connection is restored:
```
/schedule "Weekly Prospecting" 
  - Frequency: Every Tuesday 9:00 AM
  - Task: /plg-prospect-pipeline
```

### Option B: Manual Recurring Reminder
Set phone alarm or calendar recurring event for Tuesday 9 AM with note:
"Run /plg-prospect-pipeline to generate weekly prospects"

### Option C: Cron via Vercel (Future)
Could implement as Vercel cron function that triggers Claude API call to run prospect pipeline

## Expected Output (per run)
- 25 prospects qualified (2+ PLG sweet-spot triggers)
- 25 personalized emails with GBP gaps identified
- CSV tracking: prospect name → email → GBP score → top gaps → follow-up date
- Time: ~45 minutes

## Revenue Math
```
25 emails/week × 4 weeks = 100 emails/month
100 emails × 4% reply rate = 4 replies
4 replies × 50% audit-to-client = 2 new clients/month
2 clients × $497/mo (Growth tier avg) = $994 MRR
```

## Status
🟡 Waiting for claude.ai schedule connection to restore. Manually run `/plg-prospect-pipeline` each Tuesday in the meantime, or try scheduling again in a few minutes.
