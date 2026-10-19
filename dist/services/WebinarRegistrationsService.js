"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebinarRegistrationsService = void 0;
const mongodb_1 = require("mongodb");
const database_1 = require("../config/database");
const COLLECTION = 'webinar_registrations';
function normalizePhone(raw) {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-10);
}
function normalizeEmail(raw) {
    return (raw || '').trim().toLowerCase();
}
const PERSON_SORT_FIELDS = ['name', 'phone', 'email', 'source', 'attempts', 'amount', 'paymentMethod', 'firstAttemptAt', 'paidAt'];
function sortRows(rows, sortBy, sortDir, allowed) {
    if (!sortBy || !allowed.includes(sortBy))
        return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (av == null && bv == null)
            return 0;
        if (av == null)
            return 1;
        if (bv == null)
            return -1;
        if (typeof av === 'number' && typeof bv === 'number')
            return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
    });
}
// `webinarId` is a recurring SLOT, not a one-time event — ops reuses the same ObjectId and just
// edits its date (and sometimes even its type — "fundamental" became "algo-investing" under the
// same id between two batches observed in this data) as the series rolls forward week to week.
// Each registration document snapshots webinarDate/webinarDateISO/webinarType as of when it was
// created, so the same raw webinarId can legitimately span several real calendar occurrences (e.g.
// one webinarId carried both "17th Oct 2026" and "24th Oct 2026" — 151 and 19 documents
// respectively). Grouping by webinarId ALONE therefore silently merges distinct occurrences into
// one bucket and drops the others from the picker. The real unique key for "one webinar occurrence"
// is the (webinarId, webinarDateISO) PAIR — every public id this service hands out is that pair
// encoded as `${webinarId}_${webinarDateISO}`, never the raw webinarId alone.
function encodeOccurrenceId(webinarId, webinarDateISO) {
    return `${String(webinarId)}_${webinarDateISO}`;
}
function decodeOccurrenceId(occurrenceId) {
    const match = occurrenceId.match(/^([0-9a-fA-F]{24})_(\d{4}-\d{2}-\d{2})$/);
    if (!match)
        throw new Error('Invalid webinar occurrence id');
    return { webinarId: new mongodb_1.ObjectId(match[1]), webinarDateISO: match[2] };
}
class WebinarRegistrationsService {
    // ============ Webinar picker ============
    async listWebinars() {
        const db = (0, database_1.getDatabase)();
        const groups = await db
            .collection(COLLECTION)
            .aggregate([
            { $match: { webinarId: { $ne: null }, webinarDateISO: { $ne: null }, webinarDate: { $ne: null } } },
            {
                $group: {
                    _id: { webinarId: '$webinarId', webinarDateISO: '$webinarDateISO' },
                    webinarType: { $first: '$webinarType' },
                    webinarDate: { $first: '$webinarDate' },
                    webinarTime: { $first: '$webinarTime' },
                    totalDocs: { $sum: 1 },
                },
            },
            { $sort: { '_id.webinarDateISO': -1 } },
        ])
            .toArray();
        return groups.map((g) => ({
            id: encodeOccurrenceId(g._id.webinarId, g._id.webinarDateISO),
            webinarType: g.webinarType || '',
            webinarDate: g.webinarDate,
            webinarDateISO: g._id.webinarDateISO,
            webinarTime: g.webinarTime || '',
            label: `${g.webinarDate} ${this.titleCase(g.webinarType)}`,
            totalDocs: g.totalDocs,
        }));
    }
    titleCase(s) {
        return (s || '').split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
    }
    // ============ Core: load + dedupe into one row per person ============
    async loadDocs(occurrenceId) {
        const { webinarId, webinarDateISO } = decodeOccurrenceId(occurrenceId);
        const db = (0, database_1.getDatabase)();
        return db
            .collection(COLLECTION)
            .find({ webinarId, webinarDateISO })
            .sort({ createdAt: 1 })
            .toArray();
    }
    // Groups every attempt by person (normalized phone) and classifies them into exactly one of the
    // three categories. A person with several documents (abandoned once, came back and paid) is
    // classified by the BEST outcome across all their attempts — succeeding on attempt 2 still counts
    // as a successful registrant, never as "failed"/"not paid", since this collection is a transaction
    // log, not a one-row-per-person table.
    buildPersonRows(docs) {
        const byPhone = new Map();
        for (const d of docs) {
            const key = normalizePhone(d.phone || d.buyerContact);
            if (!key)
                continue;
            if (!byPhone.has(key))
                byPhone.set(key, []);
            byPhone.get(key).push(d);
        }
        const rows = [];
        for (const [key, group] of byPhone) {
            const successDoc = group.find((d) => d.status === 'success');
            const failedDoc = group.find((d) => d.status === 'failed');
            const status = successDoc ? 'success' : failedDoc ? 'failed' : 'notpaid';
            // Prefer the success doc's own details (buyerEmail/buyerContact/tracking only populate once
            // Razorpay actually captures the payment); fall back to the most recent attempt otherwise.
            const latest = group[group.length - 1];
            const primary = successDoc || latest;
            const anyWithEmail = group.find((d) => d.buyerEmail);
            const anyWithSource = group.slice().reverse().find((d) => d.tracking?.sourceUrl);
            const firstAttemptAt = group.reduce((min, d) => (d.createdAt < min ? d.createdAt : min), group[0].createdAt);
            // "Welcome message sent" = the post-payment Telegram message (the channel the Owner pointed to
            // directly in the Mongo screenshot) actually went out — `detail.sent === true` is the concrete
            // delivery confirmation, `state === 'sent'` as a fallback for any doc shape variance.
            const telegram = successDoc?.messages?.telegram;
            const welcomeMessageSent = !!(telegram?.detail?.sent === true || telegram?.state === 'sent');
            rows.push({
                key,
                name: primary.name || latest.name || '',
                phone: primary.buyerContact || primary.phone || latest.phone || '',
                email: normalizeEmail(anyWithEmail?.buyerEmail) || null,
                source: anyWithSource?.tracking?.sourceUrl || null,
                attempts: group.length,
                amount: successDoc?.amount ?? null,
                paymentMethod: successDoc?.paymentMethod || null,
                welcomeMessageSent,
                status,
                firstAttemptAt: firstAttemptAt.toISOString(),
                paidAt: successDoc ? (successDoc.verifiedAt || successDoc.updatedAt).toISOString() : null,
            });
        }
        return rows;
    }
    async getSummary(occurrenceId) {
        const docs = await this.loadDocs(occurrenceId);
        const people = this.buildPersonRows(docs);
        const successRows = people.filter((p) => p.status === 'success');
        const amountCollected = successRows.reduce((sum, p) => sum + (p.amount || 0), 0);
        return {
            totalRegistered: successRows.length,
            failed: people.filter((p) => p.status === 'failed').length,
            notPaid: people.filter((p) => p.status === 'notpaid').length,
            amountCollected,
            welcomeMessageSent: successRows.filter((p) => p.welcomeMessageSent).length,
            totalAttempts: docs.length,
            totalDistinctPeople: people.length,
        };
    }
    matchesSearch(fields, search) {
        if (!search)
            return true;
        const q = search.trim().toLowerCase();
        if (!q)
            return true;
        return fields.some((f) => (f || '').toLowerCase().includes(q));
    }
    // 'all' means every distinct person regardless of outcome — still one row per PERSON with their
    // own `attempts` count, never one row per raw transaction document (the whole point of the
    // person-level dedup above; "all" only widens which people are included, not the row grain).
    async filteredRows(occurrenceId, category, search) {
        const docs = await this.loadDocs(occurrenceId);
        const people = this.buildPersonRows(docs);
        return people
            .filter((p) => category === 'all' || p.status === category)
            .filter((p) => this.matchesSearch([p.name, p.phone, p.email], search));
    }
    async getTable(occurrenceId, category, page, pageSize, sortBy, sortDir = 'desc', search) {
        const rows = sortRows(await this.filteredRows(occurrenceId, category, search), sortBy, sortDir, PERSON_SORT_FIELDS);
        const total = rows.length;
        const start = (page - 1) * pageSize;
        return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
    }
    // ============ CSV download ============
    csvFieldEscape(val) {
        return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
    }
    buildRawCsv(rows) {
        const header = 'Name,Number,Email,Source,Attempts,Status,Amount,Payment Method,Welcome Message Sent,First Attempt,Paid On\n';
        const statusLabel = { success: 'Paid', failed: 'Failed', notpaid: 'Not Paid' };
        const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
        const body = rows
            .map((r) => [
            r.name,
            r.phone,
            r.email || '',
            r.source || '',
            String(r.attempts),
            statusLabel[r.status],
            r.amount != null ? String(r.amount) : '',
            r.paymentMethod || '',
            r.welcomeMessageSent ? 'Yes' : 'No',
            fmtDate(r.firstAttemptAt),
            r.paidAt ? fmtDate(r.paidAt) : '',
        ]
            .map((v) => this.csvFieldEscape(String(v)))
            .join(','))
            .join('\n');
        return header + body;
    }
    // Matches AiSensy's real bulk-contact import schema exactly (see WebinarAnalysisService for the
    // reference export this was confirmed against): Source and the five custom lead-qualification
    // fields are always left blank for a bulk list where we don't have per-contact answers.
    buildAisensyCsv(rows, tag) {
        const header = 'Name,Mobile Number,Source,Tags,Experience,Challenge,Timeline,Capital,DecisionMaker\n';
        const body = rows
            .filter((r) => r.phone)
            .map((r) => [this.csvFieldEscape(r.name), r.phone, '', this.csvFieldEscape(tag), '', '', '', '', ''].join(','))
            .join('\n');
        return header + body;
    }
    async downloadCsv(occurrenceId, category, sortBy, sortDir = 'desc', search, format = 'raw', tag = '') {
        const rows = sortRows(await this.filteredRows(occurrenceId, category, search), sortBy, sortDir, PERSON_SORT_FIELDS);
        return format === 'aisensy' ? this.buildAisensyCsv(rows, tag) : this.buildRawCsv(rows);
    }
}
exports.WebinarRegistrationsService = WebinarRegistrationsService;
//# sourceMappingURL=WebinarRegistrationsService.js.map