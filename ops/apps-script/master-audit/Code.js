/**
 * Prime Local Growth - Automated Audit Generator
 *
 * Website form -> Vercel /api/submit-form -> MASTER_APPS_SCRIPT_WEBHOOK_URL -> Audit Doc
 */

const AUDIT_CONFIG = {
  AUDIT_FOLDER_ID: "1DWD4Nj5x_KEeMDZk3Rgl5oIMYr_xZDng",
  MASTER_TEMPLATE_ID: "15fvsPXQi07M0F_HZhbqXyTRSijmXdLL6xqr6iADb07Y",
  LOG_SHEET_ID: "1VQUrCVsn97iGlO_lQoK_HHDQqneKDgPN7udZRJWRW-U",
  LOG_SHEET_NAME: "Audit Requests",
  ADMIN_EMAIL: "adam@primelocalgrowth.com",
  COMPANY: "Prime Local Growth"
};

function doPost(e) {
  if (!isWebhookAuthorized(e)) {
    return jsonResponse({ success: false, error: "Unauthorized" });
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    return jsonResponse({
      success: false,
      error: "Audit system is busy. Try again."
    });
  }

  try {
    const payload = parsePayload(e);
    const lead = normalizeAuditLead(payload);
    const validationError = validateAuditLead(lead);

    if (validationError) {
      logAuditRequest(lead, "", "Failed", validationError);

      return jsonResponse({
        success: false,
        error: validationError
      });
    }

    const auditFile = createAuditDocument(lead);

    logAuditRequest(lead, auditFile.getUrl(), "Created", "");

    notifyAdmin(lead, auditFile);

    return jsonResponse({
      success: true,
      auditUrl: auditFile.getUrl(),
      auditId: auditFile.getId()
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`Audit generation failed: ${message}`);

    return jsonResponse({
      success: false,
      error: message
    });
  } finally {
    lock.releaseLock();
  }
}

function createAuditDocument(lead) {
  const templateDoc = DriveApp.getFileById(AUDIT_CONFIG.MASTER_TEMPLATE_ID);
  const folder = DriveApp.getFolderById(AUDIT_CONFIG.AUDIT_FOLDER_ID);
  const docName = buildAuditDocName(lead);
  const newFile = templateDoc.makeCopy(docName, folder);
  const newDoc = DocumentApp.openById(newFile.getId());
  const body = newDoc.getBody();

  const replacements = {
    "{{First Name}}": lead.firstName,
    "{{Full Name}}": lead.name,
    "{{Email}}": lead.email,
    "{{Phone}}": lead.phone,
    "{{Business Name}}": lead.businessName,
    "{{Business Type}}": lead.businessType,
    "{{Niche}}": lead.niche,
    "{{City}}": lead.city,
    "{{Website}}": lead.website,
    "{{Main Service}}": lead.mainService,
    "{{Visibility Concern}}": lead.visibilityConcern,
    "{{Page URL}}": lead.pageUrl,
    "{{Submitted At}}": lead.submittedAt
  };

  Object.keys(replacements).forEach(token => {
    body.replaceText(escapeReplaceToken(token), replacements[token] || "");
  });

  newDoc.saveAndClose();

  return newFile;
}

function normalizeAuditLead(payload) {
  const name = clean(payload.name || payload.contactName || "New Lead");
  const firstName = clean(payload.firstName || name.split(/\s+/)[0] || "Lead");
  const businessName = clean(payload.businessName || payload.business_name || "Unknown Business");
  const businessType = clean(payload.businessType || payload.business_type || payload.bizType || "Local Business");
  const mainService = clean(payload.mainService || payload.main_service);
  const niche = clean(payload.niche || mainService || businessType);

  return {
    name,
    firstName,
    email: clean(payload.email).toLowerCase(),
    phone: clean(payload.phone),
    businessName,
    businessType,
    niche,
    city: clean(payload.city),
    website: clean(payload.website),
    mainService,
    visibilityConcern: clean(payload.visibilityConcern || payload.visibility_concern),
    pageUrl: clean(payload.pageUrl || payload.page_url),
    referrer: clean(payload.referrer),
    submittedAt: clean(payload.submittedAt || payload.timestamp || new Date().toISOString())
  };
}

function validateAuditLead(lead) {
  if (!lead.email || !isValidEmail(lead.email)) return "Valid email is required.";
  if (!lead.businessName) return "Business name is required.";
  return "";
}

function notifyAdmin(lead, auditFile) {
  const subject = `New Audit Request: ${lead.businessName}`;
  const body = [
    "A new free visibility audit request came in.",
    "",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || "Not provided"}`,
    `Business: ${lead.businessName}`,
    `City: ${lead.city || "Not provided"}`,
    `Niche: ${lead.niche || "Not provided"}`,
    `Website: ${lead.website || "Not provided"}`,
    "",
    `Audit draft: ${auditFile.getUrl()}`
  ].join("\n");

  GmailApp.sendEmail(AUDIT_CONFIG.ADMIN_EMAIL, subject, body, {
    name: AUDIT_CONFIG.COMPANY,
    replyTo: lead.email
  });
}

function logAuditRequest(lead, auditUrl, status, error) {
  const ss = SpreadsheetApp.openById(AUDIT_CONFIG.LOG_SHEET_ID);
  let sheet = ss.getSheetByName(AUDIT_CONFIG.LOG_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_CONFIG.LOG_SHEET_NAME);
    sheet.appendRow([
      "Timestamp",
      "Status",
      "First Name",
      "Full Name",
      "Email",
      "Phone",
      "Business Name",
      "City",
      "Niche",
      "Website",
      "Main Service",
      "Visibility Concern",
      "Audit URL",
      "Error"
    ]);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    new Date(),
    status,
    lead.firstName || "",
    lead.name || "",
    lead.email || "",
    lead.phone || "",
    lead.businessName || "",
    lead.city || "",
    lead.niche || "",
    lead.website || "",
    lead.mainService || "",
    lead.visibilityConcern || "",
    auditUrl || "",
    error || ""
  ]);
}

function buildAuditDocName(lead) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const business = sanitizeFileName(lead.businessName || "Unknown Business");
  const city = sanitizeFileName(lead.city || "No City");

  return `PLG Audit - ${business} - ${city} - ${date}`;
}

function isWebhookAuthorized(e) {
  const expected = clean(PropertiesService.getScriptProperties().getProperty("WEBHOOK_KEY"));
  if (!expected) return true;

  const provided = clean(e && e.parameter && e.parameter.key);
  return provided === expected;
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("No payload received.");
  }

  return JSON.parse(e.postData.contents);
}

function clean(value) {
  return String(value || "").trim();
}

function sanitizeFileName(value) {
  return clean(value).replace(/[\\/:*?"<>|#%{}~&]/g, "-").slice(0, 80);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeReplaceToken(token) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

