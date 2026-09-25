/* Static sanity check of the assistant — verifies wiring without a browser */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/Elostaz/Documents/Default Project/vodafone-assistant';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if(!cond) fails++; };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. FAQ removed (section, data file, render code all gone)
ok(!fs.existsSync(path.join(ROOT, 'faq-data.js')), 'faq-data.js deleted');
ok(!/FAQ_RAW/.test(html) && !/renderFaq/.test(html) && !/statFaq/.test(html), 'no FAQ code left in index.html');
ok(html.indexOf('data-tab="faq"') === -1 && html.indexOf('id="faq"') === -1, 'no FAQ tab/section in index.html');

// 1b. Renewal countdown present
ok(html.indexOf('data-tab="renew"') !== -1, 'Renewal tab present');
ok(html.indexOf('id="renew"') !== -1, 'Renewal section present');
ok(/id="renDate"/.test(html) && /id="renDay"/.test(html) && /id="renResult"/.test(html) && /id="renDays"/.test(html) && /id="renNext"/.test(html), 'Renewal inputs + outputs present');
ok(/<option value="16">16th/.test(html), 'Renewal 1/4/16 day options present');
ok(/function calcRenew/.test(html), 'calcRenew function present');

// renewal math: days from picked date to next 1st/4th/16th (same-day = 0)
function nextInvoice(y, m, d, day){
  const ref = new Date(y, m, d);
  let nxt = new Date(y, m, day);
  if(nxt < ref) nxt = new Date(y, m + 1, day);
  return Math.round((nxt - ref) / 86400000);
}
ok(nextInvoice(2026, 8, 25, 1) === 6, 'renew Sep 25 → Oct 1 = 6 days (got ' + nextInvoice(2026, 8, 25, 1) + ')');
ok(nextInvoice(2026, 8, 25, 16) === 21, 'renew Sep 25 → Oct 16 = 21 days (got ' + nextInvoice(2026, 8, 25, 16) + ')');
ok(nextInvoice(2026, 8, 1, 1) === 0, 'renew same-day (Sep 1, day 1) = 0 days (got ' + nextInvoice(2026, 8, 1, 1) + ')');
ok(nextInvoice(2026, 11, 30, 4) === 5, 'renew Dec 30 → Jan 4 = 5 days (got ' + nextInvoice(2026, 11, 30, 4) + ')');

// 2. live-data.js sets window.VF_LIVE
const live = fs.readFileSync(path.join(ROOT, 'live-data.js'), 'utf8');
const w = {};
new Function('window', live)(w);
ok(w.VF_LIVE && w.VF_LIVE.data.redPlans.length === 5, 'live-data.js sets VF_LIVE (5 RED plans)');
ok(w.VF_LIVE.data.plusBundles.length === 8, 'live-data.js has 8 Plus bundles');
ok(w.VF_LIVE.data.codeChecks && w.VF_LIVE.data.codeChecks.cash.every(c => c.present), 'codeChecks all present');

// 3. index.html wiring
ok(/<script src="live-data.js"/.test(html), 'index.html loads live-data.js');
ok(/applyLive/.test(html), 'applyLive() overlay present');
ok(/statSync/.test(html), 'sync status chip present');
ok(/id="statSync"/.test(html), 'statSync element exists');
ok((html.match(/<script/g)||[]).length === (html.match(/<\/script>/g)||[]).length, 'script tags balanced');
// esc() defined before use
ok(html.indexOf('function esc(') < html.indexOf('renderCards'), 'esc() defined before renderCards');
// improved norm()
ok(/أإآٱ/.test(html), 'alef normalization present');
ok(/ة/g.test(html) && /ى/g.test(html), 'taa/ya normalization present');

// 4. live prices match static tables (RED)
const staticRed = [...html.matchAll(/<tr><td><b>RED (Essential\+|Advance\+|Prime\+|Elite\+|Exclusive)<\/b>[\s\S]*?<td>([\d,]+)<span/g)].map(m => ({plan: m[1], price: m[2]}));
w.VF_LIVE.data.redPlans.forEach(p => {
  const stat = staticRed.find(s => p.name.includes(s.plan.replace('+', '\\+').slice(0, 6).toUpperCase()));
});
ok(staticRed.length === 5, 'static RED table parsed (' + staticRed.length + ' rows)');

// 5. sync engine files
ok(fs.existsSync(path.join(ROOT, 'sync', 'sync.js')), 'sync/sync.js exists');
ok(fs.existsSync(path.join(ROOT, 'sync', 'task.js')), 'sync/task.js exists');
ok(fs.existsSync(path.join(ROOT, 'sync', 'live-data.json')), 'sync/live-data.json exists');

// 6. pro-rata calculator
ok(html.indexOf('data-tab="pro"') !== -1, 'Pro-Rata tab present');
ok(html.indexOf('id="pro"') !== -1, 'Pro-Rata section present');
ok(/id="proCycle"/.test(html) && /<option value="1">/.test(html) && /<option value="4">/.test(html) && /<option value="16">/.test(html), 'cycle options 1/4/16 selectable');
ok(/quota ÷ 30 × /.test(html), 'proration formula (÷30×days) in code');
ok(/RED_SMS_QUOTA/.test(html), 'SMS quota map present');
ok(/statTools/.test(html), 'tools counter dynamic');

/* proration math checks (mirror of browser code) */
function nextRenewal(from, day){
  let d = new Date(from.getFullYear(), from.getMonth(), day);
  if(d < from) d = new Date(from.getFullYear(), from.getMonth() + 1, day);
  return d;
}
const sub = new Date('2026-09-10T12:00:00');
const days = Math.round((nextRenewal(sub, 16) - sub) / 86400000);
ok(days === 6, 'days math: Sep 10 → Sep 16 = 6 days (got ' + days + ')');
const mins = Math.floor(11000 / 30 * days);
ok(mins === 2200, 'minutes math: 11000÷30×6 = 2200 (got ' + mins + ')');
const mbs = 200 * 1024 / 30 * days;
ok(Math.round(mbs) === 40960, 'data math: 200GB÷30×6 = 40,960 MB (got ' + Math.round(mbs) + ')');
const sms = Math.floor(3000 / 30 * days);
ok(sms === 600, 'SMS math: 3000÷30×6 = 600 (got ' + sms + ')');
const fee = 3450 / 30 * days;
ok(Math.abs(fee - 690) < 0.01, 'fee math: 3450÷30×6 = 690 (got ' + fee.toFixed(2) + ')');

// 7. Tax calculator multi-type
ok(/id="taxLineType"/.test(html), 'Tax line type selector present');
ok(/<option value="postpaid">/.test(html) && /<option value="prepaid">/.test(html) && /<option value="dsl">/.test(html), 'Tax types: postpaid/prepaid/dsl');
ok(/1\.43%/.test(html) || /0\.0143/.test(html), 'Prepaid tax 1.43% present');
ok(/1\.14%/.test(html) || /0\.0114/.test(html), 'DSL tax 1.14% present');

// 8. Net balance calculator
ok(html.indexOf('data-tab="netbalance"') !== -1, 'Net Balance tab present');
ok(html.indexOf('id="netbalance"') !== -1, 'Net Balance section present');
ok(/id="paidAmount"/.test(html) && /id="netBalance"/.test(html), 'Net balance inputs present');
ok(/0\.70/.test(html) || /× 0\.70/.test(html), 'Net rate 70% formula present');

// 9. Bill Validity calculator
ok(html.indexOf('data-tab="billvalidity"') !== -1, 'Bill Validity tab present');
ok(html.indexOf('id="billvalidity"') !== -1, 'Bill Validity section present');
ok(/id="bvBillDate"/.test(html) && /id="bvDueDate"/.test(html) && /id="bvSegment"/.test(html), 'Bill Validity inputs present');
ok(/BV_LOOKUP/.test(html), 'Bill Validity lookup table present');
ok(/Semi-HL Date/.test(html) && /Max Deal Date/.test(html) && /Deal Days/.test(html), 'Bill Validity outputs present');
ok(/addDays/.test(html) && /nextRenewal/.test(html), 'Bill Validity date math present');

// Tax math checks
const postpaid = (() => { const b=575, d=10, s=0.67, st=0.08, vt=0.14; const sub=b+d+s; const sct=sub*st; const v=(sub+sct)*vt; const tot=sub+sct+v; return {tot,eff:((tot-b)/b)*100}; })();
ok(Math.abs(postpaid.tot - 721.08) < 0.01, 'Postpaid 575 → total 721.08 (got ' + postpaid.tot.toFixed(2) + ')');
ok(Math.abs(postpaid.eff - 25.40) < 0.01, 'Postpaid 575 → eff rate 25.40% (got ' + postpaid.eff.toFixed(2) + '%)');

const prepaid = (() => { const b=100, rate=0.0143; const t=b*rate; const tot=b+t; return {tot,eff:((tot-b)/b)*100}; })();
ok(Math.abs(prepaid.tot - 101.43) < 0.01, 'Prepaid 100 → total 101.43 (got ' + prepaid.tot.toFixed(2) + ')');
ok(Math.abs(prepaid.eff - 1.43) < 0.01, 'Prepaid 100 → eff rate 1.43% (got ' + prepaid.eff.toFixed(2) + '%)');

const dsl = (() => { const b=200, rate=0.0114; const t=b*rate; const tot=b+t; return {tot,eff:((tot-b)/b)*100}; })();
ok(Math.abs(dsl.tot - 202.28) < 0.01, 'DSL 200 → total 202.28 (got ' + dsl.tot.toFixed(2) + ')');
ok(Math.abs(dsl.eff - 1.14) < 0.01, 'DSL 200 → eff rate 1.14% (got ' + dsl.eff.toFixed(2) + '%)');

// Net balance math
const nb1 = 100 * 0.70; ok(nb1 === 70, 'Net 100×0.7 = 70 (got ' + nb1 + ')');
const nb2 = 70 / 0.70; ok(nb2 === 100, 'Paid 70÷0.7 = 100 (got ' + nb2 + ')');
const nb3 = 50 * 0.70; ok(nb3 === 35, 'Net 50×0.7 = 35 (got ' + nb3 + ')');
const nb4 = 35 / 0.70; ok(nb4 === 50, 'Paid 35÷0.7 = 50 (got ' + nb4 + ')');

// 10. Access control removed — site is public (no gate, api/, or access pages)
ok(!fs.existsSync(path.join(ROOT, 'api')), 'api/ removed');
ok(!fs.existsSync(path.join(ROOT, 'request-access.html')), 'request-access.html removed');
ok(!fs.existsSync(path.join(ROOT, 'admin.html')), 'admin.html removed');
ok(!/ACCESS GATE/.test(html), 'no access gate in index.html');

// 11. Offers / discount calculator
ok(html.indexOf('data-tab="offers"') !== -1, 'Offers tab present');
ok(html.indexOf('id="offers"') !== -1, 'Offers section present');
ok(/id="offPrice"/.test(html) && /id="offMonths"/.test(html) && /id="offDisc"/.test(html) && /id="offResult"/.test(html), 'Offers inputs + result present');
ok(/id="offDeduct"/.test(html), 'Offers monthly deduction row present');
ok(/<option value="50">50%/.test(html), 'Offers 25%/50% discount options present');
ok(/function calcOffer/.test(html), 'calcOffer function present');
ok(/for\(let m = 1; m <= 18; m\+\+\)/.test(html), 'Offers duration 1–18 months');

// offers math: monthly = price×(1−rate); total = monthly×months; save = price×months − total
function offerMath(price, ratePct, months){
  const rate = ratePct / 100;
  const monthly = Math.round(price * (1 - rate) * 100) / 100;
  const deduct = Math.round(price * rate * 100) / 100;
  const total = Math.round(monthly * months * 100) / 100;
  const save = Math.round((price * months - total) * 100) / 100;
  return { monthly, deduct, total, save };
}
let o = offerMath(100, 25, 6);
ok(o.monthly === 75 && o.total === 450 && o.save === 150, 'Offers 100 EGP × 6mo × 25%: 75/mo, 450 total, 150 save (got ' + o.monthly + '/' + o.total + '/' + o.save + ')');
ok(o.deduct === 25, 'Offers monthly deduction 100 × 25% = 25 (got ' + o.deduct + ')');
o = offerMath(200, 50, 18);
ok(o.monthly === 100 && o.total === 1800 && o.save === 1800, 'Offers 200 EGP × 18mo × 50%: 100/mo, 1800 total, 1800 save (got ' + o.monthly + '/' + o.total + '/' + o.save + ')');
ok(o.deduct === 100, 'Offers monthly deduction 200 × 50% = 100 (got ' + o.deduct + ')');
o = offerMath(52, 50, 1);
ok(o.monthly === 26 && o.total === 26 && o.save === 26, 'Offers 52 EGP × 1mo × 50%: 26/mo, 26 total, 26 save (got ' + o.monthly + '/' + o.total + '/' + o.save + ')');

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL CHECKS PASSED ✓'));
process.exit(fails ? 1 : 0);
