/**
 * Prime Local Growth - Lead Intake + Client Onboarding
 *
 * Flow:
 * Website form -> Vercel /api/submit-form -> Apps Script Web App -> PLG Lead Database
 * Status = Lead means prospect only.
 * Status = Active + Start Date means paid client onboarding starts.
 */

const PLG_CONFIG = {
  SPREADSHEET_ID: "1VQUrCVsn97iGlO_lQoK_HHDQqneKDgPN7udZRJWRW-U",
  LEAD_SHEET: "PLG Lead Database",
  LOG_SHEET: "Onboarding Log",
  FROM_NAME: "Adam Rome",
  FROM_EMAIL: "adam@primelocalgrowth.com",
  COMPANY: "Prime Local Growth",
  WEBSITE: "primelocalgrowth.com",
  ACCESS_GUIDE: "https://www.primelocalgrowth.com/gbp-access",
  DAILY_TRIGGER_HOUR: 8
};

const PLG_HEADERS = [
  "First Name",
  "Business Name",
  "Email",
  "Phone",
  "City",
  "Niche",
  "Lead Status",
  "Status",
  "Plan",
  "Start Date",
  "Onboarding Step",
  "Submitted At",
  "Source",
  "Website",
  "Main Service",
  "Visibility Concern",
  "Page URL",
  "Referrer",
  "Submission ID",
  "Payment ID",
  "Last Payment At",
  "Notes"
];

function doPost(e) {
  if (!isWebhookAuthorized(e)) {
    return jsonResponse({ success: false, error: "Unauthorized" });
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    return jsonResponse({ success: false, error: "System busy. Try again." });
  }

  try {
    const payload = parsePayload(e);
    if (clean(payload.action).toLowerCase() === "update_status") {
      const result = applyLeadStatusUpdate(payload);
      return jsonResponse({ success: true, action: "update_status", result });
    }
    const lead = normalizeLead(payload);
    const validationError = validateLead(lead);

    if (validationError) {
      return jsonResponse({ success: false, error: validationError });
    }

    const ss = getPLGSpreadsheet();
    const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
    const headerMap = getHeaderMap(sheet);

    upsertLead(sheet, headerMap, lead);

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    lock.releaseLock();
  }
}

function runOnboardingSequence() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    console.log("Onboarding sequence already running. Exiting.");
    return;
  }

  try {
    const ss = getPLGSpreadsheet();
    const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
    const headerMap = getHeaderMap(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      console.log("No client rows found.");
      return;
    }

    const lastCol = sheet.getLastColumn();
    const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const today = getDateOnly(new Date());
    const stepCol = headerMap["Onboarding Step"] + 1;
    const stepUpdates = rows.map(row => [Number(row[headerMap["Onboarding Step"]]) || 0]);
    const logRows = [];
    let emailsSent = 0;

    rows.forEach((row, index) => {
      const client = getClientFromRow(row, headerMap, index + 2);

      if (!shouldProcessClient(client)) {
        return;
      }

      const daysSinceStart = Math.floor((today - getDateOnly(client.startDate)) / 86400000);
      const nextStep = getNextOnboardingStep(client.onboardingStep, daysSinceStart);

      if (!nextStep) {
        return;
      }

      try {
        sendOnboardingEmail(nextStep, client);

        stepUpdates[index][0] = nextStep;
        emailsSent++;

        logRows.push(buildLogRow(client, nextStep, "Sent", ""));

        Utilities.sleep(1000);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logRows.push(buildLogRow(client, nextStep, "Failed", message));
        console.error(`Failed onboarding step ${nextStep} for ${client.email}: ${message}`);
      }
    });

    sheet.getRange(2, stepCol, stepUpdates.length, 1).setValues(stepUpdates);

    if (logRows.length > 0) {
      appendOnboardingLogs(ss, logRows);
    }

    console.log(`Onboarding complete. Sent ${emailsSent} email(s).`);
  } finally {
    lock.releaseLock();
  }
}

function setupPLGSystem() {
  const ss = getPLGSpreadsheet();

  getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  getOrCreateSheet(ss, PLG_CONFIG.LOG_SHEET, [
    "Timestamp",
    "Email",
    "First Name",
    "Business Name",
    "Step",
    "Subject",
    "Status",
    "Error"
  ]);

  setupOnboardingTrigger();

  console.log("PLG lead intake and onboarding system setup complete.");
}

function setupOnboardingTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "runOnboardingSequence") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("runOnboardingSequence")
    .timeBased()
    .atHour(PLG_CONFIG.DAILY_TRIGGER_HOUR)
    .everyDays(1)
    .create();

  console.log(`Onboarding trigger set for ${PLG_CONFIG.DAILY_TRIGGER_HOUR}:00 daily.`);
}

function getPLGSpreadsheet() {
  return SpreadsheetApp.openById(PLG_CONFIG.SPREADSHEET_ID);
}

function getOrCreateSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    : [];

  const hasHeaders = currentHeaders.some(value => String(value || "").trim());

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const existing = currentHeaders.map(header => String(header || "").trim());

  headers.forEach(header => {
    if (!existing.includes(header)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existing.push(header);
    }
  });

  sheet.setFrozenRows(1);
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};

  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (key) {
      map[key] = index;
    }
  });

  return map;
}

function isWebhookAuthorized(e) {
  const expected = clean(PropertiesService.getScriptProperties().getProperty("WEBHOOK_KEY"));
  if (!expected) return true;

  const provided = clean(e && e.parameter && e.parameter.key);
  return provided === expected;
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  return JSON.parse(e.postData.contents);
}

function normalizeLead(payload) {
  const name = clean(payload.name || payload.contactName);
  const firstName = clean(payload.firstName || name.split(/\s+/)[0]);
  const businessName = clean(payload.businessName || payload.business_name);
  const mainService = clean(payload.mainService || payload.main_service);
  const businessType = clean(payload.businessType || payload.business_type);
  const niche = clean(payload.niche || mainService || businessType || "local-service");

  return {
    firstName,
    businessName,
    email: clean(payload.email).toLowerCase(),
    phone: clean(payload.phone),
    city: clean(payload.city),
    niche,
    leadStatus: clean(payload.leadStatus || "New Lead"),
    status: clean(payload.status || "Lead"),
    plan: clean(payload.plan),
    startDate: clean(payload.startDate),
    onboardingStep: Number(payload.onboardingStep) || 0,
    submittedAt: clean(payload.submittedAt || payload.timestamp || new Date().toISOString()),
    source: clean(payload.source || "Website"),
    website: clean(payload.website),
    mainService,
    visibilityConcern: clean(payload.visibilityConcern || payload.visibility_concern),
    pageUrl: clean(payload.pageUrl || payload.page_url),
    referrer: clean(payload.referrer),
    submissionId: clean(payload.submissionId || payload.submission_id),
    paymentId: clean(payload.paymentId || payload.payment_id),
    lastPaymentAt: clean(payload.lastPaymentAt || payload.last_payment_at),
    notes: clean(payload.notes || payload.situation)
  };
}

function validateLead(lead) {
  if (!lead.email || !isValidEmail(lead.email)) return "Valid email is required.";
  if (!lead.businessName) return "Business name is required.";
  return "";
}

function upsertLead(sheet, headerMap, lead) {
  const existingRow = findExistingLeadRow(sheet, headerMap, lead.email, lead.businessName);
  const rowValues = buildLeadRow(sheet, headerMap, lead);

  if (existingRow) {
    const currentStatus = clean(sheet.getRange(existingRow, headerMap["Status"] + 1).getValue());

    if (currentStatus.toLowerCase() === "active") {
      updateLeadMetadataOnly(sheet, headerMap, existingRow, lead);
      return;
    }

    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    return;
  }

  sheet.appendRow(rowValues);
}

function findExistingLeadRow(sheet, headerMap, email, businessName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const emailCol = headerMap["Email"] + 1;
  const businessCol = headerMap["Business Name"] + 1;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowEmail = clean(values[i][emailCol - 1]).toLowerCase();
    const rowBusiness = clean(values[i][businessCol - 1]).toLowerCase();

    if (rowEmail === email && rowBusiness === businessName.toLowerCase()) {
      return i + 2;
    }
  }

  return null;
}

function buildLeadRow(sheet, headerMap, lead) {
  const row = new Array(sheet.getLastColumn()).fill("");

  setRowValue(row, headerMap, "First Name", lead.firstName);
  setRowValue(row, headerMap, "Business Name", lead.businessName);
  setRowValue(row, headerMap, "Email", lead.email);
  setRowValue(row, headerMap, "Phone", lead.phone);
  setRowValue(row, headerMap, "City", lead.city);
  setRowValue(row, headerMap, "Niche", lead.niche);
  setRowValue(row, headerMap, "Lead Status", lead.leadStatus);
  setRowValue(row, headerMap, "Status", lead.status);
  setRowValue(row, headerMap, "Plan", lead.plan);
  setRowValue(row, headerMap, "Start Date", lead.startDate);
  setRowValue(row, headerMap, "Onboarding Step", lead.onboardingStep);
  setRowValue(row, headerMap, "Submitted At", lead.submittedAt);
  setRowValue(row, headerMap, "Source", lead.source);
  setRowValue(row, headerMap, "Website", lead.website);
  setRowValue(row, headerMap, "Main Service", lead.mainService);
  setRowValue(row, headerMap, "Visibility Concern", lead.visibilityConcern);
  setRowValue(row, headerMap, "Page URL", lead.pageUrl);
  setRowValue(row, headerMap, "Referrer", lead.referrer);
  setRowValue(row, headerMap, "Submission ID", lead.submissionId);
  setRowValue(row, headerMap, "Payment ID", lead.paymentId);
  setRowValue(row, headerMap, "Last Payment At", lead.lastPaymentAt);
  setRowValue(row, headerMap, "Notes", lead.notes);

  return row;
}

function updateLeadMetadataOnly(sheet, headerMap, rowNumber, lead) {
  const updates = {
    "Lead Status": lead.leadStatus,
    "Submitted At": lead.submittedAt,
    "Source": lead.source,
    "Website": lead.website,
    "Main Service": lead.mainService,
    "Visibility Concern": lead.visibilityConcern,
    "Page URL": lead.pageUrl,
    "Referrer": lead.referrer,
    "Submission ID": lead.submissionId,
    "Payment ID": lead.paymentId,
    "Last Payment At": lead.lastPaymentAt,
    "Notes": lead.notes
  };

  Object.keys(updates).forEach(header => {
    if (header in headerMap) {
      sheet.getRange(rowNumber, headerMap[header] + 1).setValue(neutralizeSheetFormula(updates[header]));
    }
  });
}

function applyLeadStatusUpdate(payload) {
  const email = clean(payload.email).toLowerCase();
  if (!email || !isValidEmail(email)) throw new Error("Valid email is required for status update.");
  const ss = getPLGSpreadsheet();
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  const headerMap = getHeaderMap(sheet);
  const row = findLeadRowByEmail(sheet, headerMap, email);
  if (!row) throw new Error("Paid customer was not found in the lead database.");

  const updates = {
    "Lead Status": clean(payload.leadStatus || "Active Client"),
    "Status": clean(payload.status || "Active"),
    "Plan": clean(payload.plan),
    "Start Date": clean(payload.startDate || new Date().toISOString().slice(0, 10)),
    "Onboarding Step": Number(payload.onboardingStep) || 1,
    "Payment ID": clean(payload.paymentId || payload.payment_id),
    "Last Payment At": clean(payload.lastPaymentAt || payload.last_payment_at || new Date().toISOString()),
    "Source": clean(payload.source || "stripe-webhook")
  };
  Object.keys(updates).forEach(header => {
    if (header in headerMap) sheet.getRange(row, headerMap[header] + 1).setValue(neutralizeSheetFormula(updates[header]));
  });
  return { row, email };
}

function findLeadRowByEmail(sheet, headerMap, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !("Email" in headerMap)) return null;
  const values = sheet.getRange(2, headerMap["Email"] + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (clean(values[i][0]).toLowerCase() === email) return i + 2;
  }
  return null;
}

function neutralizeSheetFormula(value) {
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function setRowValue(row, headerMap, header, value) {
  if (header in headerMap) {
    row[headerMap[header]] = neutralizeSheetFormula(value);
  }
}

function getClientFromRow(row, headerMap, sheetRow) {
  return {
    firstName: clean(row[headerMap["First Name"]]),
    bizName: clean(row[headerMap["Business Name"]]),
    email: clean(row[headerMap["Email"]]).toLowerCase(),
    plan: clean(row[headerMap["Plan"]]),
    status: clean(row[headerMap["Status"]]).toLowerCase(),
    startDate: parseSheetDate(row[headerMap["Start Date"]]),
    onboardingStep: Number(row[headerMap["Onboarding Step"]]) || 0,
    sheetRow
  };
}

function shouldProcessClient(client) {
  if (client.status !== "active") return false;
  if (!client.firstName) return false;
  if (!client.bizName) return false;
  if (!client.email || !isValidEmail(client.email)) return false;
  if (!client.startDate) return false;
  return true;
}

function getNextOnboardingStep(currentStep, daysSinceStart) {
  if (currentStep < 1 && daysSinceStart >= 0) return 1;
  if (currentStep < 2 && daysSinceStart >= 2) return 2;
  if (currentStep < 3 && daysSinceStart >= 7) return 3;
  if (currentStep < 4 && daysSinceStart >= 30) return 4;
  return null;
}

function sendOnboardingEmail(step, client) {
  GmailApp.sendEmail(
    client.email,
    getOnboardingSubject(step, client),
    getOnboardingTemplate(step, client),
    {
      name: PLG_CONFIG.FROM_NAME,
      replyTo: PLG_CONFIG.FROM_EMAIL
    }
  );
}

function getOnboardingSubject(step, client) {
  const subjects = {
    1: `Welcome to Prime Local Growth, ${client.firstName}! (Action Required)`,
    2: `What we're working on for ${client.bizName} this week`,
    3: `Week 1 Check-in: ${client.bizName}`,
    4: `Month 1 Results: ${client.bizName} + Prime Local Growth`
  };

  return subjects[step] || subjects[1];
}

function getOnboardingTemplate(step, data) {
  const templates = {
    1: `Hi ${data.firstName},

Welcome to Prime Local Growth. We are excited to get started on improving the Google visibility for ${data.bizName}.

To begin, we need manager access to your Google Business Profile. Here is the access guide:
${PLG_CONFIG.ACCESS_GUIDE}

Once access is granted, we will begin the initial audit and optimization work.

Reply here if you run into any issues.

Best,

Adam Rome
Prime Local Growth
${PLG_CONFIG.WEBSITE}`,

    2: `Hi ${data.firstName},

Quick update on ${data.bizName}.

This week, we are focusing on your core Google profile structure, service/category alignment, and the visibility signals that help local customers find and trust your business.

Nothing is needed from you right now unless we reach out for a specific access item.

Best,

Adam Rome
Prime Local Growth`,

    3: `Hi ${data.firstName},

We are officially one week in.

The initial foundation is being put in place for ${data.bizName}. Over the next few weeks, the goal is to strengthen how your business appears across relevant local searches and customer trust points.

If you have questions about the work so far, reply here.

Best,

Adam Rome
Prime Local Growth`,

    4: `Hi ${data.firstName},

We are at the first 30-day mark for ${data.bizName}.

We are reviewing the first month of visibility activity and preparing the next set of priorities. I will send over the clearest takeaways so you can see what has changed and what we are focused on next.

Best,

Adam Rome
Prime Local Growth`
  };

  return templates[step] || templates[1];
}

function appendOnboardingLogs(ss, logRows) {
  const logSheet = getOrCreateSheet(ss, PLG_CONFIG.LOG_SHEET, [
    "Timestamp",
    "Email",
    "First Name",
    "Business Name",
    "Step",
    "Subject",
    "Status",
    "Error"
  ]);

  logSheet
    .getRange(logSheet.getLastRow() + 1, 1, logRows.length, logRows[0].length)
    .setValues(logRows);
}

function buildLogRow(client, step, status, error) {
  return [
    new Date(),
    client.email,
    client.firstName,
    client.bizName,
    step,
    getOnboardingSubject(step, client),
    status,
    error
  ];
}

function parseSheetDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (!value) return null;

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getDateOnly(date) {
  const cleanDateValue = new Date(date);
  cleanDateValue.setHours(0, 0, 0, 0);
  return cleanDateValue;
}

function clean(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
