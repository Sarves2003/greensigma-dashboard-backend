"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivationTrackerService = void 0;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const database_1 = require("../config/database");
const WEBINAR_PAID_CSV_URL = process.env.WEBINAR_PAID_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUirjwWnGgKXI6-u5PHlpjuiNastnqr_FBdIfMFthKOoQLrKz_4McjONeLYgy10BCcdV3eKLo-vqvr/pub?gid=444686195&single=true&output=csv';
// This spreadsheet publishes one tab per day — each a separate Google Form ("Day-0" asks about
// the onboarding session, "Day-1" asks about Module 1&2, etc.) rather than one shared form with a
// day field. So "did this phone number complete Day N" is answered by tab membership, not by how
// long after the batch date they happened to submit — someone can fill the Day-0 form a week late
// and it still counts as Day 0. Only tabs for Day-0..Day-5 exist on the sheet; Day 6/7 have no
// sheet source and are manual-override-only.
const ACTIVATION_TRACKING_BASE_URL = process.env.ACTIVATION_TRACKING_CSV_BASE_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4aam-8-IvDS35mF_VNZxsIpw2vVyG3LCBSTjgOyfzfEbAhJGndAUatdoUpZ31r33QdKNg_JSrAMkB/pub';
const DAY_TAB_GIDS = {
    0: '0',
    1: '1345834529',
    2: '1060108335',
    3: '1084502859',
    4: '290749006',
    5: '1080660820',
};
const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;
const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
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
// The sheet's "Submitted at" timestamps aren't zero-padded (e.g. "2026-08-17 3:43:23"), and
// `new Date(str.replace(' ', 'T'))` silently returns Invalid Date for any single-digit hour —
// meaning every submission before 10am was getting dropped as if it never happened. Parsing the
// components manually and building the Date from numeric parts sidesteps the ISO-strictness
// entirely, since the multi-arg Date constructor doesn't care about padding.
function parseSheetTimestamp(raw) {
    const trimmed = (raw || '').trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m)
        return null;
    const [, year, month, day, hour, minute, second] = m.map(Number);
    const dt = new Date(year, month - 1, day, hour, minute, second);
    return isNaN(dt.getTime()) ? null : dt;
}
function normalizePhone(raw) {
    const digits = (raw || '').toString().replace(/\D/g, '');
    return digits.slice(-10);
}
// The sheet has no clean payment-status field for recent rows — "Pinged(Yes/No)" is 900+ rows of
// free-typed sales notes ("Emandate done", "FULL PAID - 15k", "Ram pinged", "asking refund", ...).
// Best-effort keyword classification, not a guaranteed-clean field.
function classifyPaymentStatus(pingedRaw) {
    const s = (pingedRaw || '').trim().toLowerCase();
    if (s.includes('full paid'))
        return 'Full Paid';
    if (s.includes('emandate') && !s.includes('not completed') && !s.includes('failed'))
        return 'Emandate';
    return 'None';
}
class ActivationTrackerService {
    constructor() {
        this.paidCache = null;
        this.activationCache = null;
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
            email: (r['email'] || '').trim().toLowerCase(),
            phone: normalizePhone(r['whatsapp_number']),
            rawBatchDate: (r['Webinar Date'] || '').trim(),
            pinged: (r['Pinged(Yes/No)'] || '').trim(),
        }));
        this.paidCache = { data: rows, ts: now };
        return rows;
    }
    async fetchDayTab(gid) {
        const url = `${ACTIVATION_TRACKING_BASE_URL}?gid=${gid}&single=true&output=csv`;
        const response = await axios_1.default.get(url, { responseType: 'text', timeout: 20000 });
        const records = (0, sync_1.parse)(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
        const map = new Map();
        for (const r of records) {
            const phone = normalizePhone(r['Your Registered Phone Number']);
            if (!phone)
                continue;
            const submittedAt = parseSheetTimestamp(r['Submitted at']);
            if (!submittedAt)
                continue;
            const response = (r["Is there anything you'd like us to help you with?"] || '').trim();
            // Same phone can submit this day's form more than once — dedupe to one entry, keeping
            // whichever submission is most recent.
            const existing = map.get(phone);
            if (!existing || submittedAt.getTime() > existing.submittedAt.getTime()) {
                map.set(phone, { submittedAt, response });
            }
        }
        return map;
    }
    async fetchActivationByDay() {
        const now = Date.now();
        if (this.activationCache && now - this.activationCache.ts < SHEET_CACHE_TTL_MS) {
            return this.activationCache.data;
        }
        const dayEntries = Object.entries(DAY_TAB_GIDS);
        const results = await Promise.all(dayEntries.map(([, gid]) => this.fetchDayTab(gid)));
        const data = {};
        dayEntries.forEach(([dayStr], idx) => {
            data[parseInt(dayStr, 10)] = results[idx];
        });
        this.activationCache = { data, ts: now };
        return data;
    }
    async getActivationTable(batchDateKey) {
        const batchDate = new Date(`${batchDateKey}T00:00:00.000Z`);
        const [paidRows, activationByDay, remarkDocs] = await Promise.all([
            this.fetchPaidList(),
            this.fetchActivationByDay(),
            (0, database_1.getDatabase)().collection('activation_remarks').find({ batchDate: batchDateKey }).toArray(),
        ]);
        // Same resolution style as Funnel Analysis's Webinar Batch Analysis (exact, then day/month
        // ignoring year, then nearest within 3 days) — so "who belongs to this batch" agrees between
        // the two features rather than drifting apart.
        const matchesBatch = (rawBatchDate) => {
            const parsed = parseFlexibleDate(rawBatchDate);
            if (!parsed)
                return false;
            if (parsed.getTime() === batchDate.getTime())
                return true;
            if (parsed.getUTCDate() === batchDate.getUTCDate() && parsed.getUTCMonth() === batchDate.getUTCMonth())
                return true;
            const diffDays = Math.abs(parsed.getTime() - batchDate.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 3;
        };
        const paidForBatch = paidRows.filter((r) => matchesBatch(r.rawBatchDate));
        const remarkByPhone = new Map();
        const overridesByPhone = new Map();
        for (const r of remarkDocs) {
            remarkByPhone.set(r.phone, r.remark || '');
            overridesByPhone.set(r.phone, r.dayOverrides || {});
        }
        const rows = paidForBatch.map((p) => {
            const days = Array.from({ length: 8 }, () => ({ completed: false, response: null, submittedAt: null, manual: false }));
            // Days 0-5 each have their own dedicated form tab — a phone number showing up there means
            // that day is done, no matter when they actually submitted it. Days 6-7 have no sheet tab at
            // all, so they're manual-override-only.
            for (let dayNumber = 0; dayNumber <= 5; dayNumber++) {
                const submission = activationByDay[dayNumber]?.get(p.phone);
                if (submission) {
                    days[dayNumber] = { completed: true, response: submission.response || null, submittedAt: submission.submittedAt.toISOString(), manual: false };
                }
            }
            const overrides = overridesByPhone.get(p.phone) || {};
            for (const [dayStr, completed] of Object.entries(overrides)) {
                const dayNumber = parseInt(dayStr, 10);
                if (dayNumber < 0 || dayNumber > 7)
                    continue;
                days[dayNumber] = { ...days[dayNumber], completed, manual: true };
            }
            const score = days.filter((d) => d.completed).length;
            return {
                name: p.name,
                phone: p.phone,
                email: p.email,
                status: classifyPaymentStatus(p.pinged),
                days,
                score,
                remark: remarkByPhone.get(p.phone) || '',
            };
        });
        return { rows, batchDate: batchDateKey };
    }
    async saveRemark(phone, batchDate, remark) {
        const db = (0, database_1.getDatabase)();
        await db.collection('activation_remarks').updateOne({ phone, batchDate }, { $set: { phone, batchDate, remark, updatedAt: new Date() } }, { upsert: true });
    }
    // completed: true/false sets a manual override for that day; null clears it, reverting to
    // whatever the tracking sheet itself says (or blank, if the sheet has nothing for that day).
    async saveDayOverride(phone, batchDate, day, completed) {
        const db = (0, database_1.getDatabase)();
        const update = completed === null
            ? { $unset: { [`dayOverrides.${day}`]: '' }, $set: { phone, batchDate, updatedAt: new Date() } }
            : { $set: { phone, batchDate, [`dayOverrides.${day}`]: completed, updatedAt: new Date() } };
        await db.collection('activation_remarks').updateOne({ phone, batchDate }, update, { upsert: true });
    }
}
exports.ActivationTrackerService = ActivationTrackerService;
//# sourceMappingURL=ActivationTrackerService.js.map