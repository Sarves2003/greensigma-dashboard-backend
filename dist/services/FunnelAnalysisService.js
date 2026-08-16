"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunnelAnalysisService = void 0;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const mongodb_1 = require("mongodb");
const database_1 = require("../config/database");
const WEBINAR_REGISTRATIONS_CSV_URL = process.env.WEBINAR_REGISTRATIONS_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmL4IPqIR0FI5gpD1B9d75Flo-M_FV79pD12k2204zTJRdrTnjrnDIO7RaYtAizQGlo7fbfx23jfJ4/pub?gid=396802957&single=true&output=csv';
const WEBINAR_PAID_CSV_URL = process.env.WEBINAR_PAID_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUirjwWnGgKXI6-u5PHlpjuiNastnqr_FBdIfMFthKOoQLrKz_4McjONeLYgy10BCcdV3eKLo-vqvr/pub?gid=444686195&single=true&output=csv';
const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;
const GENERIC_REFERRAL_CODES = new Set(['SIGMA2026', 'SIGMA2025']);
const DEFAULT_BATCH_DATES = [
    '21Jun2025', '5July2025', '19July2025', '2Aug2025', '16Aug2025', '30Aug2025',
    '13Sep2025', '27Sep2025', '4Oct2025', '11Oct2025', '25Oct2025', '08Nov2025',
    '22Nov2025', '06Dec2025', '20Dec-2025', '03Jan2026', '17Jan2026', '31Jan2026',
    '7Feb2026', '14Feb2026', '21Feb2026', '14Mar2026', '4Apr2026', '18Apr2026',
    '9May2026', '23May2026', '6Jun2026', '20Jun2026', '4Jul2026', '18Jul2026', '1Aug2026',
];
const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
// Parses compact forms like "21Jun2025", "03Jan2026", "20Dec-2025".
function parseFlexibleDate(raw) {
    if (!raw)
        return null;
    const s = raw.trim().replace(/[-/]/g, '').toLowerCase();
    const m = s.match(/^(\d{1,2})([a-z]+)(\d{4})$/);
    if (!m)
        return null;
    const day = parseInt(m[1], 10);
    const month = MONTH_MAP[m[2]] ?? MONTH_MAP[m[2].slice(0, 3)] ?? MONTH_MAP[m[2].slice(0, 4)];
    const year = parseInt(m[3], 10);
    if (month === undefined || isNaN(day) || isNaN(year))
        return null;
    return new Date(Date.UTC(year, month, day));
}
// Parses "Momentum Investing Webinar - 20th JUNE 2026" style Offering strings.
function parseOfferingDate(offering) {
    if (!offering)
        return null;
    const m = offering.match(/(\d{1,2})\w*\s+([A-Za-z]+)\s+(\d{4})/);
    if (!m)
        return null;
    const day = parseInt(m[1], 10);
    const monthKey = m[2].toLowerCase();
    const month = MONTH_MAP[monthKey] ?? MONTH_MAP[monthKey.slice(0, 3)] ?? MONTH_MAP[monthKey.slice(0, 4)];
    const year = parseInt(m[3], 10);
    if (month === undefined || isNaN(day) || isNaN(year))
        return null;
    return new Date(Date.UTC(year, month, day));
}
function normalizePhone(raw) {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-10);
}
function normalizeEmail(raw) {
    return (raw || '').trim().toLowerCase();
}
// Post-2019 Tamil Nadu district split spun Chennai's metro suburbs off into their own official
// districts — these are the ones that show up in userdetail.district for people who are
// practically Chennai-metro but whose district literally says something else. Only consulted when
// strictChennai is off; when it's on, only the literal word "Chennai" counts, nothing nearby.
const CHENNAI_NEARBY_AREAS = [
    'chengalpattu', 'tiruvallur', 'kanchipuram', 'tambaram', 'ambattur', 'avadi',
    'poonamallee', 'sriperumbudur', 'pallavaram', 'chromepet', 'maraimalai nagar',
];
// userdetail.district is a clean controlled value ("Chennai" exact); the uploaded fallback sheet's
// location column is free text of unknown shape, so it's matched more loosely (substring contains).
function classifyLocation(district, uploadedLocation, strictChennai) {
    const d = (district || '').trim().toLowerCase();
    if (d === 'chennai')
        return 'chennai';
    if (!strictChennai && CHENNAI_NEARBY_AREAS.some((area) => d.includes(area)))
        return 'chennai';
    if (d)
        return 'non-chennai';
    const u = (uploadedLocation || '').trim().toLowerCase();
    if (u.includes('chennai'))
        return 'chennai';
    if (!strictChennai && CHENNAI_NEARBY_AREAS.some((area) => u.includes(area)))
        return 'chennai';
    if (u)
        return 'non-chennai';
    return 'unknown';
}
// Referral codes are free-typed at signup-link creation time, so the same promo code can land in
// the DB as "stonkzz26", "Stonkzz26", "STONKZZ26", etc. Without normalizing, those fragment into
// separate funnel rows instead of one — capitalize to a single canonical form before anything else
// touches the code (including the SIGMA2026/2025 generic-code check below).
function normalizeReferralCode(raw) {
    const trimmed = (raw || '').trim();
    return trimmed ? trimmed.toUpperCase() : null;
}
class FunnelAnalysisService {
    constructor() {
        this.registrationCache = null;
        this.paidCache = null;
    }
    // ============ Webinar batch dates (user-managed, persisted) ============
    async getBatchDates() {
        const db = (0, database_1.getDatabase)();
        const col = db.collection('webinar_batch_dates');
        const count = await col.countDocuments();
        if (count === 0) {
            const seeded = DEFAULT_BATCH_DATES.map((raw) => {
                const date = parseFlexibleDate(raw);
                return { date: date, label: raw };
            }).filter((d) => d.date);
            if (seeded.length > 0) {
                await col.insertMany(seeded);
            }
        }
        return col.find().sort({ date: 1 }).toArray();
    }
    async addBatchDate(dateStr) {
        const db = (0, database_1.getDatabase)();
        const date = new Date(dateStr);
        if (isNaN(date.getTime()))
            throw new Error('Invalid date');
        await db.collection('webinar_batch_dates').insertOne({
            date,
            label: date.toISOString().slice(0, 10),
        });
    }
    async removeBatchDate(id) {
        const db = (0, database_1.getDatabase)();
        await db.collection('webinar_batch_dates').deleteOne({ _id: new mongodb_1.ObjectId(id) });
    }
    async getSortedMasterDates() {
        const docs = await this.getBatchDates();
        return docs.map((d) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
    }
    resolveBatch(rawDate, masterDates) {
        const parsed = parseFlexibleDate(rawDate);
        if (!parsed)
            return { batch: null, method: 'unparseable' };
        const exact = masterDates.find((md) => md.getTime() === parsed.getTime());
        if (exact)
            return { batch: exact, method: 'exact' };
        const dmMatch = masterDates.find((md) => md.getUTCDate() === parsed.getUTCDate() && md.getUTCMonth() === parsed.getUTCMonth());
        if (dmMatch)
            return { batch: dmMatch, method: 'year-typo-fix' };
        let best = null;
        let bestDiff = Infinity;
        for (const md of masterDates) {
            const diff = Math.abs(parsed.getTime() - md.getTime()) / (1000 * 60 * 60 * 24);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = md;
            }
        }
        if (best && bestDiff <= 3)
            return { batch: best, method: 'nearest-day-fuzzy' };
        return { batch: null, method: 'unresolved' };
    }
    // ============ Sheet fetching (cached) ============
    async fetchRegistrations() {
        const now = Date.now();
        if (this.registrationCache && now - this.registrationCache.ts < SHEET_CACHE_TTL_MS) {
            return this.registrationCache.data;
        }
        const response = await axios_1.default.get(WEBINAR_REGISTRATIONS_CSV_URL, { responseType: 'text', timeout: 20000 });
        const records = (0, sync_1.parse)(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
        const rows = records.map((r) => {
            const offering = (r['Offering'] || '').trim();
            const bookedOnRaw = (r['Booked On'] || '').trim();
            return {
                name: (r['Name'] || '').trim(),
                phone: normalizePhone(r['Phone Number']),
                email: normalizeEmail(r['Email']),
                offering,
                webinarDate: parseOfferingDate(offering),
                bookedOn: bookedOnRaw ? new Date(bookedOnRaw.replace(',', '')) : null,
            };
        });
        this.registrationCache = { data: rows, ts: now };
        return rows;
    }
    async fetchPaidList() {
        const now = Date.now();
        if (this.paidCache && now - this.paidCache.ts < SHEET_CACHE_TTL_MS) {
            return this.paidCache.data;
        }
        const response = await axios_1.default.get(WEBINAR_PAID_CSV_URL, { responseType: 'text', timeout: 20000 });
        const records = (0, sync_1.parse)(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
        const rows = records.map((r) => ({
            name: (r['name'] || '').trim(),
            email: normalizeEmail(r['email']),
            phone: normalizePhone(r['whatsapp_number']),
            rawBatchDate: (r['Webinar Date'] || '').trim(),
        }));
        this.paidCache = { data: rows, ts: now };
        return rows;
    }
    // ============ Funnel tag computation (Segments 1 & 2) ============
    // Builds phone/email -> earliest webinar-attendance year, from the registrations sheet.
    async buildWebinarYearLookup() {
        const registrations = await this.fetchRegistrations();
        const byPhone = new Map();
        const byEmail = new Map();
        for (const r of registrations) {
            if (!r.webinarDate)
                continue;
            const year = r.webinarDate.getUTCFullYear();
            if (r.phone) {
                const existing = byPhone.get(r.phone);
                if (existing === undefined || year < existing)
                    byPhone.set(r.phone, year);
            }
            if (r.email) {
                const existing = byEmail.get(r.email);
                if (existing === undefined || year < existing)
                    byEmail.set(r.email, year);
            }
        }
        return { byPhone, byEmail };
    }
    // Webinar-driven and organic-default conversions are all one funnel — SIGMA2026 — regardless of
    // which calendar year the webinar happened in, or whether referalCode literally says SIGMA2025.
    computeFunnelTag(referalCode, webinarYear) {
        const normalizedCode = normalizeReferralCode(referalCode);
        const specificCode = normalizedCode && !GENERIC_REFERRAL_CODES.has(normalizedCode) ? normalizedCode : null;
        const webinarTag = webinarYear ? 'SIGMA2026' : null;
        if (webinarTag && specificCode)
            return `${webinarTag}, ${specificCode}`;
        if (specificCode)
            return specificCode;
        return 'SIGMA2026';
    }
    async getTaggedUsers() {
        const db = (0, database_1.getDatabase)();
        const users = await db
            .collection('userdetail')
            .find({})
            .project({ referalCode: 1, type: 1, createdOn: 1, mobile: 1, whatsappNumber: 1, email: 1 })
            .toArray();
        const { byPhone, byEmail } = await this.buildWebinarYearLookup();
        return users.map((u) => {
            const phone = normalizePhone(u.mobile || u.whatsappNumber);
            const email = normalizeEmail(u.email);
            const webinarYear = (phone ? byPhone.get(phone) : undefined) ?? (email ? byEmail.get(email) : undefined) ?? null;
            const tag = this.computeFunnelTag(u.referalCode, webinarYear);
            return { tag, type: u.type, createdOn: new Date(u.createdOn) };
        });
    }
    // ============ Segment 1: period-filtered Tribe conversions by funnel tag ============
    async getSegment1(startDate, endDate) {
        const tagged = await this.getTaggedUsers();
        const periodTribe = tagged.filter((u) => u.type === 'Tribe' && u.createdOn >= startDate && u.createdOn < endDate);
        const counts = new Map();
        for (const u of periodTribe) {
            counts.set(u.tag, (counts.get(u.tag) || 0) + 1);
        }
        const total = periodTribe.length;
        const rows = [...counts.entries()]
            .map(([tag, count]) => ({
            tag,
            count,
            percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
        }))
            .sort((a, b) => b.count - a.count);
        return { total, rows };
    }
    // ============ Segment 2: all-time per-funnel conversion table ============
    async getSegment2() {
        const tagged = await this.getTaggedUsers();
        const totals = new Map();
        const conversions = new Map();
        for (const u of tagged) {
            totals.set(u.tag, (totals.get(u.tag) || 0) + 1);
            if (u.type === 'Tribe') {
                conversions.set(u.tag, (conversions.get(u.tag) || 0) + 1);
            }
        }
        const rows = [...totals.entries()]
            .map(([tag, total]) => {
            const converted = conversions.get(tag) || 0;
            return {
                tag,
                total,
                converted,
                conversionRate: total > 0 ? parseFloat(((converted / total) * 100).toFixed(1)) : 0,
            };
        })
            .sort((a, b) => b.total - a.total);
        return { rows };
    }
    // ============ Segment 3: webinar batch analysis (paid sheet + registrations) ============
    async getSegment3() {
        const [paidRows, registrations, masterDates] = await Promise.all([
            this.fetchPaidList(),
            this.fetchRegistrations(),
            this.getSortedMasterDates(),
        ]);
        // Resolve each paid row to a master batch date.
        const resolved = paidRows.map((r) => ({
            ...r,
            resolution: this.resolveBatch(r.rawBatchDate, masterDates),
        }));
        const unresolvedCount = resolved.filter((r) => r.resolution.batch === null).length;
        // Registrants per ORIGINAL webinar occurrence (denominator), keyed by that webinar's own date.
        const registrantsByDate = new Map();
        for (const r of registrations) {
            if (!r.webinarDate)
                continue;
            const key = r.webinarDate.toISOString().slice(0, 10);
            registrantsByDate.set(key, (registrantsByDate.get(key) || 0) + 1);
        }
        // Conversions credited per batch.
        const conversionsByBatch = new Map();
        for (const r of resolved) {
            if (!r.resolution.batch)
                continue;
            const key = r.resolution.batch.toISOString().slice(0, 10);
            conversionsByBatch.set(key, (conversionsByBatch.get(key) || 0) + 1);
        }
        const batchRows = masterDates.map((md) => {
            const key = md.toISOString().slice(0, 10);
            const registrants = registrantsByDate.get(key) || 0;
            const converted = conversionsByBatch.get(key) || 0;
            return {
                label: key,
                registrants,
                converted,
                // null (not 0) when there's no registration data at all for this webinar (e.g. it predates
                // the paid-registration tracking) — a real 0% would mean registrants existed but none converted.
                conversionRate: registrants > 0 ? parseFloat(((converted / registrants) * 100).toFixed(1)) : null,
            };
        });
        // Attempt-number analysis: for each resolved paid person, count how many times they
        // registered (any webinar date) up to and including their credited batch date.
        const regsByPhone = new Map();
        const regsByEmail = new Map();
        for (const r of registrations) {
            if (!r.webinarDate)
                continue;
            if (r.phone) {
                if (!regsByPhone.has(r.phone))
                    regsByPhone.set(r.phone, []);
                regsByPhone.get(r.phone).push(r.webinarDate);
            }
            if (r.email) {
                if (!regsByEmail.has(r.email))
                    regsByEmail.set(r.email, []);
                regsByEmail.get(r.email).push(r.webinarDate);
            }
        }
        const attemptCounts = new Map();
        let attemptDataAvailable = 0;
        for (const r of resolved) {
            if (!r.resolution.batch)
                continue;
            const datesByPhone = r.phone ? regsByPhone.get(r.phone) : undefined;
            const datesByEmail = r.email ? regsByEmail.get(r.email) : undefined;
            const dates = datesByPhone && datesByPhone.length > 0 ? datesByPhone : datesByEmail;
            if (!dates || dates.length === 0)
                continue;
            const attemptNumber = dates.filter((d) => d.getTime() <= r.resolution.batch.getTime()).length;
            if (attemptNumber > 0) {
                attemptCounts.set(attemptNumber, (attemptCounts.get(attemptNumber) || 0) + 1);
                attemptDataAvailable++;
            }
        }
        const attemptRows = [...attemptCounts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([attempt, count]) => ({
            attempt,
            count,
            percentage: attemptDataAvailable > 0 ? parseFloat(((count / attemptDataAvailable) * 100).toFixed(1)) : 0,
        }));
        return {
            batchRows,
            totalPaid: paidRows.length,
            resolvedPaid: paidRows.length - unresolvedCount,
            unresolvedCount,
            attemptRows,
            attemptDataAvailable,
        };
    }
    // ============ Per-batch detail: registrants, paid, and where those paid people actually came from ============
    // For each paid person credited to a batch, trace their real origin: did they register for THIS
    // webinar (Current Webinar), a DIFFERENT one (bucketed by that webinar's date, using their
    // earliest registration if they have several), or none at all (fall back to their userdetail
    // referalCode, same normalization as computeFunnelTag).
    async getWebinarBatchDetail(requestedKeys, strictChennai = false) {
        const [paidRows, registrations, masterDates] = await Promise.all([
            this.fetchPaidList(),
            this.fetchRegistrations(),
            this.getSortedMasterDates(),
        ]);
        const dateKeys = requestedKeys && requestedKeys.length > 0
            ? requestedKeys
            : masterDates.slice(-2).reverse().map((d) => d.toISOString().slice(0, 10));
        const resolved = paidRows.map((r) => ({ ...r, resolution: this.resolveBatch(r.rawBatchDate, masterDates) }));
        const registrantsByDate = new Map();
        for (const r of registrations) {
            if (!r.webinarDate)
                continue;
            const key = r.webinarDate.toISOString().slice(0, 10);
            registrantsByDate.set(key, (registrantsByDate.get(key) || 0) + 1);
        }
        const regDatesByPhone = new Map();
        const regDatesByEmail = new Map();
        for (const r of registrations) {
            if (!r.webinarDate)
                continue;
            if (r.phone) {
                if (!regDatesByPhone.has(r.phone))
                    regDatesByPhone.set(r.phone, []);
                regDatesByPhone.get(r.phone).push(r.webinarDate);
            }
            if (r.email) {
                if (!regDatesByEmail.has(r.email))
                    regDatesByEmail.set(r.email, []);
                regDatesByEmail.get(r.email).push(r.webinarDate);
            }
        }
        const db = (0, database_1.getDatabase)();
        const users = await db
            .collection('userdetail')
            .find({})
            .project({ mobile: 1, whatsappNumber: 1, email: 1, referalCode: 1, createdOn: 1, district: 1 })
            .toArray();
        const userByPhone = new Map();
        const userByEmail = new Map();
        for (const u of users) {
            const phone = normalizePhone(u.mobile || u.whatsappNumber);
            const email = normalizeEmail(u.email);
            if (phone && !userByPhone.has(phone))
                userByPhone.set(phone, u);
            if (email && !userByEmail.has(email))
                userByEmail.set(email, u);
        }
        // Fallback location source for anyone missing a district in userdetail — populated via the
        // Owner-uploaded CSV/Excel list (see LocationUploadService). Safe to query even if the
        // collection is empty/doesn't exist yet: just yields no fallback matches.
        const uploads = await db.collection('location_uploads').find({}).project({ phone: 1, email: 1, location: 1 }).toArray();
        const uploadLocationByPhone = new Map();
        const uploadLocationByEmail = new Map();
        for (const u of uploads) {
            if (u.phone && !uploadLocationByPhone.has(u.phone))
                uploadLocationByPhone.set(u.phone, u.location);
            if (u.email && !uploadLocationByEmail.has(u.email))
                uploadLocationByEmail.set(u.email, u.location);
        }
        const resolveLocation = (phone, email) => {
            const u = (phone && userByPhone.get(phone)) || (email && userByEmail.get(email));
            const uploadedLocation = uploadLocationByPhone.get(phone) || uploadLocationByEmail.get(email);
            return classifyLocation(u?.district, uploadedLocation, strictChennai);
        };
        return dateKeys.map((key) => {
            const registrants = registrantsByDate.get(key) || 0;
            const paidForBatch = resolved.filter((r) => r.resolution.batch && r.resolution.batch.toISOString().slice(0, 10) === key);
            // person -> { bucket, startDate } — startDate is the webinar-offering date they registered
            // under (not "Booked On") for webinar buckets, or their userdetail.createdOn for funnel
            // buckets. null when we genuinely have no anchor point (Unknown bucket) — excluded from the
            // avg-days-to-pay calculation rather than skewing it with a guess.
            const breakdown = new Map();
            const daysToPay = [];
            for (const p of paidForBatch) {
                const datesFromPhone = p.phone ? regDatesByPhone.get(p.phone) : undefined;
                const datesFromEmail = p.email ? regDatesByEmail.get(p.email) : undefined;
                const dates = datesFromPhone && datesFromPhone.length > 0 ? datesFromPhone : datesFromEmail;
                let bucket;
                let startDate = null;
                const u = (p.phone && userByPhone.get(p.phone)) || (p.email && userByEmail.get(p.email));
                if (dates && dates.length > 0) {
                    const dateKeysForPerson = dates.map((d) => d.toISOString().slice(0, 10));
                    let webinarLabel;
                    if (dateKeysForPerson.includes(key)) {
                        webinarLabel = 'Current Webinar';
                        startDate = dates.find((d) => d.toISOString().slice(0, 10) === key);
                    }
                    else {
                        const earliest = dates.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
                        webinarLabel = earliest.toISOString().slice(0, 10);
                        startDate = earliest;
                    }
                    // A webinar match doesn't rule out also carrying a distinct referral code (e.g.
                    // KIRUBA2026) — when both are true, label the bucket as the combination so this person
                    // isn't silently folded into a plain webinar bucket indistinguishable from someone with
                    // no code at all. Buckets stay mutually exclusive (one row each), so counts/percentages
                    // still sum to the batch's total paid — SIGMA2026/2025 are the generic default, not a
                    // distinct signal, so they're never appended.
                    const normalizedCode = u ? normalizeReferralCode(u.referalCode) : null;
                    const hasSpecificCode = normalizedCode && !GENERIC_REFERRAL_CODES.has(normalizedCode);
                    bucket = hasSpecificCode ? `${webinarLabel}, ${normalizedCode}` : webinarLabel;
                }
                else if (!u) {
                    bucket = 'Unknown';
                }
                else {
                    const normalizedCode = normalizeReferralCode(u.referalCode);
                    bucket = normalizedCode && !GENERIC_REFERRAL_CODES.has(normalizedCode) ? normalizedCode : 'SIGMA2026';
                    startDate = u.createdOn ? new Date(u.createdOn) : null;
                }
                if (startDate) {
                    const paidDate = parseFlexibleDate(p.rawBatchDate);
                    if (paidDate)
                        daysToPay.push((paidDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                }
                if (!breakdown.has(bucket))
                    breakdown.set(bucket, []);
                breakdown.get(bucket).push({
                    name: p.name,
                    phone: p.phone,
                    email: p.email || null,
                    createdOn: u?.createdOn ? new Date(u.createdOn).toISOString() : null,
                });
            }
            const paid = paidForBatch.length;
            const breakdownRows = [...breakdown.entries()]
                .map(([source, people]) => ({
                source,
                count: people.length,
                percentage: paid > 0 ? parseFloat(((people.length / paid) * 100).toFixed(1)) : 0,
                people,
            }))
                .sort((a, b) => b.count - a.count);
            const avgDaysToPay = daysToPay.length > 0
                ? parseFloat((daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length).toFixed(1))
                : null;
            // Chennai vs. Non-Chennai split of this webinar's registrants, and how many of each went on
            // to pay (matched back into paidForBatch by phone/email). Unregistered/unknown-location
            // registrants aren't shown as their own card, but they are the reason chennai% + non-chennai%
            // won't always add up to 100.
            const regsForBatch = registrations.filter((r) => r.webinarDate && r.webinarDate.toISOString().slice(0, 10) === key);
            const paidPhones = new Set(paidForBatch.map((p) => p.phone).filter(Boolean));
            const paidEmails = new Set(paidForBatch.map((p) => p.email).filter(Boolean));
            let chennaiRegistrants = 0;
            let nonChennaiRegistrants = 0;
            let chennaiPaidCount = 0;
            let nonChennaiPaidCount = 0;
            for (const r of regsForBatch) {
                const location = resolveLocation(r.phone, r.email);
                if (location === 'unknown')
                    continue;
                const isPaid = (r.phone && paidPhones.has(r.phone)) || (r.email && paidEmails.has(r.email));
                if (location === 'chennai') {
                    chennaiRegistrants++;
                    if (isPaid)
                        chennaiPaidCount++;
                }
                else {
                    nonChennaiRegistrants++;
                    if (isPaid)
                        nonChennaiPaidCount++;
                }
            }
            const totalRegsForBatch = regsForBatch.length;
            const chennaiRegistrantPct = totalRegsForBatch > 0 ? parseFloat(((chennaiRegistrants / totalRegsForBatch) * 100).toFixed(1)) : 0;
            const nonChennaiRegistrantPct = totalRegsForBatch > 0 ? parseFloat(((nonChennaiRegistrants / totalRegsForBatch) * 100).toFixed(1)) : 0;
            const chennaiConversionPct = chennaiRegistrants > 0 ? parseFloat(((chennaiPaidCount / chennaiRegistrants) * 100).toFixed(1)) : null;
            const nonChennaiConversionPct = nonChennaiRegistrants > 0 ? parseFloat(((nonChennaiPaidCount / nonChennaiRegistrants) * 100).toFixed(1)) : null;
            return {
                label: key,
                registrants,
                paid,
                avgDaysToPay,
                breakdown: breakdownRows,
                chennaiRegistrantPct,
                nonChennaiRegistrantPct,
                chennaiConversionPct,
                nonChennaiConversionPct,
                chennaiRegistrants,
                nonChennaiRegistrants,
                chennaiPaidCount,
                nonChennaiPaidCount,
            };
        });
    }
}
exports.FunnelAnalysisService = FunnelAnalysisService;
//# sourceMappingURL=FunnelAnalysisService.js.map