/**
 * Prime Local Growth - Lead Intake + Client Onboarding (v2)
 *
 * Flow:
 * Website form -> Vercel /api/submit-form -> Apps Script Web App -> PLG Lead Database
 * Stripe webhook -> Vercel -> Apps Script (action: "update_status") -> client activated
 *
 * Status = Lead            -> prospect only
 * Status = Active + Start  -> paid client; scope-specific onboarding runs
 *
 * v2 upgrades:
 * - Duplicate-event protection (Event Log sheet + 10-min fingerprint cache)
 * - Stripe retries can no longer reset Start Date / Onboarding Step
 * - Welcome email fires instantly on activation (was silently skipped before)
 * - Scope-specific onboarding tracks: GBP, AI/GEO, Premium, Review Defense, Sprint
 * - Contact-form intake: spam honeypot, UTM/gclid capture, lead score,
 *   instant new-lead alert to Adam, instant auto-reply to the prospect
 * - Re-submissions merge instead of wiping manual notes/stage/owner
 * - Dedupe on email (not email + exact business name)
 * - Timezone-safe Start Date parsing (no more off-by-one day)
 */

const PLG_CONFIG = {
  SPREADSHEET_ID: "1VQUrCVsn97iGlO_lQoK_HHDQqneKDgPN7udZRJWRW-U",
  LEAD_SHEET: "PLG Lead Database",
  LOG_SHEET: "Onboarding Log",
  EVENT_SHEET: "Event Log",
  FROM_NAME: "Adam Rome",
  FROM_EMAIL: "adam@primelocalgrowth.com",
  PHONE: "210-646-1436",
  COMPANY: "Prime Local Growth",
  WEBSITE: "primelocalgrowth.com",
  ACCESS_GUIDE: "https://www.primelocalgrowth.com/gbp-access",
  BOOKING_LINK: "", // optional: paste a Calendly/Google booking link to use in emails
  DAILY_TRIGGER_HOUR: 8,
  SALES_DIGEST_HOUR: 7,
  SALES_DIGEST_ENABLED: false,
  SALES_OWNER: "Adam",
  NEW_LEAD_ALERT_ENABLED: false,  // website (Resend) already alerts Adam; true = also send scored alert
  LEAD_AUTOREPLY_ENABLED: false,  // website (Resend) already sends the prospect confirmation
  SEND_WELCOME_ON_ACTIVATION: true,
  DEDUPE_WINDOW_SECONDS: 600
};

const PLG_HEADERS = [
  "First Name", "Business Name", "Email", "Phone", "City", "Niche",
  "Lead Status", "Status", "Plan", "Start Date", "Onboarding Step",
  "Submitted At", "Source", "Website", "Main Service", "Visibility Concern",
  "Page URL", "Referrer", "Submission ID", "Payment ID", "Last Payment At",
  "Lead Stage", "Last Contact At", "Next Action At", "Expected MRR", "Owner", "Notes",
  // v2 columns (appended automatically, existing data untouched)
  "Onboarding Track", "Lead Score", "Submissions", "Timeline", "Budget",
  "Preferred Contact", "UTM Source", "UTM Medium", "UTM Campaign", "GCLID",
  "Nurture Step", "Last Nurture At", "Replied At"
];

const LOG_HEADERS = ["Timestamp", "Email", "First Name", "Business Name", "Step", "Subject", "Status", "Error"];
const EVENT_HEADERS = ["Received At", "Event ID", "Type", "Email", "Result"];

/* ======================= WEB APP ======================= */

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
    const action = clean(payload.action).toLowerCase();
    const ss = getPLGSpreadsheet();

    if (action === "update_status") {
      const eventId = getEventId(payload, "status");
      if (isDuplicateEvent(ss, eventId)) {
        return jsonResponse({ success: true, action: "update_status", duplicate: true });
      }
      const result = applyLeadStatusUpdate(payload);
      recordEvent(ss, eventId, "update_status", payload.email, JSON.stringify(result));
      return jsonResponse({ success: true, action: "update_status", result });
    }

    // Spam honeypot: hidden field real humans never fill. Pretend success.
    if (clean(payload.hp || payload._gotcha || payload.honeypot || payload.company_fax)) {
      return jsonResponse({ success: true });
    }

    const lead = normalizeLead(payload);
    const validationError = validateLead(lead);
    if (validationError) {
      return jsonResponse({ success: false, error: validationError });
    }

    const eventId = getEventId(payload, "lead", lead);
    if (isDuplicateEvent(ss, eventId)) {
      return jsonResponse({ success: true, duplicate: true });
    }

    const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
    const headerMap = getHeaderMap(sheet);
    const outcome = upsertLead(sheet, headerMap, lead);
    recordEvent(ss, eventId, "lead", lead.email, outcome.type + " row " + outcome.row);

    if (outcome.type !== "active-client") {
      safely_(() => sendNewLeadAlert(lead, outcome));
      if (outcome.type === "new") safely_(() => sendLeadAutoReply(lead));
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ======================= DUPLICATE-EVENT PROTECTION ======================= */

function getEventId(payload, type, lead) {
  const explicit = clean(
    payload.eventId || payload.event_id || payload.stripeEventId ||
    (type === "status" ? (payload.paymentId || payload.payment_id) : (payload.submissionId || payload.submission_id))
  );
  if (explicit) return type + ":" + explicit;

  // No ID supplied: fingerprint the request; blocks double-clicks / proxy retries.
  const basis = type === "status"
    ? [clean(payload.email).toLowerCase(), clean(payload.plan), clean(payload.status)].join("|")
    : [lead.email, lead.businessName.toLowerCase(), lead.phone, lead.notes].join("|");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, basis)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
  return type + ":fp:" + digest;
}

function isDuplicateEvent(ss, eventId) {
  if (!eventId) return false;
  const cache = CacheService.getScriptCache();
  if (cache.get(eventId)) return true;

  if (eventId.indexOf(":fp:") === -1) {
    const sheet = getOrCreateSheet(ss, PLG_CONFIG.EVENT_SHEET, EVENT_HEADERS);
    if (sheet.getLastRow() > 1) {
      const hit = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
        .createTextFinder(eventId).matchEntireCell(true).findNext();
      if (hit) return true;
    }
  }
  return false;
}

function recordEvent(ss, eventId, type, email, result) {
  if (!eventId) return;
  CacheService.getScriptCache().put(eventId, "1", PLG_CONFIG.DEDUPE_WINDOW_SECONDS);
  if (eventId.indexOf(":fp:") !== -1) return; // fingerprints only live in cache
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.EVENT_SHEET, EVENT_HEADERS);
  sheet.appendRow([new Date(), eventId, type, clean(email), String(result || "").slice(0, 500)]);
}

/* ======================= DAILY ONBOARDING ======================= */

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

    const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const today = getDateOnly(new Date());
    const stepCol = headerMap["Onboarding Step"] + 1;
    const logRows = [];
    let emailsSent = 0;

    rows.forEach((row, index) => {
      // Self-heal: rows set to Active by hand without a Start Date get activated here.
      if (clean(row[headerMap["Status"]]).toLowerCase() === "active" && !parseSheetDate(row[headerMap["Start Date"]])) {
        const res = activateClientRow_(ss, sheet, headerMap, index + 2, row);
        if (res.welcomeSent) { emailsSent++; return; }
      }
      const client = getClientFromRow(row, headerMap, index + 2);
      if (!shouldProcessClient(client)) return;

      const daysSinceStart = Math.floor((today - getDateOnly(client.startDate)) / 86400000);
      const nextStep = getNextOnboardingStep(client.track, client.onboardingStep, daysSinceStart);
      if (!nextStep) return;

      try {
        sendOnboardingEmail(nextStep, client);
        // Write per-row immediately so a mid-run failure can never resend.
        sheet.getRange(client.sheetRow, stepCol).setValue(nextStep);
        emailsSent++;
        logRows.push(buildLogRow(client, nextStep, "Sent", ""));
        Utilities.sleep(1000);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logRows.push(buildLogRow(client, nextStep, "Failed", message));
        console.error(`Failed onboarding step ${nextStep} for ${client.email}: ${message}`);
      }
    });

    if (logRows.length > 0) appendOnboardingLogs(ss, logRows);
    console.log(`Onboarding complete. Sent ${emailsSent} email(s).`);
  } finally {
    lock.releaseLock();
  }
}

/* ======================= SETUP ======================= */

function setupPLGSystem() {
  const ss = getPLGSpreadsheet();
  getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  getOrCreateSheet(ss, PLG_CONFIG.LOG_SHEET, LOG_HEADERS);
  getOrCreateSheet(ss, PLG_CONFIG.EVENT_SHEET, EVENT_HEADERS);
  setupOnboardingTrigger();
  setupSalesPipelineTrigger();
  setupEditTrigger();
  setupNurtureTrigger();
  formatLeadSheet();
  console.log("PLG lead intake and onboarding system setup complete.");
}

function setupOnboardingTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "runOnboardingSequence") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("runOnboardingSequence")
    .timeBased().atHour(PLG_CONFIG.DAILY_TRIGGER_HOUR).everyDays(1).create();
  console.log(`Onboarding trigger set for ${PLG_CONFIG.DAILY_TRIGGER_HOUR}:00 daily.`);
}

function setupSalesPipelineTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "sendSalesPipelineDigest") ScriptApp.deleteTrigger(trigger);
  });
  if (!PLG_CONFIG.SALES_DIGEST_ENABLED) {
    console.log("Sales pipeline digest disabled; no trigger created.");
    return;
  }
  ScriptApp.newTrigger("sendSalesPipelineDigest")
    .timeBased().atHour(PLG_CONFIG.SALES_DIGEST_HOUR).everyDays(1).create();
  console.log(`Sales digest trigger set for ${PLG_CONFIG.SALES_DIGEST_HOUR}:00 daily.`);
}

/** Run manually from the editor to verify everything is wired. Sends nothing. */
function healthCheck() {
  const ss = getPLGSpreadsheet();
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  getOrCreateSheet(ss, PLG_CONFIG.EVENT_SHEET, EVENT_HEADERS);
  const headerMap = getHeaderMap(sheet);
  const missing = PLG_HEADERS.filter(h => !(h in headerMap));
  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  const hasKey = !!PropertiesService.getScriptProperties().getProperty("WEBHOOK_KEY");
  const tz = Session.getScriptTimeZone();
  console.log(JSON.stringify({
    leadRows: Math.max(sheet.getLastRow() - 1, 0),
    missingHeaders: missing,
    triggers,
    webhookKeySet: hasKey,
    timeZone: tz,
    gmailQuotaRemaining: MailApp.getRemainingDailyQuota()
  }, null, 2));
  if (!hasKey) console.warn("WEBHOOK_KEY is not set: the web app accepts unauthenticated posts.");
}

/* ======================= SHEET HELPERS ======================= */

function getPLGSpreadsheet() {
  return SpreadsheetApp.openById(PLG_CONFIG.SPREADSHEET_ID);
}

function getOrCreateSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const existing = currentHeaders.map(h => String(h || "").trim());

  if (!existing.some(Boolean)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const missing = headers.filter(h => !existing.includes(h));
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  if (sheet.getFrozenRows() !== 1) sheet.setFrozenRows(1);
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (key && !(key in map)) map[key] = index;
  });
  return map;
}

function isWebhookAuthorized(e) {
  const expected = clean(PropertiesService.getScriptProperties().getProperty("WEBHOOK_KEY"));
  if (!expected) return true; // set WEBHOOK_KEY in Script Properties to lock this down
  const provided = clean(e && e.parameter && e.parameter.key);
  return provided === expected;
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return e.parameter || {}; // fall back to form-encoded posts
  }
}

/* ======================= LEAD INTAKE ======================= */

function normalizeLead(payload) {
  const name = clean(payload.name || payload.contactName);
  const firstName = clean(payload.firstName || name.split(/\s+/)[0]);
  const businessName = clean(payload.businessName || payload.business_name);
  const mainService = clean(payload.mainService || payload.main_service);
  const businessType = clean(payload.businessType || payload.business_type);
  const niche = clean(payload.niche || mainService || businessType || "local-service");
  const plan = clean(payload.plan || payload.interest || payload.package);

  const lead = {
    firstName,
    businessName,
    email: clean(payload.email).toLowerCase(),
    phone: clean(payload.phone),
    city: clean(payload.city),
    niche,
    leadStatus: clean(payload.leadStatus || "New Lead"),
    status: clean(payload.status || "Lead"),
    plan,
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
    leadStage: clean(payload.leadStage || payload.lead_stage || "New"),
    lastContactAt: clean(payload.lastContactAt || payload.last_contact_at),
    nextActionAt: clean(payload.nextActionAt || payload.next_action_at || defaultNextActionAt()),
    expectedMrr: Number(payload.expectedMrr || payload.expected_mrr) || expectedMrrForPlan(plan),
    owner: clean(payload.owner || PLG_CONFIG.SALES_OWNER),
    notes: clean(payload.notes || payload.situation || payload.message)
      .split("\n").filter(line => !/^\s*(\{\s*\}|\[\s*\])\s*$/.test(line)).join("\n").trim(),
    timeline: clean(payload.timeline),
    budget: clean(payload.budget),
    preferredContact: clean(payload.preferredContact || payload.preferred_contact),
    utmSource: clean(payload.utmSource || payload.utm_source),
    utmMedium: clean(payload.utmMedium || payload.utm_medium),
    utmCampaign: clean(payload.utmCampaign || payload.utm_campaign),
    gclid: clean(payload.gclid)
  };
  lead.leadScore = scoreLead(lead);
  return lead;
}

/** 0-100. Higher = call first. */
function scoreLead(lead) {
  let score = 20;
  if (lead.phone) score += 15;
  if (lead.website) score += 10;
  if (lead.city) score += 5;
  if (lead.notes.length > 40 || lead.visibilityConcern.length > 20) score += 10;
  if (/asap|now|immediate|this week|30/i.test(lead.timeline)) score += 20;
  else if (lead.timeline) score += 8;
  if (/\d/.test(lead.budget)) score += 10;
  if (/premium|elite|geo|ai/i.test(lead.plan)) score += 10;
  if (/gclid|cpc|ppc|paid/i.test(lead.utmMedium) || lead.gclid) score += 5;
  if (/gmail|yahoo|hotmail|outlook|aol|icloud/i.test(lead.email)) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function validateLead(lead) {
  if (!lead.email || !isValidEmail(lead.email)) return "Valid email is required.";
  if (!lead.businessName) return "Business name is required.";
  return "";
}

/**
 * Returns { type: "new" | "repeat" | "active-client", row }.
 * Repeat submissions MERGE: blank fields never erase data, manual sales fields
 * (Lead Stage, Owner, Next Action, Expected MRR) are preserved, notes are appended.
 */
function upsertLead(sheet, headerMap, lead) {
  const existingRow = findLeadRowByEmail(sheet, headerMap, lead.email);

  if (!existingRow) {
    sheet.appendRow(buildLeadRow(sheet, headerMap, lead));
    return { type: "new", row: sheet.getLastRow() };
  }

  const range = sheet.getRange(existingRow, 1, 1, sheet.getLastColumn());
  const row = range.getValues()[0];
  const get = h => (h in headerMap ? row[headerMap[h]] : "");
  const isActive = clean(get("Status")).toLowerCase() === "active";

  const mergeIfBlankOrNewer = {
    "First Name": lead.firstName, "Business Name": lead.businessName, "Phone": lead.phone,
    "City": lead.city, "Website": lead.website, "Main Service": lead.mainService,
    "Visibility Concern": lead.visibilityConcern, "Page URL": lead.pageUrl,
    "Referrer": lead.referrer, "Submission ID": lead.submissionId,
    "Submitted At": lead.submittedAt, "Timeline": lead.timeline, "Budget": lead.budget,
    "Preferred Contact": lead.preferredContact, "UTM Source": lead.utmSource,
    "UTM Medium": lead.utmMedium, "UTM Campaign": lead.utmCampaign, "GCLID": lead.gclid
  };
  Object.keys(mergeIfBlankOrNewer).forEach(h => {
    const v = mergeIfBlankOrNewer[h];
    if (v && h in headerMap) row[headerMap[h]] = neutralizeSheetFormula(v);
  });

  if ("Submissions" in headerMap) row[headerMap["Submissions"]] = (Number(get("Submissions")) || 1) + 1;
  if ("Lead Score" in headerMap) row[headerMap["Lead Score"]] = Math.max(Number(get("Lead Score")) || 0, lead.leadScore);

  if (lead.notes && "Notes" in headerMap) {
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const prior = clean(get("Notes"));
    if (prior.indexOf(lead.notes) === -1) {
      row[headerMap["Notes"]] = neutralizeSheetFormula(prior ? `${prior}\n[${stamp}] ${lead.notes}` : lead.notes);
    }
  }

  if (!isActive) {
    if ("Lead Status" in headerMap) row[headerMap["Lead Status"]] = "Re-engaged Lead";
    if ("Next Action At" in headerMap) row[headerMap["Next Action At"]] = defaultNextActionAt();
    if (lead.plan && "Plan" in headerMap) row[headerMap["Plan"]] = lead.plan;
  }

  range.setValues([row]);
  return { type: isActive ? "active-client" : "repeat", row: existingRow };
}

function buildLeadRow(sheet, headerMap, lead) {
  const row = new Array(sheet.getLastColumn()).fill("");
  const values = {
    "First Name": lead.firstName, "Business Name": lead.businessName, "Email": lead.email,
    "Phone": lead.phone, "City": lead.city, "Niche": lead.niche, "Lead Status": lead.leadStatus,
    "Status": lead.status, "Plan": lead.plan, "Start Date": lead.startDate,
    "Onboarding Step": lead.onboardingStep, "Submitted At": lead.submittedAt, "Source": lead.source,
    "Website": lead.website, "Main Service": lead.mainService, "Visibility Concern": lead.visibilityConcern,
    "Page URL": lead.pageUrl, "Referrer": lead.referrer, "Submission ID": lead.submissionId,
    "Payment ID": lead.paymentId, "Last Payment At": lead.lastPaymentAt, "Lead Stage": lead.leadStage,
    "Last Contact At": lead.lastContactAt, "Next Action At": lead.nextActionAt,
    "Expected MRR": lead.expectedMrr, "Owner": lead.owner, "Notes": lead.notes,
    "Lead Score": lead.leadScore, "Submissions": 1, "Timeline": lead.timeline, "Budget": lead.budget,
    "Preferred Contact": lead.preferredContact, "UTM Source": lead.utmSource,
    "UTM Medium": lead.utmMedium, "UTM Campaign": lead.utmCampaign, "GCLID": lead.gclid
  };
  Object.keys(values).forEach(h => setRowValue(row, headerMap, h, values[h]));
  return row;
}

/* ======================= CONTACT-PAGE RESPONSE ======================= */

function sendNewLeadAlert(lead, outcome) {
  if (!PLG_CONFIG.NEW_LEAD_ALERT_ENABLED) return;
  const label = outcome.type === "repeat" ? "REPEAT" : "NEW";
  const hot = lead.leadScore >= 60 ? "HOT " : "";
  const lines = [
    `${label} lead (score ${lead.leadScore}/100) - row ${outcome.row}`,
    "",
    `Name: ${lead.firstName}`,
    `Business: ${lead.businessName}`,
    `Phone: ${lead.phone || "-"}`,
    `Email: ${lead.email}`,
    `City: ${lead.city || "-"}`,
    `Website: ${lead.website || "-"}`,
    `Service: ${lead.mainService || lead.niche}`,
    `Interested in: ${lead.plan || "-"}`,
    `Timeline: ${lead.timeline || "-"} | Budget: ${lead.budget || "-"}`,
    `Preferred contact: ${lead.preferredContact || "-"}`,
    `Concern: ${lead.visibilityConcern || "-"}`,
    `Message: ${lead.notes || "-"}`,
    "",
    `Source: ${lead.source} | UTM: ${[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ") || "-"}`,
    `Page: ${lead.pageUrl || "-"}`,
    "",
    "Speed to lead: call within 5 minutes if you can."
  ];
  MailApp.sendEmail({
    to: PLG_CONFIG.FROM_EMAIL,
    replyTo: lead.email,
    subject: `${hot}${label} PLG lead: ${lead.businessName}${lead.city ? " (" + lead.city + ")" : ""}`,
    body: lines.join("\n"),
    name: "PLG Lead Alert"
  });
}

function sendLeadAutoReply(lead) {
  if (!PLG_CONFIG.LEAD_AUTOREPLY_ENABLED) return;
  const booking = PLG_CONFIG.BOOKING_LINK
    ? `If it's easier, grab a time that works for you here: ${PLG_CONFIG.BOOKING_LINK}\n\n`
    : "";
  const body = `Hi ${lead.firstName || "there"},

Thanks for reaching out about ${lead.businessName}. I got your request and I'm personally reviewing how ${lead.businessName} shows up on Google${lead.city ? " in " + lead.city : ""} right now.

You'll hear from me within one business day with what I find, usually sooner.

${booking}If anything is urgent, call or text me directly at ${PLG_CONFIG.PHONE}.

Best,
Adam Rome
${PLG_CONFIG.COMPANY}
${PLG_CONFIG.WEBSITE}`;

  GmailApp.sendEmail(lead.email, `Got it, ${lead.firstName || "thanks"} - next steps for ${lead.businessName}`, body, {
    name: PLG_CONFIG.FROM_NAME,
    replyTo: PLG_CONFIG.FROM_EMAIL
  });
}

/* ======================= STRIPE / STATUS UPDATES ======================= */

function applyLeadStatusUpdate(payload) {
  const email = clean(payload.email).toLowerCase();
  if (!email || !isValidEmail(email)) throw new Error("Valid email is required for status update.");

  const ss = getPLGSpreadsheet();
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  const headerMap = getHeaderMap(sheet);
  let row = findLeadRowByEmail(sheet, headerMap, email);

  // Paid without a prior form fill: create the client row instead of failing the webhook.
  if (!row) {
    const lead = normalizeLead(Object.assign({}, payload, {
      businessName: payload.businessName || payload.business_name || payload.name || email,
      source: payload.source || "stripe-webhook"
    }));
    lead.leadScore = 100;
    sheet.appendRow(buildLeadRow(sheet, headerMap, lead));
    row = sheet.getLastRow();
  }

  const current = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cur = h => (h in headerMap ? current[headerMap[h]] : "");
  const wasActive = clean(cur("Status")).toLowerCase() === "active";
  const plan = clean(payload.plan) || clean(cur("Plan"));
  const newStatus = clean(payload.status || "Active");

  const updates = {
    "Lead Status": clean(payload.leadStatus || "Active Client"),
    "Status": newStatus,
    "Plan": plan,
    "Payment ID": clean(payload.paymentId || payload.payment_id),
    "Last Payment At": clean(payload.lastPaymentAt || payload.last_payment_at || new Date().toISOString()),
    "Lead Stage": "Won",
    "Next Action At": "",
    "Expected MRR": expectedMrrForPlan(plan),
    "Owner": clean(payload.owner || cur("Owner") || PLG_CONFIG.SALES_OWNER),
    "Onboarding Track": getOnboardingTrack(plan)
  };

  // Only a NEW activation sets Start Date / step. Renewals & retries never reset onboarding.
  const isNewActivation = !wasActive && newStatus.toLowerCase() === "active";
  if (isNewActivation) {
    updates["Start Date"] = clean(payload.startDate) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    updates["Onboarding Step"] = Number(payload.onboardingStep) || 0;
  }
  if (!wasActive) updates["Source"] = clean(payload.source || cur("Source") || "stripe-webhook");

  Object.keys(updates).forEach(h => {
    if (h in headerMap && (updates[h] !== "" || h === "Next Action At")) {
      sheet.getRange(row, headerMap[h] + 1).setValue(neutralizeSheetFormula(updates[h]));
    }
  });

  let welcomeSent = false;
  if (isNewActivation && PLG_CONFIG.SEND_WELCOME_ON_ACTIVATION && !updates["Onboarding Step"]) {
    SpreadsheetApp.flush();
    const fresh = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const client = getClientFromRow(fresh, headerMap, row);
    if (shouldProcessClient(client)) {
      try {
        sendOnboardingEmail(1, client);
        sheet.getRange(row, headerMap["Onboarding Step"] + 1).setValue(1);
        appendOnboardingLogs(ss, [buildLogRow(client, 1, "Sent", "")]);
        welcomeSent = true;
      } catch (err) {
        // Daily sequence will retry step 1 tomorrow morning.
        appendOnboardingLogs(ss, [buildLogRow(client, 1, "Failed", String(err && err.message || err))]);
      }
    }
  }

  return { row, email, newActivation: isNewActivation, welcomeSent };
}

/* ======================= SALES DIGEST (disabled by config) ======================= */

function sendSalesPipelineDigest() {
  if (!PLG_CONFIG.SALES_DIGEST_ENABLED) {
    console.log("Sales pipeline digest disabled; skipping email.");
    return;
  }
  const ss = getPLGSpreadsheet();
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  const headerMap = getHeaderMap(sheet);
  if (sheet.getLastRow() < 2) return;

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const open = rows.map((row, index) => ({
    row: index + 2,
    firstName: clean(row[headerMap["First Name"]]),
    businessName: clean(row[headerMap["Business Name"]]),
    email: clean(row[headerMap["Email"]]),
    phone: clean(row[headerMap["Phone"]]),
    status: clean(row[headerMap["Status"]]).toLowerCase(),
    stage: clean(row[headerMap["Lead Stage"]]) || "New",
    score: Number(row[headerMap["Lead Score"]]) || 0,
    nextActionAt: parseSheetDate(row[headerMap["Next Action At"]]),
    expectedMrr: Number(row[headerMap["Expected MRR"]]) || 0
  })).filter(lead => {
    if (!lead.email || ["active", "closed", "lost"].includes(lead.status)) return false;
    return !lead.nextActionAt || lead.nextActionAt <= endOfToday;
  });
  if (!open.length) return;

  open.sort((a, b) => (b.score - a.score) ||
    ((a.nextActionAt ? a.nextActionAt.getTime() : 0) - (b.nextActionAt ? b.nextActionAt.getTime() : 0)));

  const td = 'style="padding:10px;border-bottom:1px solid #e5e7eb"';
  const items = open.slice(0, 25).map(lead => {
    const due = lead.nextActionAt
      ? Utilities.formatDate(lead.nextActionAt, Session.getScriptTimeZone(), "MMM d")
      : "Set next action";
    const name = lead.businessName || lead.firstName || lead.email;
    return `<tr><td ${td}><strong>${escapeHtml_(name)}</strong><br><span style="color:#64748b">${escapeHtml_(lead.stage)} · score ${lead.score}</span></td>` +
      `<td ${td}>${escapeHtml_(due)}</td>` +
      `<td ${td}>${lead.expectedMrr ? "$" + lead.expectedMrr + "/mo" : "-"}</td>` +
      `<td ${td}><a href="mailto:${encodeURIComponent(lead.email)}">Email</a>` +
      (lead.phone ? ` &middot; <a href="tel:${escapeHtml_(lead.phone)}">Call</a>` : "") + `</td></tr>`;
  }).join("");

  MailApp.sendEmail({
    to: PLG_CONFIG.FROM_EMAIL,
    subject: `PLG sales queue: ${open.length} action${open.length === 1 ? "" : "s"} due`,
    body: `${open.length} PLG leads need a next action today. Open the PLG Lead Database to update stage, last contact, and next action.`,
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:760px"><h2>Today's PLG sales queue</h2><p>${open.length} open lead${open.length === 1 ? "" : "s"} need attention, highest score first.</p><table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Lead</th><th align="left">Due</th><th align="left">Potential</th><th align="left">Action</th></tr></thead><tbody>${items}</tbody></table></div>`,
    name: PLG_CONFIG.COMPANY
  });
}

function defaultNextActionAt() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function expectedMrrForPlan(plan) {
  const value = clean(plan).toLowerCase();
  if (/sprint|one.?time/.test(value)) return 0;
  if (/premium|elite/.test(value)) return 1497;
  if (/geo|ai visibility/.test(value)) return 997;
  if (/review defense/.test(value)) return 297;
  return 497;
}

/* ======================= SCOPE-SPECIFIC ONBOARDING ======================= */

/** Maps a plan name to an onboarding track. */
function getOnboardingTrack(plan) {
  const value = clean(plan).toLowerCase();
  if (/sprint|one.?time|audit/.test(value)) return "sprint";
  if (/premium|elite|domination/.test(value)) return "premium";
  if (/geo|ai visibility|\bai\b/.test(value)) return "geo";
  if (/review/.test(value)) return "reviews";
  return "gbp";
}

/** Day offsets per step, per track. Step N sends on/after day schedule[N-1]. */
const ONBOARDING_SCHEDULES = {
  gbp:     [0, 2, 7, 30],
  geo:     [0, 3, 10, 30],
  premium: [0, 2, 7, 14, 30],
  reviews: [0, 3, 14, 30],
  sprint:  [0, 3, 10, 21]
};

function getNextOnboardingStep(track, currentStep, daysSinceStart) {
  const schedule = ONBOARDING_SCHEDULES[track] || ONBOARDING_SCHEDULES.gbp;
  const next = (Number(currentStep) || 0) + 1;
  if (next > schedule.length) return null;
  return daysSinceStart >= schedule[next - 1] ? next : null;
}

function sendOnboardingEmail(step, client) {
  const content = getOnboardingContent(step, client);
  GmailApp.sendEmail(client.email, content.subject, content.body, {
    name: PLG_CONFIG.FROM_NAME,
    replyTo: PLG_CONFIG.FROM_EMAIL
  });
}

function getOnboardingSubject(step, client) {
  return getOnboardingContent(step, client).subject;
}

function getOnboardingContent(step, c) {
  const sig = `\n\nBest,\nAdam Rome\n${PLG_CONFIG.COMPANY}\n${PLG_CONFIG.WEBSITE} | ${PLG_CONFIG.PHONE}`;
  const book = PLG_CONFIG.BOOKING_LINK
    ? `Book your kickoff call here: ${PLG_CONFIG.BOOKING_LINK}`
    : `Reply with two or three times that work for a 20-minute kickoff call this week.`;
  const gbpAccess = `Add ${PLG_CONFIG.FROM_EMAIL} as a Manager on your Google Business Profile. Step-by-step guide:\n${PLG_CONFIG.ACCESS_GUIDE}`;

  const tracks = {
    gbp: [
      [`Welcome to Prime Local Growth, ${c.firstName}! (Action Required)`,
        `Hi ${c.firstName},\n\nWelcome to Prime Local Growth. We're excited to start improving Google visibility for ${c.bizName}.\n\nOne thing needed from you to begin:\n${gbpAccess}\n\nOnce access is granted, we start the initial audit and optimization work.\n\nReply here if you run into any issues.`],
      [`What we're working on for ${c.bizName} this week`,
        `Hi ${c.firstName},\n\nQuick update on ${c.bizName}.\n\nThis week we're focused on your core Google profile structure, service and category alignment, and the visibility signals that help local customers find and trust you.\n\nNothing is needed from you right now unless we reach out for a specific access item.`],
      [`Week 1 check-in: ${c.bizName}`,
        `Hi ${c.firstName},\n\nWe're officially one week in.\n\nThe foundation is in place for ${c.bizName}. Over the next few weeks the goal is to strengthen how you appear across relevant local searches and customer trust points.\n\nOne quick win you can help with: send us 5-10 recent photos of your work, team, or location. Fresh photos are a ranking and conversion signal.`],
      [`Month 1 results: ${c.bizName} + Prime Local Growth`,
        `Hi ${c.firstName},\n\nWe're at the 30-day mark for ${c.bizName}.\n\nWe're reviewing the first month of visibility activity (calls, direction requests, profile views, and ranking movement) and preparing next month's priorities. I'll send the clearest takeaways so you can see what changed and what we're focused on next.`]
    ],

    geo: [
      [`Welcome to AI Visibility, ${c.firstName}! (2 quick items)`,
        `Hi ${c.firstName},\n\nWelcome aboard. Our goal is to make ${c.bizName} the business that Google, ChatGPT, Gemini, and Perplexity recommend when people in your area ask for ${c.client_service || "what you do"}.\n\nTwo things needed to start:\n1) ${gbpAccess}\n2) Website access: reply with your website platform (WordPress, Wix, Squarespace, etc.) and either add ${PLG_CONFIG.FROM_EMAIL} as an editor or tell me who manages it.\n\nAs soon as we have access, we capture your AI visibility baseline.`],
      [`Your AI visibility baseline is underway`,
        `Hi ${c.firstName},\n\nWe're running ${c.bizName} through the questions real customers ask AI assistants and Google, and recording where you show up, where competitors show up instead, and what sources the AI is pulling from.\n\nThat baseline drives everything we fix next: business facts, service pages, structured data, and citations.`],
      [`Entity + citation work in progress for ${c.bizName}`,
        `Hi ${c.firstName},\n\nWe're now aligning your business facts across the sources AI systems trust (Google profile, website schema, directories, and review platforms) so they describe ${c.bizName} consistently.\n\nOne thing that helps a lot: reply with your top 3 services and the 3-5 neighborhoods or cities you most want to win.`],
      [`30-day AI visibility report: ${c.bizName}`,
        `Hi ${c.firstName},\n\nWe've hit 30 days. I'm re-running the baseline questions to compare where ${c.bizName} appears now versus day one across Google and AI assistants, and I'll send the side-by-side plus next month's priorities.`]
    ],

    premium: [
      [`Welcome to Premium, ${c.firstName} - let's schedule your kickoff`,
        `Hi ${c.firstName},\n\nWelcome to Prime Local Growth Premium. ${c.bizName} gets our full local visibility, AI visibility, and reputation system.\n\nTo start fast:\n1) ${book}\n2) ${gbpAccess}\n3) Website access: add ${PLG_CONFIG.FROM_EMAIL} as an editor, or tell me who manages your site.\n4) Optional but valuable: grant read access to Google Search Console and Google Analytics.\n\nOnce we have access, the full audit begins immediately.`],
      [`Your 90-day roadmap for ${c.bizName}`,
        `Hi ${c.firstName},\n\nYour audit is in progress and I'm building the 90-day roadmap: Google profile, website conversion, AI visibility, citations, and reviews, sequenced by what moves revenue fastest.\n\nYou'll get the roadmap on our kickoff call or by email this week.`],
      [`Week 1 check-in: ${c.bizName}`,
        `Hi ${c.firstName},\n\nOne week in. Foundation work is live across your profile and site.\n\nTo keep momentum: send 5-10 recent photos and a short list of your best recent customers (we'll use it to request reviews). Reply here with anything you want prioritized.`],
      [`Mid-month update: ${c.bizName}`,
        `Hi ${c.firstName},\n\nWe're two weeks in. Citations, review requests, and content are rolling out, and early ranking movement typically starts showing between weeks 2 and 6.\n\nIf you've noticed more calls or customers mentioning Google or AI, tell me. That's useful signal.`],
      [`Month 1 results: ${c.bizName} + Prime Local Growth`,
        `Hi ${c.firstName},\n\n30 days complete. I'm putting together your results report (calls, directions, rankings, AI visibility, and reviews) along with month two priorities. ${PLG_CONFIG.BOOKING_LINK ? "Grab a time to review it together: " + PLG_CONFIG.BOOKING_LINK : "Reply with a good time to walk through it together."}`]
    ],

    reviews: [
      [`Welcome to Review Defense, ${c.firstName}! (Action Required)`,
        `Hi ${c.firstName},\n\nWelcome aboard. We'll protect and grow ${c.bizName}'s reputation: more 5-star reviews and professional responses to every review.\n\nTo start:\n1) ${gbpAccess}\n2) Reply with a list of recent happy customers (name + email or mobile) so we can launch review requests.`],
      [`Your review request system is live`,
        `Hi ${c.firstName},\n\nReview requests for ${c.bizName} are going out, and we're now monitoring and responding to new reviews.\n\nIf you get a negative review, don't reply to it yourself. Forward it to me and we'll handle it.`],
      [`Two-week reputation report: ${c.bizName}`,
        `Hi ${c.firstName},\n\nTwo weeks in. I'm tallying new reviews, average rating movement, and response coverage. Keep sending names of happy customers after each job. That's the single biggest lever.`],
      [`Month 1 reputation results: ${c.bizName}`,
        `Hi ${c.firstName},\n\n30 days complete. I'll send your before-and-after review count, rating, and response rate, plus what we're focused on next month.`]
    ],

    sprint: [
      [`Your visibility sprint starts now, ${c.firstName} (Action Required)`,
        `Hi ${c.firstName},\n\nThanks for booking the sprint for ${c.bizName}. This is a focused, one-time engagement with a clear deliverable.\n\nTo start:\n${gbpAccess}\n\nAlso reply with your website URL and the top 3 services you want to be found for.`],
      [`Sprint audit in progress: ${c.bizName}`,
        `Hi ${c.firstName},\n\nYour audit is underway: Google profile, website, citations, reviews, and how you stack up against your top local competitors. Fixes start as soon as the audit is done.`],
      [`Your sprint deliverable is almost ready`,
        `Hi ${c.firstName},\n\nWe're wrapping up the work for ${c.bizName}. You'll receive a summary of what was fixed, what it means, and the highest-value next steps.`],
      [`Sprint complete: what's next for ${c.bizName}`,
        `Hi ${c.firstName},\n\nYour sprint is complete. The foundation we put in place compounds when it's maintained: fresh posts, review growth, and ongoing optimization.\n\nIf you want us to keep the momentum going on a monthly plan, reply "keep going" and I'll send options.`]
    ]
  };

  const list = tracks[c.track] || tracks.gbp;
  const pair = list[Math.min(Math.max(step, 1), list.length) - 1];
  return { subject: pair[0], body: pair[1] + sig };
}

/* ======================= LOGGING / UTILS ======================= */

function findLeadRowByEmail(sheet, headerMap, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !("Email" in headerMap)) return null;
  const values = sheet.getRange(2, headerMap["Email"] + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (clean(values[i][0]).toLowerCase() === email) return i + 2;
  }
  return null;
}

function escapeHtml_(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function neutralizeSheetFormula(value) {
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function setRowValue(row, headerMap, header, value) {
  if (header in headerMap) row[headerMap[header]] = neutralizeSheetFormula(value);
}

function getClientFromRow(row, headerMap, sheetRow) {
  const get = h => (h in headerMap ? row[headerMap[h]] : "");
  const plan = clean(get("Plan"));
  return {
    firstName: clean(get("First Name")),
    bizName: clean(get("Business Name")),
    email: clean(get("Email")).toLowerCase(),
    plan,
    track: clean(get("Onboarding Track")) || getOnboardingTrack(plan),
    client_service: clean(get("Main Service")),
    status: clean(get("Status")).toLowerCase(),
    startDate: parseSheetDate(get("Start Date")),
    onboardingStep: Number(get("Onboarding Step")) || 0,
    sheetRow
  };
}

function shouldProcessClient(client) {
  if (client.status !== "active") return false;
  if (!client.firstName || !client.bizName) return false;
  if (!client.email || !isValidEmail(client.email)) return false;
  if (!client.startDate) return false;
  return true;
}

function appendOnboardingLogs(ss, logRows) {
  const logSheet = getOrCreateSheet(ss, PLG_CONFIG.LOG_SHEET, LOG_HEADERS);
  logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
}

function buildLogRow(client, step, status, error) {
  return [new Date(), client.email, client.firstName, client.bizName,
    `${client.track}:${step}`, getOnboardingSubject(step, client), status, error];
}

/** Timezone-safe: "2026-10-04" is treated as local midnight, not UTC. */
function parseSheetDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getDateOnly(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function safely_(fn) {
  try { fn(); } catch (err) { console.error(err && err.message ? err.message : err); }
}

function clean(value) {
  if (value == null) return "";
  if (typeof value === "object" && !(value instanceof Date)) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(", ");
    return Object.keys(value).map(k => (clean(value[k]) ? `${k}: ${clean(value[k])}` : ""))
      .filter(Boolean).join("; ");
  }
  const s = String(value).trim();
  return /^(\{\s*\}|\[\s*\]|null|undefined)$/.test(s) ? "" : s;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= MANUAL ACTIVATION (no Stripe needed) ======================= */

/** Installable onEdit trigger on the lead spreadsheet. Fires only on human edits. */
function setupEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "onLeadSheetEdit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onLeadSheetEdit").forSpreadsheet(PLG_CONFIG.SPREADSHEET_ID).onEdit().create();
  console.log("Edit trigger installed: set Status = Active to onboard a client instantly.");
}

/**
 * Set a row's Status to "Active" in the sheet -> Start Date, track, MRR and stage
 * fill in automatically and the plan-specific welcome email sends within seconds.
 */
function onLeadSheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  console.log(`Edit: ${sheet.getName()}!${e.range.getA1Notation()} old=${e.oldValue} new=${e.value}`);
  if (sheet.getName() !== PLG_CONFIG.LEAD_SHEET || e.range.getRow() < 2) return;

  const headerMap = getHeaderMap(sheet);
  const statusCol = headerMap["Status"] + 1;
  const firstCol = e.range.getColumn();
  const lastCol = firstCol + e.range.getNumColumns() - 1;
  if (statusCol < firstCol || statusCol > lastCol) return;
  if (e.range.getNumRows() === 1 && clean(e.oldValue).toLowerCase() === "active") return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const ss = sheet.getParent();
    const startRow = e.range.getRow();
    const rows = sheet.getRange(startRow, 1, e.range.getNumRows(), sheet.getLastColumn()).getValues();
    rows.forEach((row, i) => {
      if (clean(row[headerMap["Status"]]).toLowerCase() !== "active") return;
      console.log(JSON.stringify(activateClientRow_(ss, sheet, headerMap, startRow + i, row)));
    });
  } finally {
    lock.releaseLock();
  }
}

function activateClientRow_(ss, sheet, headerMap, rowNum, row) {
  const get = h => (h in headerMap ? row[headerMap[h]] : "");
  const already = parseSheetDate(get("Start Date")) && (Number(get("Onboarding Step")) || 0) > 0;
  if (already) return { rowNum, skipped: "already onboarding" };

  const plan = clean(get("Plan"));
  const tz = Session.getScriptTimeZone();
  const set = (h, v) => { if (h in headerMap) row[headerMap[h]] = v; };
  if (!parseSheetDate(get("Start Date"))) set("Start Date", Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  set("Onboarding Step", Number(get("Onboarding Step")) || 0);
  set("Onboarding Track", getOnboardingTrack(plan));
  set("Expected MRR", expectedMrrForPlan(plan));
  set("Lead Stage", "Won");
  set("Lead Status", "Active Client");
  set("Next Action At", "");
  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);

  if (!PLG_CONFIG.SEND_WELCOME_ON_ACTIVATION) return { rowNum, welcomeSent: false };
  const client = getClientFromRow(row, headerMap, rowNum);
  if (!shouldProcessClient(client) || client.onboardingStep > 0) return { rowNum, welcomeSent: false };
  try {
    sendOnboardingEmail(1, client);
    sheet.getRange(rowNum, headerMap["Onboarding Step"] + 1).setValue(1);
    appendOnboardingLogs(ss, [buildLogRow(client, 1, "Sent", "manual activation")]);
    return { rowNum, welcomeSent: true };
  } catch (err) {
    appendOnboardingLogs(ss, [buildLogRow(client, 1, "Failed", String(err && err.message || err))]);
    return { rowNum, welcomeSent: false };
  }
}

/* ======================= SHEET UX ======================= */

/** Dropdowns + score highlighting so manual pipeline work is fast and typo-proof. */
function formatLeadSheet() {
  const ss = getPLGSpreadsheet();
  const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
  const headerMap = getHeaderMap(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const col = h => sheet.getRange(2, headerMap[h] + 1, rows, 1);
  const list = (h, values) => {
    if (!(h in headerMap)) return;
    col(h).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true).setAllowInvalid(true).build());
  };
  list("Status", ["Lead", "Active", "Paused", "Closed", "Lost"]);
  list("Plan", ["Local Visibility", "AI Visibility (GEO)", "Premium", "Review Defense", "Visibility Sprint"]);
  list("Lead Stage", ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost", "Research Queue"]);

  if ("Lead Score" in headerMap) {
    const range = col("Lead Score");
    const keep = sheet.getConditionalFormatRules().filter(r =>
      !r.getRanges().some(x => x.getColumn() === range.getColumn()));
    keep.push(
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(60)
        .setBackground("#c6efce").setFontColor("#006100").setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(40, 59)
        .setBackground("#ffeb9c").setFontColor("#7f6000").setRanges([range]).build()
    );
    sheet.setConditionalFormatRules(keep);
  }
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight("bold");
  sheet.setFrozenRows(1);
  console.log("Lead sheet formatted: dropdowns + score colors applied.");
}

/* ======================= SELF TEST (sends nothing) ======================= */

function runSelfTest() {
  const results = [];
  const ok = (name, cond) => results.push((cond ? "PASS " : "FAIL ") + name);
  ok("gbp step 1 day 0", getNextOnboardingStep("gbp", 0, 0) === 1);
  ok("gbp waits for day 2", getNextOnboardingStep("gbp", 1, 1) === null);
  ok("gbp ends after 4", getNextOnboardingStep("gbp", 4, 99) === null);
  ok("premium has 5 steps", getNextOnboardingStep("premium", 4, 30) === 5);
  ok("track premium", getOnboardingTrack("Premium") === "premium");
  ok("track geo", getOnboardingTrack("AI Visibility (GEO)") === "geo");
  ok("track reviews", getOnboardingTrack("Review Defense") === "reviews");
  ok("track sprint", getOnboardingTrack("Visibility Sprint") === "sprint");
  ok("track default", getOnboardingTrack("") === "gbp");
  ok("date local", parseSheetDate("2026-10-04").getDate() === 4);
  ok("clean empty object", clean({}) === "");
  ok("clean object", clean({ a: "x", b: "" }) === "a: x");
  ok("clean {} string", clean("{}") === "");
  ok("notes strip {}", normalizeLead({ email: "a@b.co", businessName: "B", notes: "Need calls\n{}" }).notes === "Need calls");
  ok("formula neutralized", neutralizeSheetFormula("=HYPERLINK()") === "'=HYPERLINK()");
  const id1 = getEventId({}, "lead", { email: "a@b.co", businessName: "X", phone: "", notes: "" });
  const id2 = getEventId({}, "lead", { email: "a@b.co", businessName: "x", phone: "", notes: "" });
  ok("fingerprint stable", id1 === id2);
  ok("explicit id wins", getEventId({ submissionId: "abc" }, "lead", {}) === "lead:abc");
  ["gbp", "geo", "premium", "reviews", "sprint"].forEach(t =>
    ONBOARDING_SCHEDULES[t].forEach((_, i) => {
      const c = getOnboardingContent(i + 1, { firstName: "A", bizName: "B", track: t });
      ok(`template ${t}:${i + 1}`, c.subject && c.body.indexOf("undefined") === -1);
    }));
  ok("nurture day 2", getNextNurtureStep(0, 2) === 1);
  ok("nurture waits", getNextNurtureStep(1, 4) === null);
  ok("nurture ends", getNextNurtureStep(4, 99) === null);
  ok("old lead skipped", !isNurtureEligible_({ status: "lead", stage: "new", email: "a@b.co", source: "Website", submittedAt: new Date(2020, 0, 1) }, new Date()));
  ok("research lead skipped", !isNurtureEligible_({ status: "lead", stage: "research queue", email: "a@b.co", source: "Website", submittedAt: new Date() }, new Date()));
  ok("fresh lead eligible", isNurtureEligible_({ status: "lead", stage: "new", email: "a@b.co", source: "Website", submittedAt: new Date() }, new Date()));
  [1, 2, 3, 4].forEach(s => ok(`nurture template ${s}`, getNurtureContent(s, { firstName: "A", businessName: "B", city: "" }).body.indexOf("undefined") === -1));
  const failed = results.filter(r => r.startsWith("FAIL"));
  console.log(results.join("\n"));
  console.log(failed.length ? `${failed.length} FAILED` : `All ${results.length} tests passed.`);
  return failed.length === 0;
}

/* ======================= LEAD NURTURE + REPLY DETECTION ======================= */
/*
 * Runs hourly. For every website lead still in Status = Lead:
 *  1. If the lead has replied in Gmail -> stop the sequence, mark "Replied",
 *     and alert Adam immediately.
 *  2. Otherwise send the next follow-up when due (business hours only).
 * Leads older than NURTURE_MAX_AGE_DAYS, closed, research-only, or worked
 * manually (Lead Stage moved past "New") are never emailed.
 */

const NURTURE = {
  DAYS: [2, 5, 10, 21],             // days after submission for follow-ups 1-4
  MAX_AGE_DAYS: 30,
  SEND_HOURS: [8, 18],              // local send window
  SEND_DAYS: [1, 2, 3, 4, 5, 6],    // Mon-Sat
  ACTIVE_STAGES: ["", "new", "contacted"]
};

function setupNurtureTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runLeadNurture") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runLeadNurture").timeBased().everyHours(1).create();
  console.log("Lead nurture + reply detection trigger set: hourly.");
}

function getNextNurtureStep(currentStep, daysSinceSubmit) {
  const next = (Number(currentStep) || 0) + 1;
  if (next > NURTURE.DAYS.length) return null;
  return daysSinceSubmit >= NURTURE.DAYS[next - 1] ? next : null;
}

function isNurtureEligible_(lead, now) {
  if (lead.status !== "lead") return false;
  if (!NURTURE.ACTIVE_STAGES.includes(lead.stage)) return false;
  if (!lead.email || !isValidEmail(lead.email) || lead.repliedAt) return false;
  if (!lead.submittedAt || !/website/i.test(lead.source)) return false;
  return (now - lead.submittedAt) / 86400000 <= NURTURE.MAX_AGE_DAYS;
}

function runLeadNurture() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = getPLGSpreadsheet();
    const sheet = getOrCreateSheet(ss, PLG_CONFIG.LEAD_SHEET, PLG_HEADERS);
    const headerMap = getHeaderMap(sheet);
    if (sheet.getLastRow() < 2) return;

    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const hour = Number(Utilities.formatDate(now, tz, "H"));
    const dow = Number(Utilities.formatDate(now, tz, "u")) % 7; // 1=Mon..6=Sat, 0=Sun
    const inWindow = hour >= NURTURE.SEND_HOURS[0] && hour < NURTURE.SEND_HOURS[1] && NURTURE.SEND_DAYS.includes(dow);
    const col = h => headerMap[h] + 1;
    let sent = 0, replies = 0;

    rows.forEach((row, i) => {
      const get = h => (h in headerMap ? row[headerMap[h]] : "");
      const rowNum = i + 2;
      const lead = {
        firstName: clean(get("First Name")),
        businessName: clean(get("Business Name")),
        email: clean(get("Email")).toLowerCase(),
        phone: clean(get("Phone")),
        city: clean(get("City")),
        status: clean(get("Status")).toLowerCase(),
        stage: clean(get("Lead Stage")).toLowerCase(),
        source: clean(get("Source")),
        score: Number(get("Lead Score")) || 0,
        submittedAt: parseSheetDate(get("Submitted At")),
        nurtureStep: Number(get("Nurture Step")) || 0,
        repliedAt: clean(get("Replied At"))
      };
      if (!isNurtureEligible_(lead, now)) return;

      // 1) Reply detection (any inbound mail from the lead since they submitted).
      const after = Utilities.formatDate(lead.submittedAt, tz, "yyyy/MM/dd");
      const threads = GmailApp.search(`from:${lead.email} after:${after}`, 0, 1);
      if (threads.length) {
        sheet.getRange(rowNum, col("Replied At")).setValue(now);
        sheet.getRange(rowNum, col("Lead Stage")).setValue("Replied");
        sheet.getRange(rowNum, col("Next Action At")).setValue(now.toISOString());
        safely_(() => sendReplyAlert_(lead, rowNum, threads[0]));
        replies++;
        return;
      }

      // 2) Next follow-up, if due and inside business hours.
      if (!inWindow) return;
      const days = Math.floor((getDateOnly(now) - getDateOnly(lead.submittedAt)) / 86400000);
      const step = getNextNurtureStep(lead.nurtureStep, days);
      if (!step) return;
      try {
        const msg = getNurtureContent(step, lead);
        GmailApp.sendEmail(lead.email, msg.subject, msg.body, { name: PLG_CONFIG.FROM_NAME, replyTo: PLG_CONFIG.FROM_EMAIL });
        sheet.getRange(rowNum, col("Nurture Step")).setValue(step);
        sheet.getRange(rowNum, col("Last Nurture At")).setValue(now);
        sheet.getRange(rowNum, col("Last Contact At")).setValue(now.toISOString());
        if (step === NURTURE.DAYS.length) sheet.getRange(rowNum, col("Lead Stage")).setValue("Nurture Complete");
        appendOnboardingLogs(ss, [[now, lead.email, lead.firstName, lead.businessName, `nurture:${step}`, msg.subject, "Sent", ""]]);
        sent++;
        Utilities.sleep(800);
      } catch (err) {
        appendOnboardingLogs(ss, [[now, lead.email, lead.firstName, lead.businessName, `nurture:${step}`, "", "Failed", String(err && err.message || err)]]);
      }
    });
    console.log(`Nurture run: ${sent} follow-up(s) sent, ${replies} reply(ies) detected.`);
  } finally {
    lock.releaseLock();
  }
}

function sendReplyAlert_(lead, rowNum, thread) {
  MailApp.sendEmail({
    to: PLG_CONFIG.FROM_EMAIL,
    subject: `REPLIED: ${lead.businessName} - follow up now`,
    body: [
      `${lead.firstName || "Your lead"} at ${lead.businessName} replied. Follow-up emails have stopped automatically.`,
      "",
      `Phone: ${lead.phone || "-"}`,
      `Email: ${lead.email}`,
      `Lead score: ${lead.score}/100 | Sheet row ${rowNum}`,
      `Thread: ${thread.getPermalink()}`,
      "",
      "Next move: call or reply within the hour while they're engaged."
    ].join("\n"),
    name: "PLG Lead Alert"
  });
}

function getNurtureContent(step, l) {
  const name = l.firstName || "there";
  const biz = l.businessName;
  const area = l.city ? ` in ${l.city}` : "";
  const cta = PLG_CONFIG.BOOKING_LINK
    ? `Grab 15 minutes here: ${PLG_CONFIG.BOOKING_LINK}`
    : `Just reply with a good time and the best number to reach you.`;
  const sig = `\n\nAdam Rome\n${PLG_CONFIG.COMPANY}\n${PLG_CONFIG.PHONE}`;
  const steps = [
    [`Quick question about ${biz}`,
      `Hi ${name},\n\nI've started looking at how ${biz} shows up on Google${area}. A few things already stand out that are likely costing you calls.\n\nWould a quick 15-minute walkthrough this week be useful? I'll show you exactly what I found, no pitch required.\n\n${cta}`],
    [`The 3 things that decide who gets the call${area}`,
      `Hi ${name},\n\nWhen someone${area} searches for what ${biz} does, Google mostly weighs three things:\n\n1) How complete and active your Google Business Profile is\n2) How many recent reviews you have, and whether you respond to them\n3) Whether your business details match everywhere online\n\nMost local businesses are leaving at least one of these on the table. I can tell you which one matters most for ${biz}.\n\n${cta}`],
    [`Want me to just send it over?`,
      `Hi ${name},\n\nI know things get busy. If a call isn't convenient, reply "send it" and I'll email you the top 3 fixes for ${biz} so you can look whenever it suits you.`],
    [`Should I close your file?`,
      `Hi ${name},\n\nI haven't heard back, so I'll assume the timing isn't right and close out your request for ${biz}.\n\nIf getting more calls from Google becomes a priority, just reply to this email and I'll pick it right back up.`]
  ];
  const pair = steps[Math.min(Math.max(step, 1), steps.length) - 1];
  return { subject: pair[0], body: pair[1] + sig };
}
