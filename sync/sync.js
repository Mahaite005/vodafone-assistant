/* ============================================================
   Vodafone Egypt Assistant — Auto-Sync Engine
   ============================================================
   Scrapes vodafone.com.eg and refreshes live-data.json.
   PRINCIPLE: never touches index.html / faq-data.js.
   All fetched data lands in sync/live-data.json (an overlay
   the site loads at runtime). If sync fails or the file is
   absent, the site silently falls back to its bundled data.

   Usage:
     node sync/sync.js            normal run (scrape + update)
     node sync/sync.js --check     scrape only, report changes, no write
     node sync/sync.js --force     write even if no changes (refresh stamps)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIVE_FILE = path.join(ROOT, 'sync', 'live-data.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const PAGES = {
  red:      'https://web.vodafone.com.eg/en/vodafone-red1',
  plus:     'https://web.vodafone.com.eg/en/mobile-internet-bundles',
  cash:     'https://web.vodafone.com.eg/en/vodafone-cash',
  kart:     'https://web.vodafone.com.eg/en/kart-el-korout'
};

/* ---------- tiny helpers ---------- */
const nowISO = () => new Date().toISOString();
const num = s => parseFloat(String(s).replace(/,/g, '')) || null;
const squash = h => h.replace(/<!--[\s\S]*?-->/g, '')          // strip comments
                     .replace(/\s+/g, ' ');                    // collapse whitespace

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return res.text();
}

/* ---------- scrapers (each returns array of items or null on failure) ---------- */

/* RED postpaid: <h3>RED ESSENTIAL+</h3> ... "85 GB" ... "10000" ... "EGP 2000/month Tax Exclusive" */
function scrapeRed(html) {
  const h = squash(html);
  const out = [];
  const cardRe = /<div class="card-plan card-collapsing radius m-0">([\s\S]*?)(?=<div class="card-plan card-collapsing|<div class="row justify-content-center|<\/div>\s*<\/div>\s*<\/section>)/g;
  let m;
  while ((m = cardRe.exec(h)) !== null) {
    const c = m[1];
    const name = (c.match(/<h3[^>]*>([^<]+)<\/h3>/) || [])[1];
    if (!name || !/^RED /i.test(name)) continue;
    const h4s = [...c.matchAll(/<span class="font-regular">([^<]*)<\/span>/g)].map(x => x[1].trim());
    const price = (c.match(/EGP\s*([\d,.]+)\s*\/month/i) || [])[1];
    if (price === undefined) continue;
    out.push({
      id: name.toLowerCase().replace(/[^a-z]/g, ''),
      name: name.trim(),
      data: h4s[0] || null,
      minutes: h4s[1] || null,
      price: num(price),
      priceText: 'EGP ' + price + '/month Tax Exclusive'
    });
  }
  return out.length ? out : null;
}

/* Plus bundles: "1400 Mega" ... "37 EGP"  (also "Megabytes" variant; Apps tab deduped) */
function scrapePlus(html) {
  const h = squash(html);
  const out = [];
  const seen = new Set();
  const re = /<h5 class="card-subscription-header-title color-red">\s*([^<]+?)\s*<\/h5>[\s\S]*?<h5 class="card-subscription-body-amount">([^<]+)<\/h5>/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    const title = m[1].trim();
    const amount = m[2].trim();
    const mega = title.match(/([\d,.]+)\s*Mega(bytes)?/i);
    const price = num((amount.match(/[\d,.]+/) || [])[0]);
    if (!mega || price == null) continue;
    // Apps bundles (Flex/Prepaid titles with fixed 6.5 EGP) — keep one copy each
    const isApp = !/^\d/.test(title);
    const key = isApp ? title : 'main-' + price;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(isApp
      ? { id: 'app-' + title.replace(/\W+/g, '-').toLowerCase(), label: title + ' — ' + amount, app: true }
      : { id: 'plus-' + price, megas: num(mega[1]), price, label: amount });
  }
  return out.length ? out.filter(x => !x.app).concat(out.filter(x => x.app)) : null;
}

/* USSD codes present on a page (existence check only) */
function scrapeCodes(html, expected) {
  const found = [...new Set([...html.matchAll(/\*\d{1,4}(?:\*\d+)*#/g)].map(x => x[0]))];
  return expected.map(c => ({ code: c, present: found.includes(c) }));
}

/* ---------- comparison & report ---------- */
function diffRed(oldList, newList) {
  const ch = [];
  for (const n of newList) {
    const o = (oldList || []).find(x => x.id === n.id);
    if (!o) { ch.push({ type: 'added', plan: n.name, detail: 'new plan detected: ' + n.priceText }); continue; }
    if (o.price !== n.price) ch.push({ type: 'price', plan: n.name, from: o.price, to: n.price, detail: 'EGP ' + o.price + ' → EGP ' + n.price });
    if ((o.data || '') !== (n.data || '')) ch.push({ type: 'data', plan: n.name, from: o.data, to: n.data });
    if ((o.minutes || '') !== (n.minutes || '')) ch.push({ type: 'minutes', plan: n.name, from: o.minutes, to: n.minutes });
  }
  for (const o of (oldList || [])) {
    if (!newList.find(x => x.id === o.id)) ch.push({ type: 'removed', plan: o.name, detail: 'plan no longer listed' });
  }
  return ch;
}

function diffPlus(oldList, newList) {
  const ch = [];
  const key = x => x.id;
  const oldKeys = new Set((oldList || []).filter(x=>!x.app).map(key));
  const newMain = newList.filter(x=>!x.app);
  const newKeys = new Set(newMain.map(key));
  for (const n of newMain) if (!oldKeys.has(key(n))) ch.push({ type: 'changed', bundle: n.label, detail: n.megas + ' MB @ ' + n.price + ' EGP' });
  for (const o of (oldList || []).filter(x=>!x.app)) if (!newKeys.has(key(o))) ch.push({ type: 'changed', bundle: o.label, from: o.megas + 'MB@' + o.price });
  return ch;
}

/* ---------- main ---------- */
(async () => {
  const args = process.argv.slice(2);
  const CHECK_ONLY = args.includes('--check');
  const FORCE = args.includes('--force');

  let prev = { meta: {}, data: {} };
  if (fs.existsSync(LIVE_FILE)) {
    try { prev = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8')); }
    catch { console.error('[sync] live-data.json unreadable — starting fresh'); }
  }

  const report = { runAt: nowISO(), changes: [], errors: [], sources: {} };

  // --- RED plans ---
  try {
    const html = await get(PAGES.red);
    const plans = scrapeRed(html);
    report.sources.red = { ok: true, items: plans ? plans.length : 0 };
    if (plans) {
      const d = diffRed(prev.data.redPlans, plans);
      d.forEach(x => report.changes.push({ area: 'RED', ...x }));
      report.redPlans = plans;
    }
  } catch (e) { report.errors.push('RED: ' + e.message); report.sources.red = { ok: false, error: e.message }; }

  // --- Plus bundles ---
  try {
    const html = await get(PAGES.plus);
    const bundles = scrapePlus(html);
    report.sources.plus = { ok: true, items: bundles ? bundles.length : 0 };
    if (bundles) {
      const d = diffPlus(prev.data.plusBundles, bundles);
      d.forEach(x => report.changes.push({ area: 'Plus', ...x }));
      report.plusBundles = bundles;
    }
  } catch (e) { report.errors.push('Plus: ' + e.message); report.sources.plus = { ok: false, error: e.message }; }

  // --- Cash & Kart code verification ---
  try {
    const [cashHtml, kartHtml] = await Promise.all([get(PAGES.cash), get(PAGES.kart)]);
    const cashCodes = scrapeCodes(cashHtml, ['*9#', '*9*5#', '*9*9#']);
    const kartCodes = scrapeCodes(kartHtml, ['*86#', '*85#', '*9#']);
    report.sources.codes = { ok: true };
    report.codeChecks = { cash: cashCodes, kart: kartCodes };
  } catch (e) { report.errors.push('Codes: ' + e.message); report.sources.codes = { ok: false, error: e.message }; }

  // --- decide & write ---
  const hasFreshData = report.redPlans || report.plusBundles;
  const changed = report.changes.length > 0;

  if (CHECK_ONLY) {
    console.log('[sync] CHECK MODE — no files written');
  } else if ((changed || FORCE) && hasFreshData) {
    const live = {
      meta: {
        lastSync: nowISO(),
        lastChange: changed ? nowISO() : (prev.meta.lastChange || null),
        source: 'vodafone.com.eg',
        autoGenerated: true
      },
      data: {
        redPlans: report.redPlans || prev.data.redPlans || [],
        plusBundles: report.plusBundles || prev.data.plusBundles || [],
        codeChecks: report.codeChecks || prev.data.codeChecks || null
      }
    };
    fs.writeFileSync(LIVE_FILE, JSON.stringify(live, null, 2), 'utf8');
    // Browser-side copy (plain <script> load, works even from file://)
    fs.writeFileSync(path.join(ROOT, 'live-data.js'), 'window.VF_LIVE = ' + JSON.stringify(live) + ';\n', 'utf8');
    console.log('[sync] live-data.json + live-data.js ' + (changed ? 'UPDATED' : 'refreshed'));
  } else {
    console.log('[sync] no changes — live-data.json untouched');
  }

  // --- human-readable change log ---
  const logFile = path.join(ROOT, 'sync', 'changes.log');
  let log = '';
  try { log = fs.readFileSync(logFile, 'utf8'); } catch {}
  if (report.changes.length) {
    const stamp = new Date().toLocaleString('en-GB');
    log += '\n=== ' + stamp + ' ===\n' +
      report.changes.map(c => '  [' + c.area + '] ' + (c.plan || c.bundle || '') + ': ' +
        (c.detail || (c.from + ' → ' + c.to))).join('\n') + '\n';
    fs.writeFileSync(logFile, log, 'utf8');
  }

  // --- console summary (bilingual) ---
  console.log('──────────────────────────────────────────');
  console.log('Sync report — ' + new Date().toLocaleString('en-GB'));
  if (report.changes.length) {
    console.log('CHANGES (' + report.changes.length + '):');
    report.changes.forEach(c => console.log('  • [' + c.area + '] ' + (c.plan || c.bundle) + ': ' + (c.detail || (c.from + ' → ' + c.to))));
  } else {
    console.log('No changes detected. / لا توجد تغييرات');
  }
  report.errors.forEach(e => console.log('ERROR: ' + e));
  Object.entries(report.sources).forEach(([k, v]) => console.log('source ' + k + ': ' + (v.ok ? 'OK (' + (v.items || 'n/a') + ')' : 'FAILED — ' + v.error)));
  if (report.codeChecks) {
    const flat = [...report.codeChecks.cash, ...report.codeChecks.kart];
    const missing = flat.filter(c => !c.present).map(c => c.code);
    console.log('code presence: ' + flat.filter(c => c.present).length + '/' + flat.length + ' verified' + (missing.length ? ' — MISSING: ' + missing.join(' ') : ''));
  }
  console.log('──────────────────────────────────────────');
})().catch(e => { console.error('[sync] FATAL', e.message); process.exit(1); });
