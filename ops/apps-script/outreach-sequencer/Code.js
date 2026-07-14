// Cibolo Daily Scraper — Google Apps Script Web App + Cold Outreach Sequencer
// Deploy as: Execute as "Me", Access "Anyone"
//
// Two jobs:
//   1. doPost() receives prospects from the Cloudflare Worker and QUEUES them
//      (writes to the "Cibolo Daily Prospects" sheet, Status = "Queued").
//   2. runOutreachSequencer() (daily time trigger) AUTO-SENDS a 4-touch cold
//      sequence from adam@primelocalgrowth.com, follows up non-repliers, and
//      STOPS the instant a prospect replies (then pings Adam to take the call).
//
// One-time setup after pasting: run setupOutreachTriggers() once (authorizes
// Gmail + installs the daily 9am trigger). Then it runs itself.
//
// Safeguards (main-domain sending): hard daily send cap, auto-stop on reply,
// opt-out line on every email, replies checked before any send.

const SHEET_NAME = 'Cibolo Daily Prospects';
const PROSPECTS_SS_ID = PropertiesService.getScriptProperties().getProperty('PROSPECTS_SPREADSHEET_ID') || '';
const HEADERS = [
  'Date','Service','Business Name','Address','Phone','Website',
  'Rating','Reviews','Photos','Owner Email','Owner Name',
  'Top Competitor','Subject Line','Email Body','Status',
  'Step','Last Sent','Thread Id'   // sequencer state (cols 16-18)
];

// Column numbers (1-based) for the sequencer state
const COL = { email: 10, ownerName: 11, business: 3, subject: 13, body: 14,
             status: 15, step: 16, lastSent: 17, threadId: 18,
             website: 6, rating: 7, reviews: 8, photos: 9, competitor: 12 };

const SEQ = {
  dailyCap: 25,          // max TOTAL emails sent per run (protects domain reputation)
  maxSteps: 4,           // number of touches before giving up
  intervalsDays: [0, 3, 4, 5], // wait before step index: step1 now, step2 +3d, step3 +4d, step4 +5d
  triggerHour: 9,        // local hour for the daily run
  timezone: 'America/Chicago',
};

const OPT_OUT = '\n\nNot the right time? Just reply STOP and I won\'t email again.';

// ---------------------------------------------------------------------------
// INBOUND: Worker posts prospects here → queue them for the sequencer.
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: 'No body' });
    const data = JSON.parse(e.postData.contents);

    // This web app is deployed "Access: Anyone", so doPost is internet-reachable.
    // Without this shared-secret gate, anyone who finds the /exec URL could inject
    // arbitrary recipients and email bodies into a pipeline that AUTO-SENDS cold
    // email from the main sending domain. Set INBOUND_KEY in Script Properties and
    // match it to the Worker's GAS_INBOUND_KEY secret.
    const expected = PropertiesService.getScriptProperties().getProperty('INBOUND_KEY') || '';
    if (!expected || String(data.key || '') !== expected) {
      return json({ ok: false, error: 'Unauthorized' });
    }

    if (data.action === 'write_prospects') {
      if (!Array.isArray(data.rows)) return json({ ok: false, error: 'rows must be an array' });
      const queued = writeProspects(data.rows, data.service, data.date);
      notifyBatch(data.rows, data.service, data.date, queued);
      return json({ ok: true, wrote: data.rows.length, queued: queued });
    }
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

function writeProspects(rows, service, date) {
  const sheet = getOrCreateSheet();
  // A business already anywhere in the pipeline (including 'CW-Pitched' rows the
  // CiboloWatch monitor adds) must never re-enter as a fresh Queued row — one
  // owner getting two overlapping pitches burns the domain and the relationship.
  const existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, COL.business, sheet.getLastRow() - 1, 1).getValues().forEach(function(r) {
      const n = String(r[0] || '').trim().toLowerCase();
      if (n) existing[n] = true;
    });
  }
  let queued = 0;
  const values = rows.map(r => {
    const hasEmail = r.ownerEmail && r.ownerEmail !== 'RESEARCH_NEEDED';
    const nameKey = String(r.name || '').trim().toLowerCase();
    let status = (hasEmail && r.subject && r.emailBody) ? 'Queued' : 'Skipped';
    if (nameKey && existing[nameKey]) status = 'Duplicate';
    else if (nameKey) existing[nameKey] = true;
    if (status === 'Queued') queued++;
    return [
      date, service,
      r.name || '', r.address || '', r.phone || '', r.website || '',
      r.rating || '', r.reviews || 0, r.photos || 0,
      r.ownerEmail || 'RESEARCH_NEEDED', r.ownerName || '',
      r.competitor || '', r.subject || '', r.emailBody || '',
      status, 0, '', ''
    ].map(neutralizeFormula_);
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, HEADERS.length).setValues(values);
  return queued;
}

// Prevent Google Sheets formula/CSV injection: a scraped string starting with
// = + - @ (or tab/CR) runs as a formula when the sheet is opened
// (e.g. =IMPORTXML(attacker_url) exfiltrates data). Prefix with an apostrophe so
// Sheets stores it as text. Numbers pass through so numeric cells stay numeric.
function neutralizeFormula_(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

// ---------------------------------------------------------------------------
// THE ENGINE: run daily. Checks replies, then sends due steps under the cap.
// ---------------------------------------------------------------------------
function runOutreachSequencer() {
  // Real people don't cold-email on weekends; weekend sends are also a spam-filter signal.
  const day = new Date().getDay();
  if (day === 0 || day === 6) return;

  const sheet = getOrCreateSheet();
  ensureSequencerColumns(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const now = new Date();
  let sent = 0;

  // PHASE 1 — detect replies / opt-outs before sending anything new.
  // Only prospects who have actually been touched (step > 0) can reply to the
  // sequence; skipping the untouched queue saves one Gmail search per queued
  // row per day (the queue is usually much larger than the active set).
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[COL.status - 1] || '').trim();
    const email = String(row[COL.email - 1] || '').trim();
    if (!email || email === 'RESEARCH_NEEDED') continue;
    if (status !== 'Queued' && status !== 'Active') continue;
    if (!(Number(row[COL.step - 1]) > 0)) continue;

    const reply = findInboundReply_(email);
    if (reply) {
      const newStatus = reply.optOut ? 'Unsub' : 'Replied';
      sheet.getRange(i + 2, COL.status).setValue(newStatus);
      row[COL.status - 1] = newStatus;
      if (newStatus === 'Replied') {
        const drafted = draftReplyResponse_(row);
        notifyReply_(row, drafted);
      }
    }
  }

  // PHASE 2 — send due steps to still-active prospects, under the cap.
  // Order matters when the queue outgrows the daily cap: due follow-ups go first
  // (in-flight sequences keep their cadence), then first touches sorted
  // worst-profile-first — the weakest Google profile is the strongest pitch, so
  // the limited sends go to the prospects most likely to reply.
  const candidates = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[COL.status - 1] || '').trim();
    if (status !== 'Queued' && status !== 'Active') continue;

    const email = String(row[COL.email - 1] || '').trim();
    if (!email || email === 'RESEARCH_NEEDED') continue;

    const step = Number(row[COL.step - 1]) || 0;
    if (step >= SEQ.maxSteps) { setCell_(sheet, i, COL.status, 'Done'); continue; }

    const wait = SEQ.intervalsDays[step] || 0;
    const lastSent = row[COL.lastSent - 1] ? new Date(row[COL.lastSent - 1]) : null;
    const daysSince = lastSent ? (now - lastSent) / 86400000 : Infinity;
    if (step > 0 && daysSince < wait) continue;   // not due yet

    candidates.push({ i: i, row: row, step: step, score: gapScore_(row) });
  }

  candidates.sort(function(a, b) {
    if ((a.step > 0) !== (b.step > 0)) return a.step > 0 ? -1 : 1;
    return b.score - a.score;
  });

  for (let c = 0; c < candidates.length && sent < SEQ.dailyCap; c++) {
    const i = candidates[c].i;
    const row = candidates[c].row;
    const step = candidates[c].step;
    const email = String(row[COL.email - 1] || '').trim();

    // Quality gate: a first touch that fails the spam lint never sends. It gets
    // flagged for a human rewrite instead — one bad blast costs more than 25 good sends.
    if (step === 0) {
      const lint = spamLint_(row[COL.subject - 1], row[COL.body - 1], row[COL.business - 1]);
      if (lint) { setCell_(sheet, i, COL.status, 'Lint: ' + lint); continue; }
    }

    let threadId = String(row[COL.threadId - 1] || '').trim();
    try {
      if (step === 0) {
        threadId = sendFirstTouch_(email, row);   // personalized email from the sheet
      } else {
        sendFollowUp_(email, threadId, row, step); // short bump in the same thread
      }
    } catch (err) {
      setCell_(sheet, i, COL.status, 'Error: ' + String(err).slice(0, 40));
      continue;
    }

    // Jitter between sends: a burst of identical-timestamp emails is a classic
    // bulk-sender fingerprint. 3-9s apart reads like a person working an inbox.
    Utilities.sleep(3000 + Math.floor(Math.random() * 6000));

    setCell_(sheet, i, COL.step, step + 1);
    setCell_(sheet, i, COL.lastSent, now);
    setCell_(sheet, i, COL.status, 'Active');
    if (threadId) setCell_(sheet, i, COL.threadId, threadId);
    sent++;
  }

  Logger.log('Sequencer run complete. Emails sent this run: ' + sent);

  // Friday funnel report: which verticals actually reply decides what the
  // scraper should hunt next week. Best-effort, never blocks the run.
  if (day === 5) {
    try { sendSequencerStats_(sheet); } catch (e) { Logger.log('Stats email failed: ' + e); }
  }
}

// Aggregates the whole prospects sheet into a weekly funnel email: pipeline
// counts overall plus contacted/replied (and reply rate) per service vertical,
// best-performing vertical first. Pure sheet read, no extra Gmail quota.
function sendSequencerStats_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  const totals = { rows: 0, queued: 0, active: 0, done: 0, replied: 0,
                   unsub: 0, lint: 0, error: 0, duplicate: 0, noEmail: 0 };
  const byService = {};

  data.forEach(function(row) {
    const service = String(row[1] || 'unknown').trim() || 'unknown';
    const status = String(row[COL.status - 1] || '').trim();
    const step = Number(row[COL.step - 1]) || 0;
    const email = String(row[COL.email - 1] || '').trim();

    if (!byService[service]) byService[service] = { contacted: 0, replied: 0 };
    totals.rows++;
    if (step > 0) byService[service].contacted++;

    if (status === 'Queued') totals.queued++;
    else if (status === 'Active') totals.active++;
    else if (status === 'Done') totals.done++;
    else if (status === 'Replied') { totals.replied++; byService[service].replied++; }
    else if (status === 'Unsub') totals.unsub++;
    else if (status === 'Duplicate') totals.duplicate++;
    else if (status.indexOf('Lint:') === 0) totals.lint++;
    else if (status.indexOf('Error:') === 0) totals.error++;
    else if (!email || email === 'RESEARCH_NEEDED') totals.noEmail++;
  });

  const serviceLines = Object.keys(byService)
    .filter(function(s) { return byService[s].contacted > 0; })
    .sort(function(a, b) {
      const ra = byService[a].replied / byService[a].contacted;
      const rb = byService[b].replied / byService[b].contacted;
      return rb - ra || byService[b].contacted - byService[a].contacted;
    })
    .map(function(s) {
      const v = byService[s];
      const rate = (100 * v.replied / v.contacted).toFixed(1);
      return '• ' + s + ': ' + v.contacted + ' contacted, ' + v.replied + ' replied (' + rate + '%)';
    });

  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    '📊 Outreach funnel this week: ' + totals.replied + ' replied / ' + (totals.active + totals.done + totals.replied) + ' contacted',
    'PIPELINE\n' +
    '• Queued (not yet touched): ' + totals.queued + '\n' +
    '• Active (mid-sequence): ' + totals.active + '\n' +
    '• Done (4 touches, no reply): ' + totals.done + '\n' +
    '• Replied: ' + totals.replied + '\n' +
    '• Unsubscribed: ' + totals.unsub + '\n' +
    '• Held by spam lint (need rewrite): ' + totals.lint + '\n' +
    '• Send errors: ' + totals.error + '\n' +
    '• Duplicates blocked: ' + totals.duplicate + '\n' +
    '• Missing email (research needed): ' + totals.noEmail + '\n\n' +
    'REPLY RATE BY VERTICAL (best first)\n' +
    (serviceLines.length ? serviceLines.join('\n') : '• No prospects contacted yet.') + '\n\n' +
    'Read: keep scraping the top verticals, drop the 0% ones once they have 30+ contacted. ' +
    'Lint holds and missing emails are free pipeline — fix those rows in the sheet.'
  );
}

// ---------------------------------------------------------------------------
// SEND helpers
// ---------------------------------------------------------------------------
function sendFirstTouch_(email, row) {
  const subject = String(row[COL.subject - 1] || 'Quick question');
  const body = String(row[COL.body - 1] || '') + OPT_OUT;
  // createDraft().send() returns the GmailMessage so we can capture the thread id.
  const msg = GmailApp.createDraft(email, subject, body).send();
  return msg.getThread().getId();
}

function sendFollowUp_(email, threadId, row, step) {
  const body = followUpBody_(row, step) + OPT_OUT;
  const thread = threadId ? safeGetThread_(threadId) : null;
  if (thread) {
    thread.reply(body);                 // threads under the original email
  } else {
    // Thread lost: re-anchor as a fresh send so the sequence still advances.
    GmailApp.createDraft(email, 'Following up — ' + String(row[COL.business - 1] || ''), body).send();
  }
}

function followUpBody_(row, step) {
  const first = firstName_(row);
  const biz = String(row[COL.business - 1] || 'your business');
  if (step === 1) {
    return 'Hi ' + first + ',\n\nFloating this back to your inbox in case it got buried. ' +
      'Still happy to put together that free visibility audit for ' + biz + '. ' +
      'Want me to send it over?\n\nAdam Rome | Prime Local Growth';
  }
  if (step === 2) {
    return 'Hey ' + first + ', quick one.\n\n' +
      'The Cibolo barbershop I work with (DCutz) went from stuck at #4 to the top of Google in about 60 days ' +
      'and now pulls 25 to 30 calls a month straight off the listing. ' +
      'I can show you exactly where ' + biz + ' is losing those searches, free, all by email. Worth a look?\n\n' +
      'Adam Rome | Prime Local Growth';
  }
  // step 3 — breakup (these get the highest reply rate)
  return 'Hi ' + first + ',\n\nI\'ll stop here so I\'m not cluttering your inbox. ' +
    'If getting found on Google ever moves up your list, just reply and I\'ll send the audit for ' + biz + '. ' +
    'All the best,\n\nAdam Rome | Prime Local Growth';
}

// Ranks how broken a prospect's Google profile is. Higher = weaker profile =
// stronger pitch = better use of a capped daily send. Uses the scraped fields
// already sitting in the sheet; no extra API calls.
function gapScore_(row) {
  const rating = Number(row[COL.rating - 1]) || 0;
  const reviews = Number(row[COL.reviews - 1]) || 0;
  const photos = Number(row[COL.photos - 1]) || 0;
  const website = String(row[COL.website - 1] || '').trim();
  let score = 0;
  score += rating ? (5 - rating) * 10 : 30;  // no rating at all = neglected/unclaimed listing
  if (reviews < 10) score += 20; else if (reviews < 30) score += 10;
  if (photos < 5) score += 15; else if (photos < 15) score += 5;
  if (!website) score += 25;                 // nothing for Google to rank = easiest win to sell
  return score;
}

// ---------------------------------------------------------------------------
// REPLY detection + notification
// ---------------------------------------------------------------------------
// Returns a short reason string if the email would read as spam, or '' if clean.
// Checks the things filters (and humans) actually react to.
function spamLint_(subject, body, business) {
  const s = String(subject || '');
  const b = String(body || '');
  const biz = String(business || '').trim();

  if (!s || !b) return 'missing subject or body';
  if (biz && b.indexOf(biz) === -1 && s.indexOf(biz) === -1) return 'no business name (not personalized)';
  if ((b.match(/https?:\/\//g) || []).length > 1) return 'more than one link';
  if (/[A-Z]{5,}/.test(s)) return 'all-caps in subject';
  if ((s.match(/!/g) || []).length > 0) return 'exclamation in subject';
  if (/\b(act now|limited time|100% free|guarantee[ds]?|no obligation!|risk.free|make money|cash bonus|winner|congratulations)\b/i.test(s + ' ' + b)) return 'spam-trigger phrase';
  if (b.length > 1600) return 'too long (over ~250 words)';
  if (/\$\d/.test(b)) return 'contains pricing (no-price rule)';
  return '';
}

function findInboundReply_(email) {
  const threads = GmailApp.search('from:' + email + ' newer_than:45d', 0, 3);
  if (!threads.length) return null;
  let text = '';
  threads.forEach(t => t.getMessages().forEach(m => {
    if (m.getFrom().toLowerCase().indexOf(email.toLowerCase()) !== -1) {
      text += ' ' + m.getPlainBody().toLowerCase();
    }
  }));
  const optOut = /\b(stop|unsubscribe|remove me|opt out|take me off)\b/.test(text);
  return { optOut: optOut };
}

// Pre-writes Adam's response as a Gmail draft in the prospect's thread, with
// their real profile numbers from the sheet already filled in. Reply speed is
// the biggest conversion lever in cold email; this cuts it to open-skim-send.
// Drafting is a convenience: any failure returns false and never blocks the run.
function draftReplyResponse_(row) {
  try {
    const first = firstName_(row);
    const biz = String(row[COL.business - 1] || 'your business');
    const rating = Number(row[COL.rating - 1]) || 0;
    const reviews = Number(row[COL.reviews - 1]) || 0;
    const photos = Number(row[COL.photos - 1]) || 0;
    const website = String(row[COL.website - 1] || '').trim();
    const competitor = String(row[COL.competitor - 1] || '').trim();

    const lines = [];
    if (rating) {
      lines.push('- Google rating: ' + rating + ' stars across ' + reviews + ' review' + (reviews === 1 ? '' : 's'));
    } else {
      lines.push('- The listing shows no rating yet, which usually means Google is barely surfacing it');
    }
    if (competitor) lines.push('- ' + competitor + ' is the profile winning those searches right now, and the gap is fixable');
    if (photos < 15) lines.push('- Only ' + photos + ' photo' + (photos === 1 ? '' : 's') + ' on the listing (Google favors profiles that add them weekly)');
    if (!website) lines.push('- No website linked on the listing, so Google has almost nothing to rank you with');

    const body = 'Hi ' + first + ',\n\n' +
      'Thanks for getting back to me. I already pulled the numbers for ' + biz + ', so here is the short version:\n\n' +
      lines.join('\n') + '\n\n' +
      'The full audit lays out which of these to fix first and what each one is worth in calls. ' +
      'I can send it over today, no charge and no meeting needed. Want it at this email?\n\n' +
      'Adam Rome | Prime Local Growth';

    const threadId = String(row[COL.threadId - 1] || '').trim();
    const thread = threadId ? safeGetThread_(threadId) : null;
    if (thread) { thread.createDraftReply(body); return true; }

    const email = String(row[COL.email - 1] || '').trim();
    if (!email) return false;
    GmailApp.createDraft(email, 'Re: ' + String(row[COL.subject - 1] || 'your Google listing'), body);
    return true;
  } catch (e) {
    return false;
  }
}

function notifyReply_(row, drafted) {
  const admin = Session.getActiveUser().getEmail();
  const biz = String(row[COL.business - 1] || '');
  const email = String(row[COL.email - 1] || '');
  const name = String(row[COL.ownerName - 1] || '');
  GmailApp.sendEmail(
    admin,
    '🔥 Cold outreach REPLY: ' + biz,
    'A prospect replied — they\'re warm, take the call.\n\n' +
    'Business: ' + biz + '\n' +
    'Contact:  ' + name + ' <' + email + '>\n' +
    'Last subject: ' + String(row[COL.subject - 1] || '') + '\n\n' +
    (drafted
      ? 'A reply with their audit numbers is ALREADY DRAFTED in the same Gmail thread. Open Drafts, skim it, send it.'
      : 'Open Gmail, reply personally, send the free audit, and book the call.')
  );
}

// ---------------------------------------------------------------------------
// Setup / utilities
// ---------------------------------------------------------------------------
function setupOutreachTriggers() {
  ensureSequencerColumns(getOrCreateSheet());
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runOutreachSequencer') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runOutreachSequencer')
    .timeBased().everyDays(1).atHour(SEQ.triggerHour).inTimezone(SEQ.timezone).create();
  Logger.log('Outreach sequencer trigger installed for ' + SEQ.triggerHour + ':00 ' + SEQ.timezone);
}

function ensureSequencerColumns(sheet) {
  const width = sheet.getLastColumn();
  if (width >= HEADERS.length) return;
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
       .setFontWeight('bold').setBackground('#4285F4').setFontColor('#FFFFFF');
}

function notifyBatch(rows, service, date, queued) {
  const admin = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(
    admin,
    '[' + service + '] ' + queued + ' prospects queued — ' + date,
    queued + ' of ' + rows.length + ' scraped ' + service + ' prospects were queued for auto-send. ' +
    (rows.length - queued) + ' had no email and were skipped.\n\n' +
    'The sequencer sends up to ' + SEQ.dailyCap + '/day and stops on reply. Nothing to do unless someone replies.'
  );
}

function safeGetThread_(threadId) {
  try { return GmailApp.getThreadById(threadId); } catch (e) { return null; }
}

function firstName_(row) {
  const n = String(row[COL.ownerName - 1] || '').trim();
  return n ? n.split(/\s+/)[0] : 'there';
}

function setCell_(sheet, dataIndex, col, value) {
  sheet.getRange(dataIndex + 2, col).setValue(value);
}

// Resolves the SAME spreadsheet + tab the Cloudflare Worker populates:
// prefers the PROSPECTS_SPREADSHEET_ID script property, falls back to name.
function getOrCreateSheet() {
  let ss;
  if (PROSPECTS_SS_ID) {
    ss = SpreadsheetApp.openById(PROSPECTS_SS_ID);
  } else {
    const files = DriveApp.getFilesByName(SHEET_NAME);
    ss = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(SHEET_NAME);
  }
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length)
         .setFontWeight('bold').setBackground('#4285F4').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once manually to log the Sheet URL.
function getSheetUrl() {
  const sheet = getOrCreateSheet();
  Logger.log(SpreadsheetApp.openById(sheet.getParent().getId()).getUrl());
}
