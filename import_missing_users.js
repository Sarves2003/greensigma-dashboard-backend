/*
 * Append registrants that are missing from admin.userdetail.
 *
 *   node import_missing_users.js                  -> DRY RUN (default): reads only, prints the plan, writes nothing
 *   node import_missing_users.js --commit         -> inserts the new users
 *   node import_missing_users.js --commit --limit 20   -> insert only the first 20 (good for a first test)
 *   node import_missing_users.js --rollback import_ids_<timestamp>.json  -> deletes ONLY the _ids that run inserted
 *
 * Safety:
 *  - Only ever calls insertMany (new docs). Never updates or deletes existing userdetail docs.
 *  - Re-checks the live collection at run time: anyone whose email OR mobile OR whatsappNumber is already
 *    there is skipped, so running it twice (or after new signups) is safe.
 *  - Every inserted _id is saved to import_ids_<timestamp>.json before/after each batch, for rollback.
 *  - Run from the greensigma-dashboard-backend folder (uses its .env MONGODB_URI and node_modules).
 */
require('dotenv').config({ path: '.env' });
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.resolve(__dirname, '..', 'consolidated_registrations.csv');
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const rbIdx = args.indexOf('--rollback');
const BATCH = 500;

const phone10 = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
const normEmail = (s) => String(s || '').trim().toLowerCase();

// ---------- tiny CSV parser (handles quoted fields) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

// ---------- location cleaning ----------
// Values mirror what userdetail already uses (state code + district name, e.g. TN / "Tiruchirappalli").
const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode',
  'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet',
  'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi (Tuticorin)', 'Tiruchirappalli',
  'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
  'Viluppuram', 'Virudhunagar',
];
// alias (lowercase words) -> [state, district]
const ALIAS = {};
for (const d of TN_DISTRICTS) ALIAS[d.toLowerCase().replace(/\s*\(.*\)/, '')] = ['TN', d];
const add = (keys, state, district) => keys.split('|').forEach((k) => (ALIAS[k] = [state, district]));
// spelling variants / well-known towns -> their official TN district
add('madras|chennal|kolathur|chennai', 'TN', 'Chennai');
add('trichy|tiruchirapalli|trichirappalli|tiruchi|srirangam', 'TN', 'Tiruchirappalli');
add('tuticorin|thoothukudi|kovilpatti', 'TN', 'Thoothukudi (Tuticorin)');
add('villupuram|vilupuram|viluppuram|tindivanam', 'TN', 'Viluppuram');
add('tirupur|tiruppur|dharapuram|udumalpet', 'TN', 'Tiruppur');
add('covai|cbe|pollachi|mettupalayam', 'TN', 'Coimbatore');
add('hosur|uthangarai', 'TN', 'Krishnagiri');
add('kumbakonam|pattukkottai|tanjore|thanjavur', 'TN', 'Thanjavur');
add('sivakasi|rajapalayam|srivilliputtur|sattur|virudhunagar', 'TN', 'Virudhunagar');
add('karaikudi|devakottai|sivagangai|sivaganga', 'TN', 'Sivaganga');
add('neyveli|panruti|chidambaram|vriddhachalam|cuddalore', 'TN', 'Cuddalore');
add('nagercoil|kanniyakumari|kanyakumari', 'TN', 'Kanyakumari');
add('palani|dindigul', 'TN', 'Dindigul');
add('arakkonam|ranipet', 'TN', 'Ranipet');
add('paramakudi|ramanathapuram', 'TN', 'Ramanathapuram');
add('tiruttani|avadi|redhills|thiruvallur|tiruvallur', 'TN', 'Tiruvallur');
add('tiruchengode|rasipuram|namakkal', 'TN', 'Namakkal');
add('mannargudi|thiruvarur|tiruvarur', 'TN', 'Tiruvarur');
add('gobichettipalayam|sathyamangalam|erode', 'TN', 'Erode');
add('ooty|coonoor|nilgiris', 'TN', 'Nilgiris');
add('attur|mettur|salem', 'TN', 'Salem');
add('periyakulam|theni', 'TN', 'Theni');
add('ambasamudram|tirunelveli', 'TN', 'Tirunelveli');
add('gudiyattam|vellore', 'TN', 'Vellore');
add('jayankondam|ariyalur', 'TN', 'Ariyalur');
add('cheyyar|thiruvannamalai|tiruvannamalai', 'TN', 'Tiruvannamalai');
add('madirai|madurai', 'TN', 'Madurai');
add('tambaram|pallavaram|guduvancheri|chengalpattu', 'TN', 'Chengalpattu');
add('sriperumbudur|kancheepuram|kanchipuram', 'TN', 'Kanchipuram');
add('tirupattur|tirupathur|thirupathur', 'TN', 'Tirupathur');
add('tiruchy|musiri|lalgudi', 'TN', 'Tiruchirappalli');
add('chengalpet|maraimalai nagar', 'TN', 'Chengalpattu');
add('pudukottai|pudukkotai|gandarvakottai|aranthangi', 'TN', 'Pudukkottai');
add('perundhurai|bhavani|anthiyur|nambiyur', 'TN', 'Erode');
add('tirukoilur|thirukoilur|sankarapuram', 'TN', 'Kallakurichi');
add('channai|chenai|chennnai', 'TN', 'Chennai');
add('tvmali|tiruvanamalai|thiruvanamalai', 'TN', 'Tiruvannamalai');
add('gingee|senji|tindivanam', 'TN', 'Viluppuram');
add('karamadai|valparai|annur', 'TN', 'Coimbatore');
add('vedaranyam|vedaraniyam', 'TN', 'Nagapattinam');
add('pondi', 'PY', 'Pondicherry');
add('mysuru|mysore', 'KA', 'Mysuru');
add('belgaum|belagavi', 'KA', 'Belagavi');
add('malappuram', 'KL', 'Malappuram');
// outside Tamil Nadu (state codes + district names as already stored in userdetail)
add('bangalore|bengaluru|banglore|bengalore|bangaluru', 'KA', 'Bengaluru (Bangalore) Urban');
add('pondicherry|puducherry|pondy', 'PY', 'Pondicherry');
add('karaikal', 'PY', 'Karaikal');
add('hyderabad', 'TS', 'Hyderabad');
add('mumbai', 'MH', 'Mumbai City');
add('pune', 'MH', 'Pune');
add('thane', 'MH', 'Thane');
add('surat', 'GJ', 'Surat');
add('palakkad', 'KL', 'Palakkad');
add('ernakulam|kochi|cochin', 'KL', 'Ernakulam');
add('trivandrum|thiruvananthapuram', 'KL', 'Thiruvananthapuram');
add('thrissur', 'KL', 'Thrissur');
add('kozhikode|calicut', 'KL', 'Kozhikode');
add('nellore', 'AP', 'Nellore');
add('chittoor', 'AP', 'Chittoor');
add('guntur', 'AP', 'Guntur');
// state-only phrases (used only when no town/district matched)
const STATE_ONLY = { 'tamil nadu': 'TN', tamilnadu: 'TN', tn: 'TN', kerala: 'KL', karnataka: 'KA', andhra: 'AP', telangana: 'TS' };

const ALIAS_KEYS = Object.keys(ALIAS).filter((k) => ALIAS[k][1]).sort((a, b) => b.length - a.length);

function cleanLocation(raw) {
  const text = ' ' + String(raw || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim() + ' ';
  if (text.trim() === '') return null;
  // an explicit "Chennai" always wins ("sriperumbudur, chennai", "chennai tambaram" ...)
  if (/\bchennai\b|\bmadras\b|\bchennal\b/.test(text)) return { state: 'TN', district: 'Chennai' };
  for (const k of ALIAS_KEYS) if (text.includes(' ' + k + ' ')) return { state: ALIAS[k][0], district: ALIAS[k][1] };
  for (const k of Object.keys(STATE_ONLY)) if (text.includes(' ' + k + ' ')) return { state: STATE_ONLY[k], district: null };
  return null;
}

// "2026-06-18 22:09" is IST (UTC+5:30) -> UTC Date
function istToDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - 330 * 60 * 1000);
}

async function rollback(db, file) {
  const ids = JSON.parse(fs.readFileSync(file, 'utf8')).insertedIds.map((s) => new ObjectId(s));
  console.log(`Rollback: will delete ${ids.length} docs by _id from the ids file ONLY.`);
  const res = await db.collection('userdetail').deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${res.deletedCount} docs.`);
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not found - run from the greensigma-dashboard-backend folder');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('admin');
  const col = db.collection('userdetail');

  if (rbIdx >= 0) { await rollback(db, args[rbIdx + 1]); await client.close(); return; }

  console.log(COMMIT ? '*** COMMIT MODE: documents WILL be inserted ***' : '--- DRY RUN: nothing will be written (add --commit to insert) ---');

  // 1) people from the consolidated CSV
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '')).slice(1).filter((r) => r.length >= 4);
  console.log(`CSV people: ${rows.length}`);

  // 2) live userdetail -> skip anyone already present (email OR mobile OR whatsappNumber)
  const existing = await col.find({}).project({ email: 1, mobile: 1, whatsappNumber: 1 }).toArray();
  const P = new Set(), E = new Set();
  for (const d of existing) {
    const a = phone10(d.mobile), b = phone10(d.whatsappNumber), e = normEmail(d.email);
    if (a) P.add(a); if (b) P.add(b); if (e) E.add(e);
  }
  const countBefore = existing.length;
  console.log(`userdetail docs now: ${countBefore}`);

  // 3) location fallback list
  const uploads = await db.collection('location_uploads').find({}).project({ phone: 1, email: 1, location: 1 }).toArray();
  const locByPhone = new Map(), locByEmail = new Map();
  for (const u of uploads) {
    const p = phone10(u.phone), e = normEmail(u.email);
    if (p && u.location && !locByPhone.has(p)) locByPhone.set(p, u.location);
    if (e && u.location && !locByEmail.has(e)) locByEmail.set(e, u.location);
  }

  // 4) build new docs
  const docs = [];
  const skipped = { alreadyInDb: 0, noPhone: 0, noEmail: 0, dupInCsv: 0, badDate: 0 };
  const skippedNoPhone = [];
  const unmatched = [];
  const seenP = new Set(), seenE = new Set();
  let withDistrict = 0, withStateOnly = 0;
  const distCount = {};
  const yearCount = {};

  for (const r of rows) {
    const [name, emailRaw, numRaw, dateRaw] = r;
    const email = normEmail(emailRaw), mobile = phone10(numRaw);
    if (!mobile) { skipped.noPhone++; skippedNoPhone.push(r.join(',')); continue; }
    if (!email) { skipped.noEmail++; continue; }
    if (P.has(mobile) || E.has(email)) { skipped.alreadyInDb++; continue; }
    if (seenP.has(mobile) || seenE.has(email)) { skipped.dupInCsv++; continue; }
    const createdOn = istToDate(dateRaw);
    if (!createdOn) { skipped.badDate++; continue; }
    seenP.add(mobile); seenE.add(email);

    const doc = { name: (name || '').trim(), email, mobile, whatsappNumber: mobile };
    const rawLoc = locByPhone.get(mobile) || locByEmail.get(email);
    if (rawLoc) {
      const loc = cleanLocation(rawLoc);
      if (loc) {
        doc.state = loc.state;
        if (loc.district) { doc.district = loc.district; withDistrict++; distCount[loc.district] = (distCount[loc.district] || 0) + 1; }
        else withStateOnly++;
      } else unmatched.push(`"${String(rawLoc).replace(/"/g, '""')}",${mobile}`);
    }
    doc.type = 'Webinar';
    // referral code follows the registration year (IST): 2026 -> SIGMA2026, 2025 -> SIGMA2025, 2024 -> SIGMA2024
    const yr = new Date(createdOn.getTime() + 330 * 60 * 1000).getUTCFullYear();
    if (yr >= 2024) { doc.referalCode = 'SIGMA' + yr; doc.referalType = 'Webinar'; yearCount[yr] = (yearCount[yr] || 0) + 1; }
    else yearCount['before 2024'] = (yearCount['before 2024'] || 0) + 1;
    doc.createdOn = createdOn;
    doc.strategy = [];
    doc.token = '';
    docs.push(doc);
  }

  const toInsert = docs.slice(0, LIMIT);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.log('\n===== PLAN =====');
  console.log('Skipped:', JSON.stringify(skipped));
  console.log(`New users to insert: ${toInsert.length}${toInsert.length < docs.length ? ` (limited from ${docs.length})` : ''}`);
  console.log(`With cleaned district: ${withDistrict} | state only: ${withStateOnly} | location text we could not clean: ${unmatched.length}`);
  console.log('Top districts:', Object.entries(distCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' | '));
  console.log('Referral code by registration year:', JSON.stringify(yearCount));
  console.log('Sample doc:', JSON.stringify(toInsert[0]));
  if (skippedNoPhone.length) fs.writeFileSync(`skipped_no_phone_${stamp}.csv`, skippedNoPhone.join('\n'));
  if (unmatched.length) fs.writeFileSync(`unmatched_locations_${stamp}.csv`, 'location,mobile\n' + unmatched.join('\n'));
  if (skippedNoPhone.length || unmatched.length) console.log('Review files written: skipped_no_phone_*.csv / unmatched_locations_*.csv');

  if (!COMMIT) { console.log('\nDry run only. Nothing was written.'); await client.close(); return; }

  // 5) insert in batches, recording ids as we go
  const idsFile = `import_ids_${stamp}.json`;
  const insertedIds = [];
  let failed = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    try {
      const res = await col.insertMany(batch, { ordered: false });
      Object.values(res.insertedIds).forEach((id) => insertedIds.push(id.toString()));
    } catch (err) {
      // partial success is possible with ordered:false - keep the ids that did go in
      const ok = err.result && err.result.insertedIds ? err.result.insertedIds : [];
      (Array.isArray(ok) ? ok : Object.values(ok)).forEach((x) => insertedIds.push((x._id || x).toString()));
      failed += batch.length - (Array.isArray(ok) ? ok.length : Object.keys(ok).length);
      console.error('Batch error:', err.message);
    }
    fs.writeFileSync(idsFile, JSON.stringify({ at: new Date().toISOString(), insertedIds }));
    process.stdout.write(`\rInserted ${insertedIds.length}/${toInsert.length}`);
  }
  const countAfter = await col.countDocuments();
  console.log(`\n\n===== DONE =====`);
  console.log(`Inserted: ${insertedIds.length} | failed: ${failed}`);
  console.log(`userdetail count: ${countBefore} -> ${countAfter} (expected +${insertedIds.length})`);
  console.log(`Rollback file: ${idsFile}   (undo with: node import_missing_users.js --rollback ${idsFile})`);
  await client.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
