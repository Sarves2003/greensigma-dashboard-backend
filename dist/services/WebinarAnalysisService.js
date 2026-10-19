"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebinarAnalysisService = void 0;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const mongodb_1 = require("mongodb");
const database_1 = require("../config/database");
const FunnelAnalysisService_1 = require("./FunnelAnalysisService");
const WEBINAR_REGISTRATIONS_CSV_URL = process.env.WEBINAR_REGISTRATIONS_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmL4IPqIR0FI5gpD1B9d75Flo-M_FV79pD12k2204zTJRdrTnjrnDIO7RaYtAizQGlo7fbfx23jfJ4/pub?gid=396802957&single=true&output=csv';
const WEBINAR_PAID_CSV_URL = process.env.WEBINAR_PAID_CSV_URL ||
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUirjwWnGgKXI6-u5PHlpjuiNastnqr_FBdIfMFthKOoQLrKz_4McjONeLYgy10BCcdV3eKLo-vqvr/pub?gid=444686195&single=true&output=csv';
const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;
const COLLECTION = 'webinar_analysis_batches';
const TRIBE_TYPES = new Set(['Tribe', 'TribeYearly']);
const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
// Zoom's CSV timestamps ("10/03/2026 06:50:24 PM") are the account's local time (IST for this org),
// but a plain `new Date(string)` parses them in the SERVER PROCESS's own ambient timezone — correct
// by accident on an IST dev machine, but off by 5:30 on a UTC-default production container (this
// backend's Docker image sets no TZ, so node:18-alpine defaults to UTC there). Parsed explicitly as
// IST here so every timestamp is the same correct absolute instant regardless of where this runs —
// this matters once a feature (Keyword tab) displays an actual wall-clock time to a human, not just
// relative diffs against other timestamps parsed the same way.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function parseIstDateTime(raw) {
    const m = (raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
    if (!m)
        return new Date(NaN);
    const [, moS, dS, yS, hS, miS, sS, ap] = m;
    let hour = parseInt(hS, 10) % 12;
    if (ap.toUpperCase() === 'PM')
        hour += 12;
    const utcMs = Date.UTC(parseInt(yS, 10), parseInt(moS, 10) - 1, parseInt(dS, 10), hour, parseInt(miS, 10), parseInt(sS, 10)) - IST_OFFSET_MS;
    return new Date(utcMs);
}
function normalizeEmail(raw) {
    return (raw || '').toString().trim().toLowerCase();
}
function normalizePhone(raw) {
    const digits = (raw || '').toString().replace(/\D/g, '');
    return digits.slice(-10);
}
// "20th JUNE 2026" / "3rd Oct 2026 Momentum Investing Webinar" style strings.
function parseLooseDate(text) {
    if (!text)
        return null;
    const m = text.match(/(\d{1,2})\w*\s+([A-Za-z]+)\s+(\d{4})/);
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
// The Full Paid sheet's "Webinar Date" column uses a different, separator-stripped compact form
// ("3October2026", "20Dec-2025") than the registrations sheet's "Offering" field — needs its own parser.
function parseCompactDate(raw) {
    if (!raw)
        return null;
    const s = raw.trim().replace(/[-/.\s]/g, '').toLowerCase();
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
// Generic post-filter, pre-pagination sort used by every table — only sorts on a whitelisted field
// per table (passed by the caller) so an unrecognized sortBy is a silent no-op, not a crash.
function sortRows(rows, sortBy, sortDir, allowedFields) {
    if (!sortBy || !allowedFields.includes(sortBy))
        return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (typeof av === 'boolean' || typeof bv === 'boolean')
            return (Number(av) - Number(bv)) * dir;
        if (typeof av === 'number' && typeof bv === 'number')
            return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
}
function dateOnly(d) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
function ordinalSuffix(day) {
    return day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
}
function ordinalLabel(d) {
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${day}${ordinalSuffix(day)} ${month}`;
}
// Same as ordinalLabel but with the year — used for anything that can span multiple years (a
// person's registration/payment history), where dropping the year (fine for "which webinar report
// am I currently looking at") would make two different years' batches look identical.
function ordinalLabelWithYear(d) {
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    return `${day}${ordinalSuffix(day)} ${month} ${year}`;
}
// "Momentum Investing Webinar - 20th JUNE 2026" -> "Momentum". Strips the date suffix and the
// generic "Investing"/"Webinar" filler words, keeping whatever's left as the short topic name
// (e.g. "Swing Trading Webinar - ..." -> "Swing Trading", not just "Swing").
function shortOfferingTopic(offering) {
    const topicPart = (offering || '').split(/\s[-–—]\s/)[0] || offering || '';
    const cleaned = topicPart.replace(/\b(investing|webinar)\b/gi, '').replace(/\s+/g, ' ').trim();
    return cleaned || topicPart.trim() || 'Webinar';
}
// Classic sweep-line over every join/leave segment (across every attendee, regardless of total
// duration or the attended threshold) to find the single moment the most people were in the room
// at once. Leave events are processed before join events at an identical timestamp so someone
// departing frees their slot before a simultaneous arrival is counted into the same peak.
function computePeakConcurrency(attendees) {
    const events = [];
    for (const a of attendees) {
        for (const s of a.sessions) {
            events.push({ time: s.joinTime.getTime(), delta: 1 });
            events.push({ time: s.leaveTime.getTime(), delta: -1 });
        }
    }
    if (events.length === 0)
        return { count: 0, atTime: null };
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let running = 0;
    let peak = 0;
    let peakTime = events[0].time;
    for (const e of events) {
        running += e.delta;
        if (running > peak) {
            peak = running;
            peakTime = e.time;
        }
    }
    return { count: peak, atTime: new Date(peakTime) };
}
// A naive sum of each session segment's own "Duration (minutes)" overstates total attendance
// whenever two segments overlap in real wall-clock time — which happens routinely (joining from a
// laptop and a phone at once for audio, a second browser tab, a brief dual-session during a
// reconnect). Confirmed from real data: every inflated total (e.g. 7h22m inside a 4h51m session)
// belonged to someone with an unusually high rejoin count, exactly what overlapping segments would
// produce. Fixed by merging overlapping/adjacent intervals and summing only the merged, disjoint
// duration — the per-person equivalent of the sweep-line above, so the result can never exceed the
// true wall-clock time between their first join and last leave.
function mergedAttendanceMinutes(sessions) {
    if (sessions.length === 0)
        return 0;
    const intervals = sessions.map((s) => ({ start: s.joinTime.getTime(), end: s.leaveTime.getTime() })).sort((a, b) => a.start - b.start);
    let totalMs = 0;
    let curStart = intervals[0].start;
    let curEnd = intervals[0].end;
    for (let i = 1; i < intervals.length; i++) {
        const seg = intervals[i];
        if (seg.start <= curEnd) {
            curEnd = Math.max(curEnd, seg.end);
        }
        else {
            totalMs += curEnd - curStart;
            curStart = seg.start;
            curEnd = seg.end;
        }
    }
    totalMs += curEnd - curStart;
    return totalMs / 60000;
}
// Mirrors EmandateTrackerService's classifyPaymentStatus: the sheet only carries anyone who has
// already paid at least the initial amount, so presence on it counts as "previously paid" unless
// the note explicitly says Refunded/Cancelled.
function sheetRowIsPaid(pingedRaw) {
    const s = (pingedRaw || '').trim().toLowerCase();
    if (s.includes('refund'))
        return false;
    if (s.includes('cancel'))
        return false;
    return true;
}
class WebinarAnalysisService {
    constructor() {
        this.registrationCache = null;
        this.paidCache = null;
        this.funnelSvc = new FunnelAnalysisService_1.FunnelAnalysisService();
    }
    // ============ Upload & parse ============
    async uploadWebinar(participantsCsv, chatTxt) {
        const parsed = this.parseParticipantsCsv(participantsCsv);
        this.attachChat(parsed.attendees, chatTxt, parsed.sessionStart);
        const doc = {
            title: parsed.title,
            webinarDate: dateOnly(parsed.sessionStart),
            hostEmail: parsed.hostEmail,
            sessionStart: parsed.sessionStart,
            sessionEnd: parsed.sessionEnd,
            totalDurationMin: parsed.totalDurationMin,
            totalParticipantRows: parsed.totalParticipantRows,
            uploadedAt: new Date(),
            attendees: Array.from(parsed.attendees.values()),
        };
        const db = (0, database_1.getDatabase)();
        const result = await db.collection(COLLECTION).insertOne(doc);
        return {
            id: result.insertedId.toString(),
            title: doc.title,
            webinarDate: doc.webinarDate.toISOString(),
            batchLabel: ordinalLabel(doc.webinarDate),
            uploadedAt: doc.uploadedAt.toISOString(),
            attendeeCount: doc.attendees.length,
        };
    }
    parseParticipantsCsv(buffer) {
        const text = buffer.toString('utf-8').replace(/^﻿/, '');
        const rows = (0, sync_1.parse)(text, { skip_empty_lines: true, relax_column_count: true });
        // Row 0 = summary header ("Topic,ID,Host,Duration (minutes),Start time,End time,Participants"),
        // row 1 = its values. The real per-attendee table starts a few rows later.
        const summaryValues = rows[1] || [];
        const title = (summaryValues[0] || 'Untitled Webinar').trim();
        const hostField = summaryValues[2] || '';
        const hostMatch = hostField.match(/\(([^)]+)\)/);
        const hostEmail = normalizeEmail(hostMatch ? hostMatch[1] : hostField);
        const totalDurationMin = parseFloat(summaryValues[3]) || 0;
        const sessionStart = parseIstDateTime(summaryValues[4]);
        const sessionEnd = parseIstDateTime(summaryValues[5]);
        const totalParticipantRows = parseInt(summaryValues[6], 10) || 0;
        const headerIdx = rows.findIndex((r) => r[0] && r[0].trim() === 'Name (original name)');
        const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : [];
        const attendees = new Map();
        for (const r of dataRows) {
            if (r.length < 5 || !r[1])
                continue;
            const name = (r[0] || '').trim();
            const email = normalizeEmail(r[1]);
            if (!email || email === hostEmail)
                continue;
            const durationMin = parseFloat(r[4]);
            if (isNaN(durationMin))
                continue;
            const joinTime = parseIstDateTime(r[2]);
            const leaveTime = parseIstDateTime(r[3]);
            let person = attendees.get(email);
            if (!person) {
                person = { email, names: [], sessions: [], chat: [] };
                attendees.set(email, person);
            }
            if (name && !person.names.includes(name))
                person.names.push(name);
            person.sessions.push({ joinTime, leaveTime, durationMin });
        }
        return { title, hostEmail, sessionStart, sessionEnd, totalDurationMin, totalParticipantRows, attendees };
    }
    // Chat only carries display names, not emails — map back to the attendee via the name(s) seen for
    // them in the participants file. Elapsed-time format ("HH:MM:SS") is relative to session start, so
    // it converts directly to a wall-clock timestamp by adding it to sessionStart.
    attachChat(attendees, chatBuffer, sessionStart) {
        const nameToEmail = new Map();
        for (const person of attendees.values()) {
            for (const n of person.names) {
                if (!nameToEmail.has(n))
                    nameToEmail.set(n, person.email);
            }
        }
        const text = chatBuffer.toString('utf-8').replace(/^﻿/, '');
        const lines = text.split(/\r?\n/);
        const msgRe = /^(\d{2}):(\d{2}):(\d{2})\t([^\t]+):\t(.*)$/;
        let curEmail = null;
        for (const line of lines) {
            const m = line.match(msgRe);
            if (m) {
                const elapsedSec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
                const name = m[4].trim();
                const email = nameToEmail.get(name) || null;
                curEmail = email;
                if (email) {
                    const person = attendees.get(email);
                    person?.chat.push({ elapsedSec, msg: m[5] });
                }
            }
            else if (curEmail && line.trim() && !line.startsWith('WEBVTT')) {
                const person = attendees.get(curEmail);
                if (person && person.chat.length > 0) {
                    person.chat[person.chat.length - 1].msg += ' ' + line.trim();
                }
            }
        }
    }
    // ============ Listing ============
    async listWebinars() {
        const db = (0, database_1.getDatabase)();
        const docs = await db
            .collection(COLLECTION)
            .find({})
            .project({ title: 1, webinarDate: 1, uploadedAt: 1, attendees: 1 })
            .sort({ webinarDate: -1 })
            .toArray();
        return docs.map((d) => ({
            id: d._id.toString(),
            title: d.title,
            webinarDate: new Date(d.webinarDate).toISOString(),
            batchLabel: ordinalLabel(new Date(d.webinarDate)),
            uploadedAt: new Date(d.uploadedAt).toISOString(),
            attendeeCount: d.attendees.length,
        }));
    }
    // ============ Sheet fetching (cached, same sources as FunnelAnalysisService/EmandateTrackerService) ============
    async fetchRegistrations() {
        const now = Date.now();
        if (this.registrationCache && now - this.registrationCache.ts < SHEET_CACHE_TTL_MS)
            return this.registrationCache.data;
        const response = await axios_1.default.get(WEBINAR_REGISTRATIONS_CSV_URL, { responseType: 'text', timeout: 20000 });
        const records = (0, sync_1.parse)(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
        const rows = records.map((r) => {
            const offering = (r['Offering'] || '').trim();
            return {
                name: (r['Name'] || '').trim(),
                phone: normalizePhone(r['Phone Number']),
                email: normalizeEmail(r['Email']),
                offering,
                webinarDate: parseLooseDate(offering),
            };
        });
        this.registrationCache = { data: rows, ts: now };
        return rows;
    }
    async fetchPaidSheet() {
        const now = Date.now();
        if (this.paidCache && now - this.paidCache.ts < SHEET_CACHE_TTL_MS)
            return this.paidCache.data;
        const response = await axios_1.default.get(WEBINAR_PAID_CSV_URL, { responseType: 'text', timeout: 20000 });
        const records = (0, sync_1.parse)(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
        const rows = records.map((r) => {
            const rawBatchDate = (r['Webinar Date'] || '').trim();
            return {
                name: (r['name'] || '').trim(),
                email: normalizeEmail(r['email']),
                phone: normalizePhone(r['whatsapp_number']),
                rawBatchDate,
                batchDate: parseCompactDate(rawBatchDate),
                isPaid: sheetRowIsPaid(r['Pinged(Yes/No)']),
            };
        });
        this.paidCache = { data: rows, ts: now };
        return rows;
    }
    // ============ Core enrichment (live — reflects current Mongo/sheet state every call) ============
    async loadBatch(batchId) {
        const db = (0, database_1.getDatabase)();
        const doc = await db.collection(COLLECTION).findOne({ _id: new mongodb_1.ObjectId(batchId) });
        if (!doc)
            throw new Error('Webinar not found');
        return doc;
    }
    async enrich(batch) {
        const emails = batch.attendees.map((a) => a.email);
        const db = (0, database_1.getDatabase)();
        const users = emails.length
            ? await db
                .collection('userdetail')
                .find({ email: { $in: emails } })
                .project({ email: 1, type: 1, mobile: 1, whatsappNumber: 1, createdOn: 1 })
                .toArray()
            : [];
        const userByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
        const [paidSheet, registrations] = await Promise.all([this.fetchPaidSheet(), this.fetchRegistrations()]);
        // Grouped by email (not a single "last one wins" row) — a person can legitimately show up on
        // either sheet more than once (registered for several webinars over time; paid once, then
        // appears again on a later batch's row for some other reason), and both the Batch tags and the
        // "paid on" column need to see every row, not just whichever happened to be last in the CSV.
        // Indexed by BOTH email and phone — the registrations/paid sheets are filled in by hand over a
        // year-plus of webinars, so the same person's email there often doesn't match whatever email
        // they happened to type into Zoom's registration form (typos, a work vs. personal address, a
        // second Gmail account). Phone numbers are far more stable, so matching on either catches real
        // registrations/payments that an email-only lookup was silently missing.
        const paidByEmail = new Map();
        const paidByPhone = new Map();
        for (const r of paidSheet) {
            if (r.email) {
                if (!paidByEmail.has(r.email))
                    paidByEmail.set(r.email, []);
                paidByEmail.get(r.email).push(r);
            }
            if (r.phone) {
                if (!paidByPhone.has(r.phone))
                    paidByPhone.set(r.phone, []);
                paidByPhone.get(r.phone).push(r);
            }
        }
        const regByEmail = new Map();
        const regByPhone = new Map();
        for (const r of registrations) {
            if (r.email) {
                if (!regByEmail.has(r.email))
                    regByEmail.set(r.email, []);
                regByEmail.get(r.email).push(r);
            }
            if (r.phone) {
                if (!regByPhone.has(r.phone))
                    regByPhone.set(r.phone, []);
                regByPhone.get(r.phone).push(r);
            }
        }
        return batch.attendees.map((a) => {
            const u = userByEmail.get(a.email);
            // Zoom only ever gives us name + email, never a phone — the phone-based lookup below can only
            // kick in once we already know this person's number from their own userdetail account.
            const knownPhone = normalizePhone(u?.mobile || u?.whatsappNumber);
            const paidRows = Array.from(new Set([...(paidByEmail.get(a.email) || []), ...(knownPhone ? paidByPhone.get(knownPhone) || [] : [])]));
            const regRows = Array.from(new Set([...(regByEmail.get(a.email) || []), ...(knownPhone ? regByPhone.get(knownPhone) || [] : [])]));
            const signedUp = !!u;
            // The Full Paid sheet (matched by email OR phone, see paidRows above) is the ONLY source of
            // payment truth here — chat text is never used to infer a payment, even a message that reads
            // like a confirmation ("paid", "payment done"). A sheet row dated strictly BEFORE this webinar
            // means they paid prior to it; a row dated to THIS webinar's own date means they converted
            // during it (see paidToday below) — either way it's an ops-entered record, not a guess.
            const confirmedPaidRows = paidRows.filter((r) => r.isPaid);
            const priorPaidRow = confirmedPaidRows.find((r) => !r.batchDate || r.batchDate.getTime() < batch.webinarDate.getTime());
            const todayPaidRow = confirmedPaidRows.find((r) => r.batchDate && r.batchDate.getTime() === batch.webinarDate.getTime());
            const previouslyPaid = !!(u && TRIBE_TYPES.has(u.type)) || !!priorPaidRow;
            const previouslyPaidOn = u && TRIBE_TYPES.has(u.type) && u.createdOn ? new Date(u.createdOn).toISOString() : priorPaidRow?.rawBatchDate || null;
            const paidToday = !!todayPaidRow;
            // "Paid (5k)" overall = Tribe/TribeYearly, or confirmed paid on the sheet for ANY batch
            // (before this webinar, during it, or an unparseable date) — sheet-confirmed only.
            const paid5k = !!(u && TRIBE_TYPES.has(u.type)) || confirmedPaidRows.length > 0;
            const totalMin = mergedAttendanceMinutes(a.sessions);
            const lastLeave = a.sessions.reduce((max, s) => (s.leaveTime > max ? s.leaveTime : max), a.sessions[0]?.leaveTime || new Date(0));
            const number = u?.mobile || u?.whatsappNumber || regRows.find((r) => r.phone)?.phone || paidRows.find((r) => r.phone)?.phone || a.email;
            const signedUpBeforeSession = !!(u && u.createdOn && new Date(u.createdOn) < batch.webinarDate);
            // Every webinar this person has ever registered for via the funnel, as short "<date> <topic>"
            // tags — a person who signed up for more than one batch (e.g. a Momentum one and a Swing
            // Trading one) gets both tags, not just whichever matches the currently-viewed webinar.
            const batchTags = Array.from(new Set(regRows
                .filter((r) => r.webinarDate)
                .sort((x, y) => x.webinarDate.getTime() - y.webinarDate.getTime())
                .map((r) => `${ordinalLabelWithYear(r.webinarDate)} ${shortOfferingTopic(r.offering)}`)));
            const registeredBatches = batchTags.length > 0 ? batchTags.join(', ') : null;
            // When they actually paid the 5k, earliest sheet record first (their original onboarding, not
            // a later re-appearance); unparseable-but-confirmed dates fall back to the sheet's raw text;
            // someone already Tribe/TribeYearly in Mongo with no matching sheet row at all (sheet match
            // failed, or they were onboarded before this sheet existed) falls back to their account's own
            // signup date. No chat-based fallback — if the sheet has nothing, this is null.
            const datedConfirmedRows = confirmedPaidRows.filter((r) => r.batchDate).sort((x, y) => x.batchDate.getTime() - y.batchDate.getTime());
            const paidOnBatch = datedConfirmedRows[0]
                ? ordinalLabelWithYear(datedConfirmedRows[0].batchDate)
                : confirmedPaidRows[0]
                    ? confirmedPaidRows[0].rawBatchDate
                    : u && TRIBE_TYPES.has(u.type) && u.createdOn
                        ? ordinalLabelWithYear(dateOnly(new Date(u.createdOn)))
                        : null;
            const registeredDates = regRows.filter((r) => r.webinarDate).map((r) => r.webinarDate);
            return {
                email: a.email,
                name: a.names[0] || a.email,
                number,
                totalMin,
                rejoins: Math.max(0, a.sessions.length - 1),
                chatCount: a.chat.length,
                lastLeave,
                signedUp,
                previouslyPaid,
                previouslyPaidOn,
                paidToday,
                paid5k,
                signedUpBeforeSession,
                registeredBatches,
                paidOnBatch,
                registeredDates,
            };
        });
    }
    // ============ Report (7 summary cards) ============
    // All 9 engagement metrics scoped to one segment's own members — same formulas the webinar-wide
    // report used before, just computed against `members` instead of every attendee. Peak concurrency
    // needs the raw session segments (not the enriched summary), so it's recomputed from `batch`
    // filtered down to this segment's emails.
    computeSegmentMetrics(members, batch, attendedThresholdMin, reRegisteredCount = null) {
        const pct = (n, base) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0);
        const total = members.length;
        const attendedList = members.filter((e) => e.totalMin >= attendedThresholdMin);
        const middleCutoff = new Date(batch.sessionStart.getTime() + (batch.totalDurationMin / 2) * 60000);
        const endCutoff = new Date(batch.sessionStart.getTime() + 120 * 60000);
        const cutoff150 = new Date(batch.sessionStart.getTime() + 150 * 60000);
        const cutoff180 = new Date(batch.sessionStart.getTime() + 180 * 60000);
        const stayedTillMiddleCount = attendedList.filter((e) => e.lastLeave >= middleCutoff).length;
        const stayedTillEnd2hrCount = attendedList.filter((e) => e.lastLeave >= endCutoff).length;
        const stayedTill150Count = attendedList.filter((e) => e.lastLeave >= cutoff150).length;
        const stayedTill180Count = attendedList.filter((e) => e.lastLeave >= cutoff180).length;
        const totalChats = members.reduce((sum, e) => sum + e.chatCount, 0);
        const avgAttendedDurationMin = attendedList.length > 0 ? Math.round((attendedList.reduce((sum, e) => sum + e.totalMin, 0) / attendedList.length) * 10) / 10 : null;
        const avgRejoinsAttended = attendedList.length > 0 ? Math.round((attendedList.reduce((sum, e) => sum + e.rejoins, 0) / attendedList.length) * 100) / 100 : null;
        const memberEmails = new Set(members.map((e) => e.email));
        const peak = computePeakConcurrency(batch.attendees.filter((a) => memberEmails.has(a.email)));
        // Only worth showing on an unusually long/engaging segment — on a typical ~2hr session these
        // would just be noisy near-zero numbers against a cutoff nobody was ever going to reach. Gated
        // per-segment (not the whole webinar), since one segment can run much more engaged than another.
        const showExtendedStayCards = avgAttendedDurationMin !== null && avgAttendedDurationMin > 150;
        // Genuine new conversions out of this segment — a Full Paid sheet row dated to THIS exact
        // webinar's own date, regardless of whether they registered today, earlier, or not at all.
        // Someone already paid before this session never shows up here (they're not in `members` at
        // all once they're already paid — see the segment-priority split in getReport).
        const converters = members.filter((e) => e.paidToday);
        const conversionsAvgAttendedMin = converters.length > 0 ? Math.round((converters.reduce((sum, e) => sum + e.totalMin, 0) / converters.length) * 10) / 10 : null;
        return {
            totalRegistered: total,
            attended: { count: attendedList.length, pct: pct(attendedList.length, total) },
            totalChats,
            avgAttendedDurationMin,
            avgRejoinsAttended,
            peakConcurrent: { count: peak.count, atTime: peak.atTime ? peak.atTime.toISOString() : null },
            stayedTillMiddle: { count: stayedTillMiddleCount, pct: pct(stayedTillMiddleCount, attendedList.length) },
            stayedTillEnd2hr: batch.totalDurationMin >= 120 ? { count: stayedTillEnd2hrCount, pct: pct(stayedTillEnd2hrCount, attendedList.length) } : null,
            stayedTill150Min: showExtendedStayCards && batch.totalDurationMin >= 150 ? { count: stayedTill150Count, pct: pct(stayedTill150Count, attendedList.length) } : null,
            stayedTill180Min: showExtendedStayCards && batch.totalDurationMin >= 180 ? { count: stayedTill180Count, pct: pct(stayedTill180Count, attendedList.length) } : null,
            conversions: { count: converters.length, avgAttendedMin: conversionsAvgAttendedMin },
            reRegisteredToday: reRegisteredCount !== null ? { count: reRegisteredCount, pct: pct(reRegisteredCount, total) } : null,
        };
    }
    async getReport(batchId, attendedThresholdMin) {
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        const registrations = await this.fetchRegistrations();
        const sameDayRegs = registrations.filter((r) => r.webinarDate && r.webinarDate.getTime() === batch.webinarDate.getTime());
        const registrationDataAvailable = sameDayRegs.length > 0;
        // Every attendee lands in exactly one segment. "Already Paid" means paid STRICTLY BEFORE this
        // webinar's own date (`previouslyPaid`: Tribe/TribeYearly, or a sheet row dated earlier) — a
        // live conversion in TODAY'S chat does NOT count as already paid, on purpose: someone who
        // registered for today and paid live during this exact session is a Current Webinar conversion,
        // not a pre-existing customer, and must never be pulled out of the Current/Previous buckets just
        // because they happened to pay while we were looking. (`paidToday` — a Full Paid sheet row
        // dated to this exact webinar — is surfaced separately per segment via the Conversions card
        // instead.)
        //
        // Current vs. Previous is decided by each attendee's EARLIEST funnel registration
        // (`registeredDates`, matched by email OR phone, same as `registeredBatches`): if they have ANY
        // registration row dated strictly before this webinar, that earlier one is their "real" first
        // registration, so they belong to "From Previous Webinar (Not Paid)" even if they also
        // registered again for today — registering twice doesn't make them a fresh lead. Only someone
        // with NO earlier registration at all, but one dated to today, counts as Current.
        //
        // Checked in this order: already-paid-before first, then an earlier registration, then today's,
        // with Organic as the catch-all — making the four segments sum exactly back to the total.
        const current = [];
        const previousNotPaid = [];
        const alreadyPaid = [];
        const organic = [];
        for (const e of enriched) {
            const hasEarlierReg = e.registeredDates.some((d) => d.getTime() < batch.webinarDate.getTime());
            const hasTodayReg = e.registeredDates.some((d) => d.getTime() === batch.webinarDate.getTime());
            if (e.previouslyPaid)
                alreadyPaid.push(e);
            else if (hasEarlierReg)
                previousNotPaid.push(e);
            else if (hasTodayReg)
                current.push(e);
            else
                organic.push(e);
        }
        // Of "From Previous Webinar (Not Paid)", how many also registered again for THIS exact webinar
        // (not just resurfacing to attend, but a tracked repeat registration) — see `reRegisteredToday`.
        const reRegisteredCount = previousNotPaid.filter((e) => e.registeredDates.some((d) => d.getTime() === batch.webinarDate.getTime())).length;
        // Reconciliation against the Funnel Analysis tab's own per-batch paid total for this exact date
        // (Webinar + Organic + Sales Team sheet rows combined, fuzzy-resolved) — see `funnelPaidTotal`
        // on WebinarReport. null when this date isn't in the admin-managed master batch list yet.
        const dateKey = batch.webinarDate.toISOString().slice(0, 10);
        let funnelPaidTotal = null;
        try {
            const detail = await this.funnelSvc.getWebinarBatchDetail([dateKey], false, ['webinar', 'organic', 'salesteam']);
            const sum = (detail.webinar[0]?.paid || 0) + (detail.organic[0]?.paid || 0) + (detail.salesteam[0]?.paid || 0);
            funnelPaidTotal = sum > 0 ? sum : null;
        }
        catch {
            funnelPaidTotal = null;
        }
        return {
            webinar: {
                id: batchId,
                title: batch.title,
                webinarDate: batch.webinarDate.toISOString(),
                batchLabel: ordinalLabel(batch.webinarDate),
                sessionStart: batch.sessionStart.toISOString(),
                sessionEnd: batch.sessionEnd.toISOString(),
                totalDurationMin: batch.totalDurationMin,
            },
            attendedThresholdMin,
            cards: {
                totalRegistered: enriched.length,
                segments: {
                    current: this.computeSegmentMetrics(current, batch, attendedThresholdMin),
                    previousNotPaid: this.computeSegmentMetrics(previousNotPaid, batch, attendedThresholdMin, reRegisteredCount),
                    alreadyPaid: this.computeSegmentMetrics(alreadyPaid, batch, attendedThresholdMin),
                    organic: this.computeSegmentMetrics(organic, batch, attendedThresholdMin),
                },
            },
            registrationDataAvailable,
            funnelPaidTotal,
        };
    }
    // Backing list for the Chat tab's person picker — everyone who sent at least one chat message,
    // sorted most-active-first. Returned unpaginated (bounded by attendee count, never more than a few
    // hundred) so the picker can filter instantly client-side instead of round-tripping per keystroke.
    async getChatPeople(batchId) {
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        return enriched
            .filter((e) => e.chatCount > 0)
            .map((e) => ({ email: e.email, name: e.name, number: e.number, signedUp: e.signedUp, chatCount: e.chatCount }))
            .sort((a, b) => b.chatCount - a.chatCount);
    }
    async getBatchOptions(batchId) {
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        const tags = new Set();
        for (const e of enriched) {
            if (!e.registeredBatches)
                continue;
            for (const tag of e.registeredBatches.split(', '))
                tags.add(tag);
        }
        return Array.from(tags).sort();
    }
    matchesBatchFilter(registeredBatches, batchFilter) {
        if (!batchFilter || batchFilter.length === 0)
            return true;
        const tags = (registeredBatches || '').split(', ').filter(Boolean);
        return batchFilter.some((b) => tags.includes(b));
    }
    // Case-insensitive substring match across whichever identity fields a row has — name/number/email
    // plus "yes"/"no" for signedUp, so typing "yes" narrows to signed-up people. Empty search matches
    // everything (search is a narrowing filter, never a required field).
    matchesSearch(fields, search) {
        const q = (search || '').trim().toLowerCase();
        if (!q)
            return true;
        return fields.some((f) => (f || '').toLowerCase().includes(q));
    }
    async mainRows(batchId, attendedThresholdMin, sortBy, sortDir = 'desc', batchFilter, search) {
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        let rows = enriched
            .filter((e) => e.totalMin >= attendedThresholdMin &&
            this.matchesBatchFilter(e.registeredBatches, batchFilter) &&
            this.matchesSearch([e.name, e.number, e.email, e.signedUp ? 'yes' : 'no'], search))
            .map((e) => ({
            email: e.email,
            name: e.name,
            number: e.number,
            registeredBatches: e.registeredBatches,
            paid5k: e.paid5k,
            paidOnBatch: e.paidOnBatch,
            totalMin: Math.round(e.totalMin * 10) / 10,
            rejoins: e.rejoins,
            chatCount: e.chatCount,
            signedUp: e.signedUp,
        }));
        rows = sortBy ? sortRows(rows, sortBy, sortDir, WebinarAnalysisService.MAIN_SORT_FIELDS) : rows.sort((a, b) => b.totalMin - a.totalMin);
        return rows;
    }
    async getMainTable(batchId, attendedThresholdMin, page, pageSize, sortBy, sortDir = 'desc', batchFilter, search) {
        const rows = await this.mainRows(batchId, attendedThresholdMin, sortBy, sortDir, batchFilter, search);
        return this.paginate(rows, page, pageSize);
    }
    // Matches AiSensy's real bulk-contact import schema exactly (confirmed against a working export
    // from the account: Name,Mobile Number,Source,Tags,Experience,Challenge,Timeline,Capital,
    // DecisionMaker — the last five are AiSensy's own custom lead-qualification fields, left blank for
    // a bulk list where we don't have per-contact answers). Rows with no real phone on file (the
    // email-fallback case — see `number` in enrich()) are dropped rather than uploaded as a bad
    // "number" AiSensy would just reject anyway. `tag` is one piece of free text applied identically
    // to every contact in the file, typed in by whoever's downloading. Values are only quoted when
    // they actually need it (contain a comma/quote/newline) — AiSensy's own export never blanket-quotes.
    csvFieldEscape(val) {
        return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
    }
    buildAisensyCsv(rows, tag) {
        const header = 'Name,Mobile Number,Source,Tags,Experience,Challenge,Timeline,Capital,DecisionMaker\n';
        const body = rows
            .filter((r) => r.number && !r.number.includes('@'))
            .map((r) => [this.csvFieldEscape(r.name), r.number, '', this.csvFieldEscape(tag), '', '', '', '', ''].join(','))
            .join('\n');
        return header + body;
    }
    async downloadMainCsv(batchId, attendedThresholdMin, sortBy, sortDir = 'desc', batchFilter, search, format = 'raw', tag = '') {
        const rows = await this.mainRows(batchId, attendedThresholdMin, sortBy, sortDir, batchFilter, search);
        if (format === 'aisensy')
            return this.buildAisensyCsv(rows, tag);
        const header = 'Name,Number,Registered Batch(es),Paid (5k),Paid On,Total Time (min),Rejoins,Chats,Signed Up\n';
        const body = rows
            .map((r) => [r.name, r.number, r.registeredBatches || '', r.paid5k ? 'Yes' : 'No', r.paidOnBatch || '', r.totalMin, r.rejoins, r.chatCount, r.signedUp ? 'Yes' : 'No']
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','))
            .join('\n');
        return header + body;
    }
    async notJoinedRows(batchId, attendedThresholdMin, sortBy, sortDir = 'desc', batchFilter, search) {
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        const rows = enriched
            .filter((e) => e.totalMin < attendedThresholdMin &&
            this.matchesBatchFilter(e.registeredBatches, batchFilter) &&
            this.matchesSearch([e.name, e.number, e.email, e.signedUp ? 'yes' : 'no'], search))
            .map((e) => ({
            email: e.email,
            name: e.name,
            number: e.number,
            registeredBatches: e.registeredBatches,
            paid5k: e.paid5k,
            paidOnBatch: e.paidOnBatch,
            signedUp: e.signedUp,
        }));
        return sortRows(rows, sortBy, sortDir, WebinarAnalysisService.NOT_JOINED_SORT_FIELDS);
    }
    async getNotJoinedTable(batchId, attendedThresholdMin, page, pageSize, sortBy, sortDir = 'desc', batchFilter, search) {
        const rows = await this.notJoinedRows(batchId, attendedThresholdMin, sortBy, sortDir, batchFilter, search);
        return this.paginate(rows, page, pageSize);
    }
    async downloadNotJoinedCsv(batchId, attendedThresholdMin, sortBy, sortDir = 'desc', batchFilter, search, format = 'raw', tag = '') {
        const rows = await this.notJoinedRows(batchId, attendedThresholdMin, sortBy, sortDir, batchFilter, search);
        if (format === 'aisensy')
            return this.buildAisensyCsv(rows, tag);
        const header = 'Name,Number,Registered Batch(es),Paid (5k),Paid On,Signed Up\n';
        const body = rows
            .map((r) => [r.name, r.number, r.registeredBatches || '', r.paid5k ? 'Yes' : 'No', r.paidOnBatch || '', r.signedUp ? 'Yes' : 'No'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        return header + body;
    }
    // ============ Not Registered table ============
    async notRegisteredRows(batchId) {
        const batch = await this.loadBatch(batchId);
        const attendeeEmails = new Set(batch.attendees.map((a) => a.email));
        const registrations = await this.fetchRegistrations();
        const sameDayRegs = registrations.filter((r) => r.webinarDate && r.webinarDate.getTime() === batch.webinarDate.getTime() && r.email);
        const missing = sameDayRegs.filter((r) => !attendeeEmails.has(r.email));
        const emails = missing.map((r) => r.email);
        const db = (0, database_1.getDatabase)();
        const users = emails.length
            ? await db.collection('userdetail').find({ email: { $in: emails } }).project({ email: 1, mobile: 1, whatsappNumber: 1, createdOn: 1 }).toArray()
            : [];
        const userByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
        const rows = missing.map((r) => {
            const u = userByEmail.get(r.email);
            return {
                email: r.email,
                name: r.name || r.email,
                number: r.phone || u?.mobile || u?.whatsappNumber || r.email,
                signedUp: !!u,
                signedUpBeforeSession: !!(u && u.createdOn && new Date(u.createdOn) < batch.webinarDate),
            };
        });
        return { rows, registrationDataAvailable: sameDayRegs.length > 0 };
    }
    async getNotRegisteredTable(batchId, page, pageSize, sortBy, sortDir = 'desc', search) {
        const { rows, registrationDataAvailable } = await this.notRegisteredRows(batchId);
        const matched = rows.filter((r) => this.matchesSearch([r.name, r.number, r.email, r.signedUp ? 'yes' : 'no'], search));
        const sorted = sortRows(matched, sortBy, sortDir, WebinarAnalysisService.NOT_REGISTERED_SORT_FIELDS);
        return { ...this.paginate(sorted, page, pageSize), registrationDataAvailable };
    }
    async downloadNotRegisteredCsv(batchId, sortBy, sortDir = 'desc', search, format = 'raw', tag = '') {
        const { rows } = await this.notRegisteredRows(batchId);
        const matched = rows.filter((r) => this.matchesSearch([r.name, r.number, r.email, r.signedUp ? 'yes' : 'no'], search));
        const sorted = sortRows(matched, sortBy, sortDir, WebinarAnalysisService.NOT_REGISTERED_SORT_FIELDS);
        if (format === 'aisensy')
            return this.buildAisensyCsv(sorted, tag);
        const header = 'Name,Number,Signed Up,Signed Up Before Session\n';
        const body = sorted
            .map((r) => [r.name, r.number, r.signedUp ? 'Yes' : 'No', r.signedUpBeforeSession ? 'Yes' : 'No'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        return header + body;
    }
    // ============ Keyword search ============
    // Simple case-insensitive substring match over every attendee's own chat messages — one row PER
    // OCCURRENCE (someone who says the keyword three times produces three rows, one per timestamp),
    // since the ask is literally "the time he used that word", not a one-row-per-person summary.
    async keywordRows(batchId, keyword, sortBy, sortDir = 'desc') {
        const kw = (keyword || '').trim().toLowerCase();
        if (!kw)
            return [];
        const batch = await this.loadBatch(batchId);
        const enriched = await this.enrich(batch);
        const numberByEmail = new Map(enriched.map((e) => [e.email, e.number]));
        const nameByEmail = new Map(enriched.map((e) => [e.email, e.name]));
        const rows = [];
        for (const a of batch.attendees) {
            const name = nameByEmail.get(a.email) || a.email;
            const number = numberByEmail.get(a.email) || a.email;
            for (const c of a.chat) {
                if (c.msg.toLowerCase().includes(kw)) {
                    rows.push({ email: a.email, name, number, timeIso: new Date(batch.sessionStart.getTime() + c.elapsedSec * 1000).toISOString(), msg: c.msg });
                }
            }
        }
        return sortBy ? sortRows(rows, sortBy, sortDir, WebinarAnalysisService.KEYWORD_SORT_FIELDS) : rows.sort((a, b) => a.timeIso.localeCompare(b.timeIso));
    }
    async getKeywordMatches(batchId, keyword, page, pageSize, sortBy, sortDir = 'desc') {
        const rows = await this.keywordRows(batchId, keyword, sortBy, sortDir);
        return this.paginate(rows, page, pageSize);
    }
    async downloadKeywordCsv(batchId, keyword, sortBy, sortDir = 'desc', format = 'raw', tag = '') {
        const rows = await this.keywordRows(batchId, keyword, sortBy, sortDir);
        if (format === 'aisensy')
            return this.buildAisensyCsv(rows, tag);
        const header = 'Name,Number,Email,Time (IST),Message\n';
        const body = rows
            .map((r) => {
            const istTime = new Date(r.timeIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
            return [r.name, r.number, r.email, istTime, r.msg].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
        })
            .join('\n');
        return header + body;
    }
    // ============ Attendee drill-down ============
    async getAttendeeDetail(batchId, email) {
        const batch = await this.loadBatch(batchId);
        const target = normalizeEmail(email);
        const raw = batch.attendees.find((a) => a.email === target);
        if (!raw)
            throw new Error('Attendee not found in this webinar');
        const enriched = await this.enrich(batch);
        const e = enriched.find((x) => x.email === target);
        return {
            email: raw.email,
            name: e.name,
            number: e.number,
            signedUp: e.signedUp,
            previouslyPaid: e.previouslyPaid,
            previouslyPaidOn: e.previouslyPaidOn,
            paid5k: e.paid5k,
            paidOnBatch: e.paidOnBatch,
            registeredBatches: e.registeredBatches,
            totalMin: Math.round(e.totalMin * 10) / 10,
            sessions: raw.sessions.map((s) => ({ joinTime: s.joinTime.toISOString(), leaveTime: s.leaveTime.toISOString(), durationMin: s.durationMin })),
            chat: raw.chat.map((c) => ({ wallClock: new Date(batch.sessionStart.getTime() + c.elapsedSec * 1000).toISOString(), msg: c.msg })),
        };
    }
    paginate(rows, page, pageSize) {
        const total = rows.length;
        const start = (page - 1) * pageSize;
        return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
    }
}
exports.WebinarAnalysisService = WebinarAnalysisService;
// ============ Main / Not Joined tables ============
// Split by the SAME dynamic attended threshold the summary cards use (not a fixed ">0 minutes"
// cutoff) — otherwise raising/lowering the threshold moves people between "attended" on the cards
// and the two tables inconsistently (e.g. the Attended card says 70 but Main still lists all 109).
WebinarAnalysisService.MAIN_SORT_FIELDS = ['name', 'number', 'registeredBatches', 'paid5k', 'paidOnBatch', 'totalMin', 'rejoins', 'chatCount', 'signedUp'];
WebinarAnalysisService.NOT_JOINED_SORT_FIELDS = ['name', 'number', 'registeredBatches', 'paid5k', 'paidOnBatch', 'signedUp'];
WebinarAnalysisService.NOT_REGISTERED_SORT_FIELDS = ['name', 'number', 'signedUp', 'signedUpBeforeSession'];
WebinarAnalysisService.KEYWORD_SORT_FIELDS = ['name', 'number', 'email', 'timeIso'];
//# sourceMappingURL=WebinarAnalysisService.js.map