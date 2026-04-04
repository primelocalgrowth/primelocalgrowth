# Prime Local Growth - CRM-Lite System

## Overview

The CRM-Lite System is a Google Sheets-based client relationship management system designed specifically for Prime Local Growth. It tracks all client information, projects, communications, results, and ROI in one centralized location.

Unlike expensive CRM software, this system is:
- Custom-built for your business
- Fully integrated with Google Workspace
- Automated with Google Apps Script
- Easy to use and maintain
- Scalable as you grow

---

## Master Client Database Sheet

### Purpose
Central hub for all client information and project tracking.

### Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| Client ID | Text | Unique identifier | PLG-001 |
| Client Name | Text | Business name | ABC Plumbing |
| Contact Name | Text | Primary contact | John Smith |
| Email | Email | Primary email | john@abcplumbing.com |
| Phone | Phone | Primary phone | (555) 123-4567 |
| Industry | Dropdown | Business industry | Plumbing |
| Business Type | Dropdown | Service/Product/Retail | Service |
| Location | Text | City/State | Denver, CO |
| Website | URL | Business website | www.abcplumbing.com |
| Project Start Date | Date | Project start date | 2026-04-01 |
| Project Status | Dropdown | Discovery/Design/Implementation/Optimization/Complete | Implementation |
| Revenue Goal | Currency | Target revenue increase | $50,000 |
| Current Revenue | Currency | Current annual revenue | $200,000 |
| Baseline Customers/Month | Number | Current customer count | 15 |
| Target Customers/Month | Number | Target customer count | 25 |
| Investment Amount | Currency | Project investment | $5,000 |
| Expected ROI | Percentage | Expected return | 500% |
| Actual ROI | Percentage | Actual return (updated) | 450% |
| Last Communication | Date | Last contact date | 2026-04-15 |
| Next Communication | Date | Scheduled next contact | 2026-04-22 |
| Communication Notes | Text | Summary of communications | Discussed Q2 goals |
| Key Metrics | Text | Primary success metrics | Calls, Leads, Revenue |
| Challenges | Text | Current challenges | Low Google visibility |
| Opportunities | Text | Identified opportunities | Social media expansion |
| Referral Source | Text | How they found you | LinkedIn referral |
| Referral Partner | Text | Who referred them | Barry Hoehne |
| Case Study Status | Dropdown | Not Started/In Progress/Complete | In Progress |
| Testimonial Received | Checkbox | Testimonial provided | ✓ |
| Referral Potential | Dropdown | High/Medium/Low | High |
| Notes | Text | General notes | Strong partnership potential |

---

## Project Tracker Sheet

### Purpose
Track all active and completed projects with status and milestones.

### Columns

| Column | Type | Description |
|--------|------|-------------|
| Project ID | Text | Unique project identifier |
| Client Name | Text | Associated client |
| Project Name | Text | Specific project name |
| Project Type | Dropdown | Visibility System/Specific Channel/Optimization |
| Status | Dropdown | Discovery/Design/Implementation/Optimization/Complete |
| Start Date | Date | Project start date |
| Target End Date | Date | Expected completion date |
| Actual End Date | Date | Actual completion date |
| Phase | Dropdown | Current phase |
| Completion % | Percentage | Overall progress |
| Key Deliverables | Text | Main deliverables |
| Deliverables Completed | Checkbox | All delivered |
| Budget | Currency | Project budget |
| Spent | Currency | Amount spent to date |
| Budget Remaining | Currency | Remaining budget |
| Team Members | Text | Assigned team |
| Next Milestone | Text | Next major milestone |
| Milestone Date | Date | Target milestone date |
| Risks | Text | Identified risks |
| Blockers | Text | Current blockers |
| Notes | Text | General notes |

---

## Results & ROI Dashboard Sheet

### Purpose
Track client results and calculate ROI for each project.

### Columns

| Column | Type | Description |
|--------|------|-------------|
| Client Name | Text | Associated client |
| Project Name | Text | Specific project |
| Metric Category | Dropdown | Calls/Leads/Revenue/Traffic/Rankings |
| Baseline Value | Number | Starting metric value |
| Current Value | Number | Current metric value |
| Change | Number | Absolute change (auto-calculated) |
| Change % | Percentage | Percentage change (auto-calculated) |
| Time Period | Text | Measurement period (e.g., "90 days") |
| Revenue Impact | Currency | Estimated revenue impact |
| Cost | Currency | Project cost |
| ROI | Percentage | Return on investment (auto-calculated) |
| Status | Dropdown | On Track/Exceeding/Behind |
| Notes | Text | Specific notes about results |

---

## Client Communication Log Sheet

### Purpose
Track all client communications and follow-ups.

### Columns

| Column | Type | Description |
|--------|------|-------------|
| Date | Date | Communication date |
| Client Name | Text | Associated client |
| Contact Name | Text | Person contacted |
| Communication Type | Dropdown | Email/Call/Meeting/Video Call |
| Duration | Time | Length of communication |
| Summary | Text | Brief summary of discussion |
| Topics Covered | Text | Key topics discussed |
| Action Items | Text | Follow-up actions needed |
| Assigned To | Text | Who's responsible for follow-up |
| Follow-up Date | Date | When to follow up |
| Follow-up Completed | Checkbox | Follow-up done |
| Outcome | Text | Result of communication |
| Next Steps | Text | What happens next |
| Notes | Text | Additional notes |

---

## Invoice Tracker Sheet

### Purpose
Track all invoices and payments for Wave integration.

### Columns

| Column | Type | Description |
|--------|------|-------------|
| Invoice Number | Text | Unique invoice ID |
| Invoice Date | Date | Date invoice created |
| Client Name | Text | Associated client |
| Project Name | Text | Associated project |
| Description | Text | Invoice description |
| Amount | Currency | Invoice amount |
| Tax | Currency | Tax amount |
| Total | Currency | Total amount due |
| Payment Terms | Text | Payment terms (e.g., "Net 30") |
| Due Date | Date | Payment due date |
| Status | Dropdown | Draft/Sent/Paid/Overdue |
| Payment Date | Date | When payment received |
| Payment Method | Dropdown | Bank Transfer/Credit Card/Check |
| Notes | Text | Additional notes |
| Wave ID | Text | Wave invoice ID (for integration) |

---

## Setup Instructions

### Step 1: Create Master Spreadsheet

1. Open Google Sheets
2. Create new spreadsheet: "Prime Local Growth - Master Database"
3. Rename first sheet to "Client Master"

### Step 2: Create Sheets

1. Create additional sheets:
   - Project Tracker
   - Results & ROI Dashboard
   - Communication Log
   - Invoice Tracker

### Step 3: Set Up Headers

For each sheet, add the column headers listed above.

### Step 4: Add Formatting

1. Freeze header row
2. Add alternating row colors
3. Add data validation for dropdown columns
4. Add number formatting for currency/percentage
5. Add conditional formatting for status columns

### Step 5: Create Formulas

**In Project Tracker sheet:**
- Budget Remaining: `=Budget-Spent`
- Completion %: Manual entry or formula based on deliverables

**In Results & ROI Dashboard:**
- Change: `=Current Value-Baseline Value`
- Change %: `=(Change/Baseline Value)*100`
- ROI: `=((Revenue Impact-Cost)/Cost)*100`

**In Invoice Tracker:**
- Total: `=Amount+Tax`
- Status: Conditional based on payment date

### Step 6: Share & Permissions

- Keep Master Database private (only you)
- Share specific project folders with clients
- Use read-only permissions for client access

---

## Automation Integration

### Google Apps Script Automations

**Auto-Update Communication Log:**
- Automatically log emails sent to clients
- Track email opens and clicks
- Update follow-up dates

**Auto-Calculate ROI:**
- Automatically calculate ROI from metrics
- Update Results Dashboard
- Generate alerts for targets met/missed

**Auto-Generate Reports:**
- Monthly performance summaries
- Quarterly business reviews
- Annual results reports

**Auto-Send Reminders:**
- Remind about follow-up dates
- Alert for overdue invoices
- Notify about upcoming milestones

### Wave Integration

**Auto-Create Invoices:**
- Create Wave invoices from template
- Auto-populate client and project info
- Track invoice status in spreadsheet

**Auto-Sync Payments:**
- Sync payment status from Wave
- Update Invoice Tracker automatically
- Generate payment reports

---

## Usage Workflows

### New Client Onboarding

1. Add client to "Client Master" sheet
2. Assign unique Client ID
3. Fill in all contact information
4. Set project start date and goals
5. Create project in "Project Tracker"
6. Start communication log

### Project Tracking

1. Update "Project Tracker" with progress
2. Log all communications in "Communication Log"
3. Track metrics in "Results & ROI Dashboard"
4. Update status weekly
5. Alert if behind schedule

### Results Reporting

1. Update metrics in "Results & ROI Dashboard"
2. Calculate ROI automatically
3. Generate monthly report
4. Share with client
5. Update case study status

### Invoicing

1. Create invoice in Wave
2. Add to "Invoice Tracker"
3. Send to client
4. Track payment status
5. Update when paid

---

## Reports & Dashboards

### Monthly Performance Report

**Data Sources:** All sheets
**Contents:**
- New clients acquired
- Active projects
- Revenue impact
- Results achieved
- Upcoming milestones
- Action items

**Frequency:** Monthly (1st of month)

### Quarterly Business Review

**Data Sources:** Results & ROI Dashboard, Communication Log
**Contents:**
- Quarterly results summary
- ROI analysis
- Client satisfaction
- Challenges and solutions
- Next quarter plans
- Referral opportunities

**Frequency:** Quarterly

### Annual Results Summary

**Data Sources:** All sheets
**Contents:**
- Annual revenue impact
- Client success stories
- Case studies completed
- Referrals generated
- Team performance
- Plans for next year

**Frequency:** Annually

---

## Best Practices

**Data Entry:**
- Enter data consistently
- Use exact naming conventions
- Keep notes detailed
- Update regularly (daily/weekly)
- Don't leave fields blank

**Organization:**
- Sort by status or date
- Archive completed projects
- Clean up old data
- Maintain naming conventions
- Back up regularly

**Communication:**
- Log every communication
- Set follow-up dates
- Track outcomes
- Document decisions
- Share relevant updates

**Metrics:**
- Track consistently
- Update regularly
- Calculate ROI accurately
- Compare to benchmarks
- Celebrate wins

---

## Troubleshooting

**Issue:** Formula not calculating
**Solution:** Check cell references and data types

**Issue:** Dropdown not working
**Solution:** Verify data validation is set up

**Issue:** Automation not running
**Solution:** Check Google Apps Script triggers

**Issue:** Data getting messy
**Solution:** Follow naming conventions and clean up regularly

---

## Scaling the System

**For 2-5 Clients:**
Use basic sheets with manual updates

**For 5-10 Clients:**
Add Google Apps Script automation
Set up automated reports
Create dashboard views

**For 10+ Clients:**
Consider upgrading to full CRM
Integrate with project management tool
Add advanced analytics

---

## Next Steps

1. Create the Google Sheets template
2. Add all columns and formatting
3. Set up data validation
4. Create formulas
5. Add Google Apps Script automation
6. Start entering client data
7. Generate first reports

This CRM-Lite system will keep your business organized and scalable without expensive software.

