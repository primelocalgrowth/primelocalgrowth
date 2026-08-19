/** Unit tests for the AI Visibility Index aggregate maths. */
import { summarise } from '../api/visibility-index.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
};

const rec = (score, band, checks) => ({ score, band, checks, publicConsent: true });
const C = (id, label, passed) => ({ id, label, passed, weight: 10 });

check('empty input is safe', summarise([]).sample === 0);

const odd = summarise([rec(10), rec(90), rec(50)].map(r => ({ ...r, checks: [] })));
check('median of odd sample', odd.median === 50, `got ${odd.median}`);

const even = summarise([rec(10), rec(20), rec(40), rec(90)].map(r => ({ ...r, checks: [] })));
check('median of even sample averages middle two', even.median === 30, `got ${even.median}`);

const withChecks = summarise([
  rec(50, 'Partially visible', [C('llms_txt', 'llms.txt', false), C('faq_schema', 'FAQ schema', true)]),
  rec(60, 'Partially visible', [C('llms_txt', 'llms.txt', false), C('faq_schema', 'FAQ schema', false)]),
  rec(70, 'Visible',           [C('llms_txt', 'llms.txt', false), C('faq_schema', 'FAQ schema', true)]),
]);
check('sample counted', withChecks.sample === 3, `got ${withChecks.sample}`);
const llms = withChecks.byCheck.find(c => c.id === 'llms_txt');
const faq = withChecks.byCheck.find(c => c.id === 'faq_schema');
check('100% fail rate computed', llms.failRate === 100, `got ${llms.failRate}`);
check('partial fail rate rounded', faq.failRate === 33, `got ${faq.failRate}`);
check('sorted worst-first', withChecks.byCheck[0].id === 'llms_txt', `got ${withChecks.byCheck[0].id}`);
check('bands tallied', withChecks.bands['Partially visible'] === 2 && withChecks.bands['Visible'] === 1,
  JSON.stringify(withChecks.bands));

const missing = summarise([{ score: 50, band: 'X' }]);
check('records without checks do not throw', missing.sample === 1 && missing.byCheck.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
