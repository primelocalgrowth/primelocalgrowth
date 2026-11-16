import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../ops/apps-script/master-audit/Code.js', import.meta.url), 'utf8');
function run({ templateMissing = false, notifyFails = false, logFails = false, authorized = true } = {}) {
  const logs = []; let unlocks = 0; let copies = 0;
  const file = { getUrl: () => 'https://docs.google.com/document/d/draft', getId: () => 'draft' };
  const context = vm.createContext({
    console: { error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ WEBHOOK_KEY: 'test-key', MASTER_TEMPLATE_ID: 'repaired-template' })[key] }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => unlocks++ }) },
    DriveApp: { getFileById: id => { assert.equal(id, 'repaired-template'); if (templateMissing) throw new Error('missing'); return { getMimeType: () => 'doc', makeCopy: () => { copies++; return file; } }; }, getFolderById: () => ({}) },
    MimeType: { GOOGLE_DOCS: 'doc' },
    DocumentApp: { openById: () => ({ getBody: () => ({ replaceText() {} }), saveAndClose() {} }) },
    Utilities: { formatDate: () => '2026-11-16' }, Session: { getScriptTimeZone: () => 'UTC' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ setMimeType: () => JSON.parse(value) }) }
  });
  vm.runInContext(source, context);
  context.logAuditRequest = (...args) => { if (logFails) throw new Error('sheet unavailable'); logs.push(args); };
  context.notifyAdmin = () => { if (notifyFails) throw new Error('mail unavailable'); };
  const result = context.doPost({ parameter: { key: authorized ? 'test-key' : 'wrong' }, postData: { contents: JSON.stringify({ businessName: 'Test Auto', email: 'owner@example.com', city: 'Athens' }) } });
  return { result, logs, unlocks, copies };
}
let r = run({ templateMissing: true });
assert.equal(r.result.success, false);
assert.match(r.result.error, /MASTER_TEMPLATE_ID/);
assert.equal(r.logs[0][2], 'Failed');
assert.equal(r.copies, 0);
assert.equal(r.unlocks, 1);
r = run({ notifyFails: true });
assert.equal(r.result.success, true);
assert.equal(r.result.notificationSent, false);
assert.equal(r.result.auditId, 'draft');
assert.deepEqual(r.logs.map(row => row[2]), ['Created', 'Notification Failed']);
r = run({ templateMissing: true, logFails: true });
assert.equal(r.result.success, false);
assert.match(r.result.error, /template/);
assert.equal(r.unlocks, 1);
r = run();
assert.equal(r.result.success, true);
assert.equal(r.result.notificationSent, true);
r = run({ authorized: false });
assert.equal(r.result.success, false);
assert.equal(r.copies, 0);
console.log('Master audit recovery tests passed: missing template, repaired binding, notification failure, failed logging, authorization.');
