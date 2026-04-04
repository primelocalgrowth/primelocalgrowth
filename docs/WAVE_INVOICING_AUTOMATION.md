# Prime Local Growth - Wave Invoicing Automation

## Overview

This guide integrates your Wave invoicing with Prime Local Growth's business systems, automating invoice creation, tracking, and payment management.

---

## Wave API Integration

### Prerequisites

1. Wave account (you already have this)
2. Wave API access (enable in settings)
3. API key from Wave
4. Google Sheets for invoice tracking
5. Google Apps Script for automation

### Getting Your Wave API Key

1. Log in to Wave (wave.com)
2. Go to Settings → Integrations & Apps
3. Click "API" or "Developer"
4. Generate API key
5. Copy and save securely

---

## Invoice Automation Workflow

```
Client Project Completion
    ↓
Gather Project Data
    ↓
AI-Generate Invoice Template
    ↓
Manual Review & Customization
    ↓
Create in Wave
    ↓
Send to Client
    ↓
Track Payment Status
    ↓
Auto-Update in Google Sheets
    ↓
Payment Received
    ↓
Auto-Log in Financial Dashboard
```

---

## Invoice Template

### Standard Invoice Structure

**Header:**
- Prime Local Growth logo
- Your business name and contact info
- Invoice number (PLG-YYYY-MM-001)
- Invoice date
- Due date (Net 30)

**Client Information:**
- Client business name
- Client contact name
- Client email
- Client address

**Invoice Details:**

| Item | Description | Amount |
|------|-------------|--------|
| Visibility Systems Project | [Project Name] - [Description] | $X,XXX |
| Google Business Profile Optimization | [Specific services] | $X,XXX |
| Social Media Strategy | [Specific services] | $X,XXX |
| Paid Advertising Setup | [Specific services] | $X,XXX |
| Workflow Optimization | [Specific services] | $X,XXX |
| | **Subtotal** | **$X,XXX** |
| | **Tax (if applicable)** | **$XXX** |
| | **TOTAL DUE** | **$X,XXX** |

**Payment Terms:**
- Due date: [Date]
- Payment method: Bank transfer, credit card, check
- Bank details (if applicable)

**Notes:**
- Thank you for your business
- Next steps and timeline
- Contact information for questions

---

## Google Sheets Invoice Tracker

### Columns

| Column | Type | Description |
|--------|------|-------------|
| Invoice Number | Text | PLG-YYYY-MM-001 |
| Invoice Date | Date | Date created |
| Client Name | Text | Business name |
| Project Name | Text | Associated project |
| Description | Text | What was invoiced for |
| Amount | Currency | Invoice amount |
| Tax | Currency | Tax amount |
| Total | Currency | Total due |
| Due Date | Date | Payment deadline |
| Status | Dropdown | Draft/Sent/Paid/Overdue |
| Payment Date | Date | When paid |
| Payment Method | Dropdown | Bank/Card/Check |
| Wave ID | Text | Wave invoice ID |
| Notes | Text | Additional notes |

### Formulas

```
Total = Amount + Tax
Days Overdue = IF(AND(Status="Overdue", TODAY()>Due Date), TODAY()-Due Date, 0)
```

---

## Automation Scripts

### Google Apps Script: Auto-Create Invoice in Wave

```javascript
function createWaveInvoice(clientName, projectName, amount, description) {
  const waveApiKey = "YOUR_WAVE_API_KEY";
  const customerId = getWaveCustomerId(clientName);
  
  const invoiceData = {
    customerId: customerId,
    invoiceNumber: generateInvoiceNumber(),
    invoiceDate: new Date(),
    dueDate: addDays(new Date(), 30),
    items: [
      {
        description: description,
        quantity: 1,
        unitPrice: amount
      }
    ],
    notes: `Project: ${projectName}`
  };
  
  const options = {
    method: "post",
    headers: {
      "Authorization": `Bearer ${waveApiKey}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(invoiceData)
  };
  
  const response = UrlFetchApp.fetch("https://api.waveapps.com/graphql", options);
  const result = JSON.parse(response.getContentText());
  
  return result.data.invoiceCreate.invoice.id;
}

function generateInvoiceNumber() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastInvoice = sheet.getRange(lastRow, 1).getValue();
  const number = parseInt(lastInvoice.split("-")[2]) + 1;
  return `PLG-${Utilities.formatDate(new Date(), "GMT", "yyyy-MM")}-${String(number).padStart(3, "0")}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

### Google Apps Script: Track Payment Status

```javascript
function updatePaymentStatus() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 1; i < values.length; i++) {
    const dueDate = new Date(values[i][8]); // Column I (Due Date)
    const status = values[i][9]; // Column J (Status)
    const today = new Date();
    
    if (status === "Sent" && today > dueDate) {
      sheet.getRange(i + 1, 10).setValue("Overdue");
    }
  }
}

function sendPaymentReminder() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 1; i < values.length; i++) {
    const dueDate = new Date(values[i][8]);
    const status = values[i][9];
    const clientEmail = values[i][4]; // Client email
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (status === "Sent" && daysUntilDue === 3) {
      sendReminderEmail(clientEmail, values[i]);
    }
  }
}

function sendReminderEmail(email, invoiceData) {
  const subject = `Payment Reminder: Invoice ${invoiceData[0]} Due in 3 Days`;
  const message = `
    Hi ${invoiceData[3]},
    
    This is a friendly reminder that invoice ${invoiceData[0]} is due on ${invoiceData[8]}.
    
    Amount Due: $${invoiceData[6]}
    
    Please let me know if you have any questions.
    
    Best regards,
    Prime Local Growth
  `;
  
  GmailApp.sendEmail(email, subject, message);
}
```

### Google Apps Script: Auto-Log Payments

```javascript
function logPaymentReceived(invoiceNumber, paymentAmount, paymentDate) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === invoiceNumber) {
      sheet.getRange(i + 1, 11).setValue(paymentDate);
      sheet.getRange(i + 1, 10).setValue("Paid");
      sheet.getRange(i + 1, 12).setValue("Bank Transfer"); // Update payment method
      
      // Send thank you email
      sendThankYouEmail(values[i][4], invoiceNumber);
      break;
    }
  }
}

function sendThankYouEmail(email, invoiceNumber) {
  const subject = `Payment Received - Invoice ${invoiceNumber}`;
  const message = `
    Thank you for your payment on invoice ${invoiceNumber}.
    
    We appreciate your business and look forward to continuing to drive results for you.
    
    Best regards,
    Prime Local Growth
  `;
  
  GmailApp.sendEmail(email, subject, message);
}
```

---

## Invoicing Workflow

### Step 1: Create Invoice Template

1. Open Wave
2. Go to Invoices
3. Create new invoice template
4. Add your logo and branding
5. Set default payment terms (Net 30)
6. Save as template

### Step 2: Generate Invoice

**Manual Process:**
1. Open Wave
2. Create new invoice
3. Select client
4. Add line items
5. Review and send

**Automated Process:**
1. Google Sheets form submission
2. AI generates invoice data
3. Google Apps Script creates in Wave
4. Auto-sends to client
5. Tracks in spreadsheet

### Step 3: Send to Client

**Options:**
- Wave sends directly
- You send via email
- Include in project completion email
- Send with final report

**Best Practice:**
- Send invoice with project completion
- Include summary of results achieved
- Reference case study or ROI
- Thank them for business
- Outline next steps

### Step 4: Track Payment

**In Wave:**
- Mark as sent
- Set payment reminder
- Track payment status
- Record when paid

**In Google Sheets:**
- Update status column
- Log payment date
- Track payment method
- Update financial dashboard

### Step 5: Follow Up

**If Not Paid:**
- 3-day reminder (automated)
- 7-day follow-up (manual)
- 14-day final notice (manual)
- Escalate if needed

**When Paid:**
- Send thank you email (automated)
- Log in financial dashboard
- Update client record
- Plan next project

---

## Financial Dashboard

### Google Sheet: Monthly Financial Summary

**Columns:**
- Month
- Invoices Created
- Total Invoiced
- Paid
- Unpaid
- Overdue
- Collection Rate %
- Revenue Recognized

**Formulas:**
```
Collection Rate = (Paid / Total Invoiced) * 100
Revenue Recognized = Paid amount
```

### Monthly Report

```markdown
# Monthly Financial Report - [Month/Year]

## Invoice Summary
- Invoices Created: X
- Total Invoiced: $X,XXX
- Amount Paid: $X,XXX
- Amount Pending: $X,XXX
- Collection Rate: XX%

## Payment Status
- Paid: X invoices
- Pending: X invoices
- Overdue: X invoices

## Financial Health
- Monthly Revenue: $X,XXX
- Average Invoice: $X,XXX
- Days to Payment: X days
- Projected Annual Revenue: $X,XXX

## Action Items
- Follow up on X overdue invoices
- Send reminders for X pending invoices
- Plan for Q[X] projects
```

---

## Best Practices

**Invoicing:**
- Invoice immediately after project completion
- Be specific about what was invoiced for
- Include measurable results achieved
- Use professional formatting
- Personalize with client name

**Payment Terms:**
- Net 30 is standard
- Offer early payment discount (2% for payment within 10 days)
- Be clear about payment methods
- Include late payment terms if needed
- Follow up consistently

**Collection:**
- Send reminders 3 days before due
- Follow up 7 days after due
- Be professional but firm
- Document all communications
- Escalate if necessary

**Financial Management:**
- Track all invoices in spreadsheet
- Reconcile with Wave monthly
- Monitor cash flow
- Plan for seasonal variations
- Project annual revenue

---

## Integration Checklist

- [ ] Get Wave API key
- [ ] Set up Google Sheets invoice tracker
- [ ] Create invoice template in Wave
- [ ] Test invoice creation script
- [ ] Set up payment tracking automation
- [ ] Create financial dashboard
- [ ] Set up payment reminders
- [ ] Document process for team
- [ ] Train on new system
- [ ] Monitor and optimize

---

## Troubleshooting

**Issue:** Invoice not creating in Wave
**Solution:** Check API key, verify client exists, check data format

**Issue:** Payment not updating
**Solution:** Verify Wave webhook setup, check automation trigger

**Issue:** Emails not sending
**Solution:** Check Gmail permissions, verify email addresses, check spam folder

**Issue:** Data not syncing
**Solution:** Verify API connection, check for errors in logs, test manually

---

## Next Steps

1. Set up Wave API access
2. Create Google Sheets invoice tracker
3. Test invoice creation script
4. Set up payment tracking
5. Create financial dashboard
6. Train on new workflow
7. Monitor and optimize

This automation system will save you 5-10 hours per month on invoicing and payment tracking while ensuring consistent, professional billing.

