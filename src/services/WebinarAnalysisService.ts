import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';

const WEBINAR_REGISTRATIONS_CSV_URL =
  process.env.WEBINAR_REGISTRATIONS_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmL4IPqIR0FI5gpD1B9d75Flo-M_FV79pD12k2204zTJRdrTnjrnDIO7RaYtAizQGlo7fbfx23jfJ4/pub?gid=396802957&single=true&output=csv';

const WEBINAR_PAID_CSV_URL =
  process.env.WEBINAR_PAID_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUirjwWnGgKXI6-u5PHlpjuiNastnqr_FBdIfMFthKOoQLrKz_4McjONeLYgy10BCcdV3eKLo-vqvr/pub?gid=444686195&single=true&output=csv';

const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;
const COLLECTION = 'webinar_analysis_batches';

const TRIBE_TYPES = new Set(['Tribe', 'TribeYearly']);

// Self-reported in the chat during the live Razorpay-link push ("paid", "Payment done R STALIN",
// "already paid Rs.5000", "Please confirm my payment"). Not an authoritative payment record — just
// the best signal available minutes after a webinar ends, before Mongo/the sheet catch up. Shown to
// the viewer as the matched quote + timestamp so a human makes the final call, not hidden as fact.
const PAID_CHAT_PATTERNS = [/\bpaid\b/i, /payment\s*(done|success|successful|successfully)/i, /confirm(ed)?\s*(my\s*)?payment/i, /made\s*(the\s*)?payment/i];

const MONTH_MAP: Record<string, number> = {
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
function parseIstDateTime(raw: string): Date {
  const m = (raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return new Date(NaN);
  const [, moS, dS, yS, hS, miS, sS, ap] = m;
  let hour = parseInt(hS, 10) % 12;
  if (ap.toUpperCase() === 'PM') hour += 12;
  const utcMs = Date.UTC(parseInt(yS, 10), parseInt(moS, 10) - 1, parseInt(dS, 10), hour, parseInt(miS, 10), parseInt(sS, 10)) - IST_OFFSET_MS;
  return new Date(utcMs);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').toString().trim().toLowerCase();
}

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').toString().replace(/\D/g, '');
  return digits.slice(-10);
}

// "20th JUNE 2026" / "3rd Oct 2026 Momentum Investing Webinar" style strings.
function parseLooseDate(text: string): Date | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\w*\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase();
  const month = MONTH_MAP[monthKey] ?? MONTH_MAP[monthKey.slice(0, 3)] ?? MONTH_MAP[monthKey.slice(0, 4)];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

// The Full Paid sheet's "Webinar Date" column uses a different, separator-stripped compact form
// ("3October2026", "20Dec-2025") than the registrations sheet's "Offering" field — needs its own parser.
function parseCompactDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[-/.\s]/g, '').toLowerCase();
  const m = s.match(/^(\d{1,2})([a-z]+)(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_MAP[m[2]] ?? MONTH_MAP[m[2].slice(0, 3)] ?? MONTH_MAP[m[2].slice(0, 4)];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

type SortDir = 'asc' | 'desc';

// Generic post-filter, pre-pagination sort used by every table — only sorts on a whitelisted field
// per table (passed by the caller) so an unrecognized sortBy is a silent no-op, not a crash.
function sortRows<T extends Record<string, any>>(rows: T[], sortBy: string | undefined, sortDir: SortDir, allowedFields: string[]): T[] {
  if (!sortBy || !allowedFields.includes(sortBy)) return rows;
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (typeof av === 'boolean' || typeof bv === 'boolean') return (Number(av) - Number(bv)) * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
  });
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function ordinalLabel(d: Date): string {
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix} ${month}`;
}

// Classic sweep-line over every join/leave segment (across every attendee, regardless of total
// duration or the attended threshold) to find the single moment the most people were in the room
// at once. Leave events are processed before join events at an identical timestamp so someone
// departing frees their slot before a simultaneous arrival is counted into the same peak.
function computePeakConcurrency(attendees: StoredAttendee[]): { count: number; atTime: Date | null } {
  const events: { time: number; delta: number }[] = [];
  for (const a of attendees) {
    for (const s of a.sessions) {
      events.push({ time: s.joinTime.getTime(), delta: 1 });
      events.push({ time: s.leaveTime.getTime(), delta: -1 });
    }
  }
  if (events.length === 0) return { count: 0, atTime: null };

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

// Mirrors EmandateTrackerService's classifyPaymentStatus: the sheet only carries anyone who has
// already paid at least the initial amount, so presence on it counts as "previously paid" unless
// the note explicitly says Refunded/Cancelled.
function sheetRowIsPaid(pingedRaw: string | null | undefined): boolean {
  const s = (pingedRaw || '').trim().toLowerCase();
  if (s.includes('refund')) return false;
  if (s.includes('cancel')) return false;
  return true;
}

interface SessionSeg {
  joinTime: Date;
  leaveTime: Date;
  durationMin: number;
}

interface ChatMsg {
  elapsedSec: number;
  msg: string;
}

interface StoredAttendee {
  email: string;
  names: string[];
  sessions: SessionSeg[];
  chat: ChatMsg[];
}

interface WebinarBatchDoc {
  _id: ObjectId;
  title: string;
  webinarDate: Date;
  hostEmail: string;
  sessionStart: Date;
  sessionEnd: Date;
  totalDurationMin: number;
  totalParticipantRows: number;
  uploadedAt: Date;
  attendees: StoredAttendee[];
}

interface RegistrationRow {
  name: string;
  phone: string;
  email: string;
  webinarDate: Date | null;
}

interface PaidSheetRow {
  name: string;
  email: string;
  phone: string;
  rawBatchDate: string;
  batchDate: Date | null;
  isPaid: boolean;
}

export interface CountPct {
  count: number;
  pct: number;
}

export interface WebinarSummary {
  id: string;
  title: string;
  webinarDate: string;
  batchLabel: string;
  uploadedAt: string;
  attendeeCount: number;
}

export interface WebinarReport {
  webinar: {
    id: string;
    title: string;
    webinarDate: string;
    batchLabel: string;
    sessionStart: string;
    sessionEnd: string;
    totalDurationMin: number;
  };
  attendedThresholdMin: number;
  cards: {
    totalRegistered: number;
    registeredViaFunnel: CountPct;
    fromPreviousWebinar: CountPct; // registration-sheet match on an EARLIER date, excluding previously-paid people
    previouslyPaid: CountPct;
    organic: CountPct; // total - (registeredViaFunnel + fromPreviousWebinar + previouslyPaid)
    attended: CountPct;
    totalChats: number;
    avgAttendedDurationMin: number | null; // avg totalMin among the "attended" (>= threshold) population only
    avgRejoinsAttended: number | null; // avg rejoin count among the same "attended" population
    peakConcurrent: { count: number; atTime: string | null }; // most people in the room at once, and when
    stayedTillMiddle: CountPct; // of the attended population
    stayedTillEnd2hr: CountPct | null; // of the attended population; null when the session ran under 2 hours
  };
  registrationDataAvailable: boolean; // false => no funnel-registration rows exist for this date at all (pre 3-Oct-2026 cutoff)
}

export interface MainRow {
  email: string;
  name: string;
  number: string;
  batchLabel: string;
  paid5k: boolean;
  totalMin: number;
  rejoins: number;
  chatCount: number;
  signedUp: boolean;
}

export interface NotJoinedRow {
  email: string;
  name: string;
  number: string;
  batchLabel: string;
  paid5k: boolean;
  signedUp: boolean;
}

export interface NotRegisteredRow {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  signedUpBeforeSession: boolean;
}

export interface KeywordRow {
  email: string;
  name: string;
  number: string;
  timeIso: string; // wall-clock instant the keyword was used; frontend renders with the Asia/Kolkata DatePipe timezone
}

export interface AttendeeDetail {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  previouslyPaid: boolean;
  previouslyPaidOn: string | null;
  paid5k: boolean;
  paidEvidence: { msg: string; wallClock: string | null } | null;
  totalMin: number;
  sessions: { joinTime: string; leaveTime: string; durationMin: number }[];
  chat: { wallClock: string | null; msg: string }[];
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface EnrichedAttendee {
  email: string;
  name: string;
  number: string;
  totalMin: number;
  rejoins: number;
  chatCount: number;
  lastLeave: Date;
  signedUp: boolean;
  previouslyPaid: boolean;
  previouslyPaidOn: string | null;
  paid5kThisSession: boolean;
  paidEvidence: { msg: string; elapsedSec: number } | null;
  signedUpBeforeSession: boolean;
}

export class WebinarAnalysisService {
  private registrationCache: { data: RegistrationRow[]; ts: number } | null = null;
  private paidCache: { data: PaidSheetRow[]; ts: number } | null = null;

  // ============ Upload & parse ============
  async uploadWebinar(participantsCsv: Buffer, chatTxt: Buffer): Promise<WebinarSummary> {
    const parsed = this.parseParticipantsCsv(participantsCsv);
    this.attachChat(parsed.attendees, chatTxt, parsed.sessionStart);

    const doc: Omit<WebinarBatchDoc, '_id'> = {
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

    const db = getDatabase();
    const result = await db.collection(COLLECTION).insertOne(doc as any);

    return {
      id: result.insertedId.toString(),
      title: doc.title,
      webinarDate: doc.webinarDate.toISOString(),
      batchLabel: ordinalLabel(doc.webinarDate),
      uploadedAt: doc.uploadedAt.toISOString(),
      attendeeCount: doc.attendees.length,
    };
  }

  private parseParticipantsCsv(buffer: Buffer): {
    title: string;
    hostEmail: string;
    sessionStart: Date;
    sessionEnd: Date;
    totalDurationMin: number;
    totalParticipantRows: number;
    attendees: Map<string, StoredAttendee>;
  } {
    const text = buffer.toString('utf-8').replace(/^﻿/, '');
    const rows: string[][] = parse(text, { skip_empty_lines: true, relax_column_count: true });

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

    const attendees = new Map<string, StoredAttendee>();
    for (const r of dataRows) {
      if (r.length < 5 || !r[1]) continue;
      const name = (r[0] || '').trim();
      const email = normalizeEmail(r[1]);
      if (!email || email === hostEmail) continue;
      const durationMin = parseFloat(r[4]);
      if (isNaN(durationMin)) continue;
      const joinTime = parseIstDateTime(r[2]);
      const leaveTime = parseIstDateTime(r[3]);

      let person = attendees.get(email);
      if (!person) {
        person = { email, names: [], sessions: [], chat: [] };
        attendees.set(email, person);
      }
      if (name && !person.names.includes(name)) person.names.push(name);
      person.sessions.push({ joinTime, leaveTime, durationMin });
    }

    return { title, hostEmail, sessionStart, sessionEnd, totalDurationMin, totalParticipantRows, attendees };
  }

  // Chat only carries display names, not emails — map back to the attendee via the name(s) seen for
  // them in the participants file. Elapsed-time format ("HH:MM:SS") is relative to session start, so
  // it converts directly to a wall-clock timestamp by adding it to sessionStart.
  private attachChat(attendees: Map<string, StoredAttendee>, chatBuffer: Buffer, sessionStart: Date): void {
    const nameToEmail = new Map<string, string>();
    for (const person of attendees.values()) {
      for (const n of person.names) {
        if (!nameToEmail.has(n)) nameToEmail.set(n, person.email);
      }
    }

    const text = chatBuffer.toString('utf-8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);
    const msgRe = /^(\d{2}):(\d{2}):(\d{2})\t([^\t]+):\t(.*)$/;

    let curEmail: string | null = null;
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
      } else if (curEmail && line.trim() && !line.startsWith('WEBVTT')) {
        const person = attendees.get(curEmail);
        if (person && person.chat.length > 0) {
          person.chat[person.chat.length - 1].msg += ' ' + line.trim();
        }
      }
    }
  }

  // ============ Listing ============
  async listWebinars(): Promise<WebinarSummary[]> {
    const db = getDatabase();
    const docs = await db
      .collection<WebinarBatchDoc>(COLLECTION)
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
  private async fetchRegistrations(): Promise<RegistrationRow[]> {
    const now = Date.now();
    if (this.registrationCache && now - this.registrationCache.ts < SHEET_CACHE_TTL_MS) return this.registrationCache.data;

    const response = await axios.get(WEBINAR_REGISTRATIONS_CSV_URL, { responseType: 'text', timeout: 20000 });
    const records: any[] = parse(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
    const rows: RegistrationRow[] = records.map((r) => ({
      name: (r['Name'] || '').trim(),
      phone: normalizePhone(r['Phone Number']),
      email: normalizeEmail(r['Email']),
      webinarDate: parseLooseDate((r['Offering'] || '').trim()),
    }));

    this.registrationCache = { data: rows, ts: now };
    return rows;
  }

  private async fetchPaidSheet(): Promise<PaidSheetRow[]> {
    const now = Date.now();
    if (this.paidCache && now - this.paidCache.ts < SHEET_CACHE_TTL_MS) return this.paidCache.data;

    const response = await axios.get(WEBINAR_PAID_CSV_URL, { responseType: 'text', timeout: 20000 });
    const records: any[] = parse(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });
    const rows: PaidSheetRow[] = records.map((r) => {
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
  private async loadBatch(batchId: string): Promise<WebinarBatchDoc> {
    const db = getDatabase();
    const doc = await db.collection<WebinarBatchDoc>(COLLECTION).findOne({ _id: new ObjectId(batchId) });
    if (!doc) throw new Error('Webinar not found');
    return doc;
  }

  private async enrich(batch: WebinarBatchDoc): Promise<EnrichedAttendee[]> {
    const emails = batch.attendees.map((a) => a.email);
    const db = getDatabase();
    const users = emails.length
      ? await db
          .collection('userdetail')
          .find({ email: { $in: emails } })
          .project({ email: 1, type: 1, mobile: 1, whatsappNumber: 1, createdOn: 1 })
          .toArray()
      : [];
    const userByEmail = new Map(users.map((u: any) => [normalizeEmail(u.email), u]));

    const [paidSheet, registrations] = await Promise.all([this.fetchPaidSheet(), this.fetchRegistrations()]);
    const paidByEmail = new Map(paidSheet.filter((r) => r.email).map((r) => [r.email, r]));
    const regByEmail = new Map(registrations.filter((r) => r.email).map((r) => [r.email, r]));

    return batch.attendees.map((a) => {
      const u: any = userByEmail.get(a.email);
      const paidRow = paidByEmail.get(a.email);
      const regRow = regByEmail.get(a.email);

      const signedUp = !!u;
      // A Full Paid sheet row dated to THIS webinar's own date is this session's live conversion
      // being staged into the sheet, not a payment from before it — only count it as "previously
      // paid" when its batch date is unparseable (assume prior, conservatively) or strictly earlier.
      const paidRowIsPrior = !!(paidRow && paidRow.isPaid && (!paidRow.batchDate || paidRow.batchDate.getTime() < batch.webinarDate.getTime()));
      const previouslyPaid = !!(u && TRIBE_TYPES.has(u.type)) || paidRowIsPrior;
      const previouslyPaidOn = u && TRIBE_TYPES.has(u.type) && u.createdOn ? new Date(u.createdOn).toISOString() : paidRowIsPrior ? paidRow?.rawBatchDate || null : null;

      const paidEvidence = this.findPaidEvidence(a.chat);
      const paid5kThisSession = !!paidEvidence;

      const totalMin = a.sessions.reduce((sum, s) => sum + s.durationMin, 0);
      const lastLeave = a.sessions.reduce((max, s) => (s.leaveTime > max ? s.leaveTime : max), a.sessions[0]?.leaveTime || new Date(0));

      const number = u?.mobile || u?.whatsappNumber || regRow?.phone || paidRow?.phone || a.email;

      const signedUpBeforeSession = !!(u && u.createdOn && new Date(u.createdOn) < batch.webinarDate);

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
        paid5kThisSession,
        paidEvidence,
        signedUpBeforeSession,
      };
    });
  }

  private findPaidEvidence(chat: ChatMsg[]): { msg: string; elapsedSec: number } | null {
    for (const c of chat) {
      if (PAID_CHAT_PATTERNS.some((re) => re.test(c.msg))) return { msg: c.msg, elapsedSec: c.elapsedSec };
    }
    return null;
  }

  // ============ Report (7 summary cards) ============
  async getReport(batchId: string, attendedThresholdMin: number): Promise<WebinarReport> {
    const batch = await this.loadBatch(batchId);
    const enriched = await this.enrich(batch);
    const registrations = await this.fetchRegistrations();

    const sameDayRegs = registrations.filter((r) => r.webinarDate && r.webinarDate.getTime() === batch.webinarDate.getTime());
    const registrationDataAvailable = sameDayRegs.length > 0;
    const attendeeEmails = new Set(enriched.map((e) => e.email));
    const registeredViaFunnelCount = sameDayRegs.filter((r) => r.email && attendeeEmails.has(r.email)).length;

    // Anyone with a registration-sheet row dated strictly BEFORE this webinar — i.e. they came in
    // through the funnel for an earlier batch, not this one. Previously-paid people are excluded so
    // this bucket and the Previously Paid card never overlap.
    const priorRegEmails = new Set(registrations.filter((r) => r.email && r.webinarDate && r.webinarDate.getTime() < batch.webinarDate.getTime()).map((r) => r.email));

    const total = enriched.length;
    const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0);

    const previouslyPaidList = enriched.filter((e) => e.previouslyPaid);
    const fromPreviousWebinarCount = enriched.filter((e) => !e.previouslyPaid && priorRegEmails.has(e.email)).length;
    const organicCount = Math.max(0, total - registeredViaFunnelCount - fromPreviousWebinarCount - previouslyPaidList.length);
    const attendedList = enriched.filter((e) => e.totalMin >= attendedThresholdMin);

    const middleCutoff = new Date(batch.sessionStart.getTime() + (batch.totalDurationMin / 2) * 60000);
    const endCutoff = new Date(batch.sessionStart.getTime() + 120 * 60000);
    const stayedTillMiddleCount = attendedList.filter((e) => e.lastLeave >= middleCutoff).length;
    const stayedTillEnd2hrCount = attendedList.filter((e) => e.lastLeave >= endCutoff).length;

    const totalChats = enriched.reduce((sum, e) => sum + e.chatCount, 0);
    const avgAttendedDurationMin = attendedList.length > 0 ? Math.round((attendedList.reduce((sum, e) => sum + e.totalMin, 0) / attendedList.length) * 10) / 10 : null;
    const avgRejoinsAttended = attendedList.length > 0 ? Math.round((attendedList.reduce((sum, e) => sum + e.rejoins, 0) / attendedList.length) * 100) / 100 : null;
    const peak = computePeakConcurrency(batch.attendees);

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
        totalRegistered: total,
        registeredViaFunnel: { count: registeredViaFunnelCount, pct: pct(registeredViaFunnelCount, total) },
        fromPreviousWebinar: { count: fromPreviousWebinarCount, pct: pct(fromPreviousWebinarCount, total) },
        previouslyPaid: { count: previouslyPaidList.length, pct: pct(previouslyPaidList.length, total) },
        organic: { count: organicCount, pct: pct(organicCount, total) },
        attended: { count: attendedList.length, pct: pct(attendedList.length, total) },
        totalChats,
        avgAttendedDurationMin,
        avgRejoinsAttended,
        peakConcurrent: { count: peak.count, atTime: peak.atTime ? peak.atTime.toISOString() : null },
        stayedTillMiddle: { count: stayedTillMiddleCount, pct: pct(stayedTillMiddleCount, attendedList.length) },
        stayedTillEnd2hr: batch.totalDurationMin >= 120 ? { count: stayedTillEnd2hrCount, pct: pct(stayedTillEnd2hrCount, attendedList.length) } : null,
      },
      registrationDataAvailable,
    };
  }

  // ============ Main / Not Joined tables ============
  // Split by the SAME dynamic attended threshold the summary cards use (not a fixed ">0 minutes"
  // cutoff) — otherwise raising/lowering the threshold moves people between "attended" on the cards
  // and the two tables inconsistently (e.g. the Attended card says 70 but Main still lists all 109).
  private static readonly MAIN_SORT_FIELDS = ['name', 'number', 'batchLabel', 'paid5k', 'totalMin', 'rejoins', 'chatCount', 'signedUp'];
  private static readonly NOT_JOINED_SORT_FIELDS = ['name', 'number', 'batchLabel', 'paid5k', 'signedUp'];
  private static readonly NOT_REGISTERED_SORT_FIELDS = ['name', 'number', 'signedUp', 'signedUpBeforeSession'];
  private static readonly KEYWORD_SORT_FIELDS = ['name', 'number', 'email', 'timeIso'];

  private async mainRows(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<MainRow[]> {
    const batch = await this.loadBatch(batchId);
    const enriched = await this.enrich(batch);
    const batchLabel = ordinalLabel(batch.webinarDate);

    let rows: MainRow[] = enriched
      .filter((e) => e.totalMin >= attendedThresholdMin)
      .map((e) => ({
        email: e.email,
        name: e.name,
        number: e.number,
        batchLabel,
        paid5k: e.previouslyPaid || e.paid5kThisSession,
        totalMin: Math.round(e.totalMin * 10) / 10,
        rejoins: e.rejoins,
        chatCount: e.chatCount,
        signedUp: e.signedUp,
      }));

    rows = sortBy ? sortRows(rows, sortBy, sortDir, WebinarAnalysisService.MAIN_SORT_FIELDS) : rows.sort((a, b) => b.totalMin - a.totalMin);
    return rows;
  }

  async getMainTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<PagedResult<MainRow>> {
    const rows = await this.mainRows(batchId, attendedThresholdMin, sortBy, sortDir);
    return this.paginate(rows, page, pageSize);
  }

  async downloadMainCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<string> {
    const rows = await this.mainRows(batchId, attendedThresholdMin, sortBy, sortDir);
    const header = 'Name,Number,Batch,Paid (5k),Total Time (min),Rejoins,Chats,Signed Up\n';
    const body = rows
      .map((r) => [r.name, r.number, r.batchLabel, r.paid5k ? 'Yes' : 'No', r.totalMin, r.rejoins, r.chatCount, r.signedUp ? 'Yes' : 'No'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    return header + body;
  }

  private async notJoinedRows(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<NotJoinedRow[]> {
    const batch = await this.loadBatch(batchId);
    const enriched = await this.enrich(batch);
    const batchLabel = ordinalLabel(batch.webinarDate);

    const rows: NotJoinedRow[] = enriched
      .filter((e) => e.totalMin < attendedThresholdMin)
      .map((e) => ({ email: e.email, name: e.name, number: e.number, batchLabel, paid5k: e.previouslyPaid || e.paid5kThisSession, signedUp: e.signedUp }));

    return sortRows(rows, sortBy, sortDir, WebinarAnalysisService.NOT_JOINED_SORT_FIELDS);
  }

  async getNotJoinedTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<PagedResult<NotJoinedRow>> {
    const rows = await this.notJoinedRows(batchId, attendedThresholdMin, sortBy, sortDir);
    return this.paginate(rows, page, pageSize);
  }

  async downloadNotJoinedCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<string> {
    const rows = await this.notJoinedRows(batchId, attendedThresholdMin, sortBy, sortDir);
    const header = 'Name,Number,Batch,Paid (5k),Signed Up\n';
    const body = rows
      .map((r) => [r.name, r.number, r.batchLabel, r.paid5k ? 'Yes' : 'No', r.signedUp ? 'Yes' : 'No'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    return header + body;
  }

  // ============ Not Registered table ============
  private async notRegisteredRows(batchId: string): Promise<{ rows: NotRegisteredRow[]; registrationDataAvailable: boolean }> {
    const batch = await this.loadBatch(batchId);
    const attendeeEmails = new Set(batch.attendees.map((a) => a.email));
    const registrations = await this.fetchRegistrations();
    const sameDayRegs = registrations.filter((r) => r.webinarDate && r.webinarDate.getTime() === batch.webinarDate.getTime() && r.email);

    const missing = sameDayRegs.filter((r) => !attendeeEmails.has(r.email));
    const emails = missing.map((r) => r.email);
    const db = getDatabase();
    const users = emails.length
      ? await db.collection('userdetail').find({ email: { $in: emails } }).project({ email: 1, mobile: 1, whatsappNumber: 1, createdOn: 1 }).toArray()
      : [];
    const userByEmail = new Map(users.map((u: any) => [normalizeEmail(u.email), u]));

    const rows: NotRegisteredRow[] = missing.map((r) => {
      const u: any = userByEmail.get(r.email);
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

  async getNotRegisteredTable(batchId: string, page: number, pageSize: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<PagedResult<NotRegisteredRow> & { registrationDataAvailable: boolean }> {
    const { rows, registrationDataAvailable } = await this.notRegisteredRows(batchId);
    const sorted = sortRows(rows, sortBy, sortDir, WebinarAnalysisService.NOT_REGISTERED_SORT_FIELDS);
    return { ...this.paginate(sorted, page, pageSize), registrationDataAvailable };
  }

  async downloadNotRegisteredCsv(batchId: string, sortBy?: string, sortDir: SortDir = 'desc'): Promise<string> {
    const { rows } = await this.notRegisteredRows(batchId);
    const sorted = sortRows(rows, sortBy, sortDir, WebinarAnalysisService.NOT_REGISTERED_SORT_FIELDS);
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
  private async keywordRows(batchId: string, keyword: string, sortBy?: string, sortDir: SortDir = 'desc'): Promise<KeywordRow[]> {
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw) return [];

    const batch = await this.loadBatch(batchId);
    const enriched = await this.enrich(batch);
    const numberByEmail = new Map(enriched.map((e) => [e.email, e.number]));
    const nameByEmail = new Map(enriched.map((e) => [e.email, e.name]));

    const rows: KeywordRow[] = [];
    for (const a of batch.attendees) {
      for (const c of a.chat) {
        if (c.msg.toLowerCase().includes(kw)) {
          rows.push({
            email: a.email,
            name: nameByEmail.get(a.email) || a.email,
            number: numberByEmail.get(a.email) || a.email,
            timeIso: new Date(batch.sessionStart.getTime() + c.elapsedSec * 1000).toISOString(),
          });
        }
      }
    }

    return sortBy ? sortRows(rows, sortBy, sortDir, WebinarAnalysisService.KEYWORD_SORT_FIELDS) : rows.sort((a, b) => a.timeIso.localeCompare(b.timeIso));
  }

  async getKeywordMatches(batchId: string, keyword: string, page: number, pageSize: number, sortBy?: string, sortDir: SortDir = 'desc'): Promise<PagedResult<KeywordRow>> {
    const rows = await this.keywordRows(batchId, keyword, sortBy, sortDir);
    return this.paginate(rows, page, pageSize);
  }

  async downloadKeywordCsv(batchId: string, keyword: string, sortBy?: string, sortDir: SortDir = 'desc'): Promise<string> {
    const rows = await this.keywordRows(batchId, keyword, sortBy, sortDir);
    const header = 'Name,Number,Email,Time (IST)\n';
    const body = rows
      .map((r) => {
        const istTime = new Date(r.timeIso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        return [r.name, r.number, r.email, istTime].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
      })
      .join('\n');
    return header + body;
  }

  // ============ Attendee drill-down ============
  async getAttendeeDetail(batchId: string, email: string): Promise<AttendeeDetail> {
    const batch = await this.loadBatch(batchId);
    const target = normalizeEmail(email);
    const raw = batch.attendees.find((a) => a.email === target);
    if (!raw) throw new Error('Attendee not found in this webinar');

    const enriched = await this.enrich(batch);
    const e = enriched.find((x) => x.email === target)!;

    return {
      email: raw.email,
      name: e.name,
      number: e.number,
      signedUp: e.signedUp,
      previouslyPaid: e.previouslyPaid,
      previouslyPaidOn: e.previouslyPaidOn,
      paid5k: e.previouslyPaid || e.paid5kThisSession,
      paidEvidence: e.paidEvidence
        ? { msg: e.paidEvidence.msg, wallClock: new Date(batch.sessionStart.getTime() + e.paidEvidence.elapsedSec * 1000).toISOString() }
        : null,
      totalMin: Math.round(e.totalMin * 10) / 10,
      sessions: raw.sessions.map((s) => ({ joinTime: s.joinTime.toISOString(), leaveTime: s.leaveTime.toISOString(), durationMin: s.durationMin })),
      chat: raw.chat.map((c) => ({ wallClock: new Date(batch.sessionStart.getTime() + c.elapsedSec * 1000).toISOString(), msg: c.msg })),
    };
  }

  private paginate<T>(rows: T[], page: number, pageSize: number): PagedResult<T> {
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
  }
}
