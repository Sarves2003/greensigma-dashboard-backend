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

const GENERIC_REFERRAL_CODES = new Set(['SIGMA2026', 'SIGMA2025']);

const DEFAULT_BATCH_DATES = [
  '21Jun2025', '5July2025', '19July2025', '2Aug2025', '16Aug2025', '30Aug2025',
  '13Sep2025', '27Sep2025', '4Oct2025', '11Oct2025', '25Oct2025', '08Nov2025',
  '22Nov2025', '06Dec2025', '20Dec-2025', '03Jan2026', '17Jan2026', '31Jan2026',
  '7Feb2026', '14Feb2026', '21Feb2026', '14Mar2026', '4Apr2026', '18Apr2026',
  '9May2026', '23May2026', '6Jun2026', '20Jun2026', '4Jul2026', '18Jul2026', '1Aug2026',
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Parses compact forms like "21Jun2025", "03Jan2026", "20Dec-2025".
function parseFlexibleDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[-/]/g, '').toLowerCase();
  const m = s.match(/^(\d{1,2})([a-z]+)(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_MAP[m[2]] ?? MONTH_MAP[m[2].slice(0, 3)] ?? MONTH_MAP[m[2].slice(0, 4)];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

// Parses "Momentum Investing Webinar - 20th JUNE 2026" style Offering strings.
function parseOfferingDate(offering: string): Date | null {
  if (!offering) return null;
  const m = offering.match(/(\d{1,2})\w*\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase();
  const month = MONTH_MAP[monthKey] ?? MONTH_MAP[monthKey.slice(0, 3)] ?? MONTH_MAP[monthKey.slice(0, 4)];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

// Referral codes are free-typed at signup-link creation time, so the same promo code can land in
// the DB as "stonkzz26", "Stonkzz26", "STONKZZ26", etc. Without normalizing, those fragment into
// separate funnel rows instead of one — capitalize to a single canonical form before anything else
// touches the code (including the SIGMA2026/2025 generic-code check below).
function normalizeReferralCode(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

interface RegistrationRow {
  name: string;
  phone: string;
  email: string;
  offering: string;
  webinarDate: Date | null;
  bookedOn: Date | null;
}

interface PaidRow {
  name: string;
  email: string;
  phone: string;
  rawBatchDate: string;
}

interface BatchDateDoc {
  _id: ObjectId;
  date: Date;
  label: string;
}

export interface BatchResolution {
  batch: Date | null;
  method: 'exact' | 'year-typo-fix' | 'nearest-day-fuzzy' | 'unresolved' | 'unparseable';
}

export class FunnelAnalysisService {
  private registrationCache: { data: RegistrationRow[]; ts: number } | null = null;
  private paidCache: { data: PaidRow[]; ts: number } | null = null;

  // ============ Webinar batch dates (user-managed, persisted) ============
  async getBatchDates(): Promise<BatchDateDoc[]> {
    const db = getDatabase();
    const col = db.collection<BatchDateDoc>('webinar_batch_dates');

    const count = await col.countDocuments();
    if (count === 0) {
      const seeded = DEFAULT_BATCH_DATES.map((raw) => {
        const date = parseFlexibleDate(raw);
        return { date: date!, label: raw };
      }).filter((d) => d.date);
      if (seeded.length > 0) {
        await col.insertMany(seeded as any);
      }
    }

    return col.find().sort({ date: 1 }).toArray();
  }

  async addBatchDate(dateStr: string): Promise<void> {
    const db = getDatabase();
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    await db.collection('webinar_batch_dates').insertOne({
      date,
      label: date.toISOString().slice(0, 10),
    } as any);
  }

  async removeBatchDate(id: string): Promise<void> {
    const db = getDatabase();
    await db.collection('webinar_batch_dates').deleteOne({ _id: new ObjectId(id) } as any);
  }

  private async getSortedMasterDates(): Promise<Date[]> {
    const docs = await this.getBatchDates();
    return docs.map((d) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
  }

  resolveBatch(rawDate: string, masterDates: Date[]): BatchResolution {
    const parsed = parseFlexibleDate(rawDate);
    if (!parsed) return { batch: null, method: 'unparseable' };

    const exact = masterDates.find((md) => md.getTime() === parsed.getTime());
    if (exact) return { batch: exact, method: 'exact' };

    const dmMatch = masterDates.find(
      (md) => md.getUTCDate() === parsed.getUTCDate() && md.getUTCMonth() === parsed.getUTCMonth()
    );
    if (dmMatch) return { batch: dmMatch, method: 'year-typo-fix' };

    let best: Date | null = null;
    let bestDiff = Infinity;
    for (const md of masterDates) {
      const diff = Math.abs(parsed.getTime() - md.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = md;
      }
    }
    if (best && bestDiff <= 3) return { batch: best, method: 'nearest-day-fuzzy' };

    return { batch: null, method: 'unresolved' };
  }

  // ============ Sheet fetching (cached) ============
  private async fetchRegistrations(): Promise<RegistrationRow[]> {
    const now = Date.now();
    if (this.registrationCache && now - this.registrationCache.ts < SHEET_CACHE_TTL_MS) {
      return this.registrationCache.data;
    }

    const response = await axios.get(WEBINAR_REGISTRATIONS_CSV_URL, { responseType: 'text', timeout: 20000 });
    const records: any[] = parse(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });

    const rows: RegistrationRow[] = records.map((r) => {
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

  private async fetchPaidList(): Promise<PaidRow[]> {
    const now = Date.now();
    if (this.paidCache && now - this.paidCache.ts < SHEET_CACHE_TTL_MS) {
      return this.paidCache.data;
    }

    const response = await axios.get(WEBINAR_PAID_CSV_URL, { responseType: 'text', timeout: 20000 });
    const records: any[] = parse(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true });

    const rows: PaidRow[] = records.map((r) => ({
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
  private async buildWebinarYearLookup(): Promise<{ byPhone: Map<string, number>; byEmail: Map<string, number> }> {
    const registrations = await this.fetchRegistrations();
    const byPhone = new Map<string, number>();
    const byEmail = new Map<string, number>();

    for (const r of registrations) {
      if (!r.webinarDate) continue;
      const year = r.webinarDate.getUTCFullYear();

      if (r.phone) {
        const existing = byPhone.get(r.phone);
        if (existing === undefined || year < existing) byPhone.set(r.phone, year);
      }
      if (r.email) {
        const existing = byEmail.get(r.email);
        if (existing === undefined || year < existing) byEmail.set(r.email, year);
      }
    }

    return { byPhone, byEmail };
  }

  // Webinar-driven and organic-default conversions are all one funnel — SIGMA2026 — regardless of
  // which calendar year the webinar happened in, or whether referalCode literally says SIGMA2025.
  private computeFunnelTag(referalCode: string | null | undefined, webinarYear: number | null): string {
    const normalizedCode = normalizeReferralCode(referalCode);
    const specificCode = normalizedCode && !GENERIC_REFERRAL_CODES.has(normalizedCode) ? normalizedCode : null;
    const webinarTag = webinarYear ? 'SIGMA2026' : null;

    if (webinarTag && specificCode) return `${webinarTag}, ${specificCode}`;
    if (specificCode) return specificCode;
    return 'SIGMA2026';
  }

  private async getTaggedUsers(): Promise<{ tag: string; type: string; createdOn: Date }[]> {
    const db = getDatabase();
    const users = await db
      .collection('userdetail')
      .find({})
      .project({ referalCode: 1, type: 1, createdOn: 1, mobile: 1, whatsappNumber: 1, email: 1 })
      .toArray();

    const { byPhone, byEmail } = await this.buildWebinarYearLookup();

    return users.map((u: any) => {
      const phone = normalizePhone(u.mobile || u.whatsappNumber);
      const email = normalizeEmail(u.email);
      const webinarYear = (phone ? byPhone.get(phone) : undefined) ?? (email ? byEmail.get(email) : undefined) ?? null;
      const tag = this.computeFunnelTag(u.referalCode, webinarYear);
      return { tag, type: u.type, createdOn: new Date(u.createdOn) };
    });
  }

  // ============ Segment 1: period-filtered Tribe conversions by funnel tag ============
  async getSegment1(startDate: Date, endDate: Date): Promise<any> {
    const tagged = await this.getTaggedUsers();
    const periodTribe = tagged.filter(
      (u) => u.type === 'Tribe' && u.createdOn >= startDate && u.createdOn < endDate
    );

    const counts = new Map<string, number>();
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
  async getSegment2(): Promise<any> {
    const tagged = await this.getTaggedUsers();

    const totals = new Map<string, number>();
    const conversions = new Map<string, number>();

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
  async getSegment3(): Promise<any> {
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
    const registrantsByDate = new Map<string, number>();
    for (const r of registrations) {
      if (!r.webinarDate) continue;
      const key = r.webinarDate.toISOString().slice(0, 10);
      registrantsByDate.set(key, (registrantsByDate.get(key) || 0) + 1);
    }

    // Conversions credited per batch.
    const conversionsByBatch = new Map<string, number>();
    for (const r of resolved) {
      if (!r.resolution.batch) continue;
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
    const regsByPhone = new Map<string, Date[]>();
    const regsByEmail = new Map<string, Date[]>();
    for (const r of registrations) {
      if (!r.webinarDate) continue;
      if (r.phone) {
        if (!regsByPhone.has(r.phone)) regsByPhone.set(r.phone, []);
        regsByPhone.get(r.phone)!.push(r.webinarDate);
      }
      if (r.email) {
        if (!regsByEmail.has(r.email)) regsByEmail.set(r.email, []);
        regsByEmail.get(r.email)!.push(r.webinarDate);
      }
    }

    const attemptCounts = new Map<number, number>();
    let attemptDataAvailable = 0;
    for (const r of resolved) {
      if (!r.resolution.batch) continue;
      const datesByPhone = r.phone ? regsByPhone.get(r.phone) : undefined;
      const datesByEmail = r.email ? regsByEmail.get(r.email) : undefined;
      const dates = datesByPhone && datesByPhone.length > 0 ? datesByPhone : datesByEmail;
      if (!dates || dates.length === 0) continue;

      const attemptNumber = dates.filter((d) => d.getTime() <= r.resolution.batch!.getTime()).length;
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
}
