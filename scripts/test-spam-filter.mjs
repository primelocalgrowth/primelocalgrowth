import assert from 'node:assert/strict';
import { detectSpam } from '../lib/spam-filter.js';

const flashSale = `This is your official invitation to our exclusive Flash Sale!
Our most popular luxury-inspired bags and precision watches are currently marked down for the next 24 hours only. View the sale items right now at www.decentgears.com.`;
const dataLicense = `Hi Adam,

We're looking to license high quality photos and datasets from small business sites like yours.`;

// real owners must pass
assert.equal(detectSpam({ situation: 'I run an HVAC company in Schertz and customers cannot find us on Google. We are getting outranked by two big franchises.' }), '');
assert.equal(detectSpam({ situation: 'Our site is https://rivera-roofing.example and we only get calls from referrals. What would you fix first?' }), '');
assert.equal(detectSpam({ situation: 'We moved locations last month. Hours and address are wrong on Google. Please help.', formAge: 41000 }), '');
assert.equal(detectSpam({ situation: '', formAge: undefined }), '');

// spam is dropped
assert.equal(detectSpam({ situation: flashSale }), 'sales_pitch');
assert.equal(detectSpam({ situation: dataLicense }), 'sales_pitch');
assert.equal(detectSpam({ situation: 'Need more traffic? We offer SEO and link building. See https://a.example https://b.example https://c.example' }), 'many_links');
assert.equal(detectSpam({ situation: 'We offer lead generation services for contractors' }), 'sales_pitch');
assert.equal(detectSpam({ situation: 'Please help', formAge: 600 }), 'filled_too_fast');
assert.equal(detectSpam({ businessName: 'Best deals www.spam.example' }), 'link_in_name');

console.log('PASS spam filter: real owner notes pass, flash sales, data-licensing pitches, link dumps and instant posts are dropped.');
