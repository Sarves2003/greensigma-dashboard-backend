import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '../config/database';

const WEBINAR_PAID_CSV_URL =
  process.env.WEBINAR_PAID_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUirjwWnGgKXI6-u5PHlpjuiNastnqr_FBdIfMFthKOoQLrKz_4McjONeLYgy10BCcdV3eKLo-vqvr/pub?gid=444686195&single=true&output=csv';

const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;

// The sheet's "Pinged(Yes/No)" column only started carrying a real Full Paid / Emandate /
// Refunded distinction from this webinar batch onward — every batch before it predates the
// e-mandate/installment process entirely, so anyone listed there is just Full Paid (or Refunded,
// if the notes say so).
const EMANDATE_ERA_START = new Date(Date.UTC(2026, 4, 23)); // 23 May 2026

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

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

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').toString().replace(/\D/g, '');
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').toString().trim().toLowerCase();
}

export type PaymentStatus = 'Full Paid' | 'Emandate' | 'Refunded' | 'Cancelled' | 'Pending';

// Best-effort keyword classification of the sheet's free-typed sales notes. Before the emandate
// era, the column never carries these categories at all — everyone on the sheet has already paid
// at least the initial amount, so default to Full Paid unless the note says otherwise.
function classifyPaymentStatus(pingedRaw: string | null | undefined, webinarDate: Date | null): PaymentStatus {
  const s = (pingedRaw || '').trim().toLowerCase();

  if (!webinarDate || webinarDate.getTime() < EMANDATE_ERA_START.getTime()) {
    return s.includes('refund') ? 'Refunded' : 'Full Paid';
  }

  if (s.includes('refund')) return 'Refunded';
  if (s.includes('full paid')) return 'Full Paid';
  if (s.includes('cancel')) return 'Cancelled';
  if (s.includes('emandate') && !s.includes('not completed') && !s.includes('failed')) return 'Emandate';
  return 'Pending';
}

interface PaidRow {
  name: string;
  email: string;
  phone: string;
  rawBatchDate: string;
  pinged: string;
}

interface SubscribeDoc {
  status: string;
  mandate_status: string;
  created_at: Date | null;
  payment_history: Array<{ status: string; payment_created_at: string | null }>;
}

export interface EmandateDayPayment {
  date: string | null;
  status: 'captured' | 'refunded' | null;
}

export type MandateState = 'active' | 'cancelled' | 'halted' | 'not_done' | 'not_applicable';

export interface EmandateRow {
  name: string;
  phone: string;
  email: string;
  paymentStatus: PaymentStatus;
  payment2: EmandateDayPayment | null;
  payment3: EmandateDayPayment | null;
  mandateState: MandateState;
  // Both remaining installments captured, or never owed any (paid in full upfront) — nothing left
  // to chase from this person.
  settled: boolean;
  paymentDoneCount: number;
  remark: string;
}

export interface EmandateSummary {
  totalInitialPaid: number;
  totalFullPaid: number;
  remaining: number;
  completed: number;
  completedPct: number;
  notDone: number;
  cancelled: number;
  halted: number;
  emandateEraApplies: boolean;
}

export interface EmandateOverviewBucketUser {
  name: string;
  phone: string;
  batchDate: string;
  paymentDoneCount: number;
  settled: boolean;
}

export interface EmandateOverviewBatchPoint {
  batchDate: string;
  initialCompletionPct: number | null;
  fullPaymentCompletionPct: number | null;
}

export interface EmandateOverview {
  totalOwesEmandate: number;
  completed: number;
  completedPct: number;
  notDone: number;
  notDonePct: number;
  cancelled: number;
  cancelledPct: number;
  halted: number;
  haltedPct: number;
  emandateEraApplies: boolean;
  buckets: {
    notDone: EmandateOverviewBucketUser[];
    cancelled: EmandateOverviewBucketUser[];
    halted: EmandateOverviewBucketUser[];
  };
  chart: EmandateOverviewBatchPoint[];
}

export class EmandateTrackerService {
  private paidCache: { data: PaidRow[]; ts: number } | null = null;

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
      pinged: (r['Pinged(Yes/No)'] || '').trim(),
    }));

    this.paidCache = { data: rows, ts: now };
    return rows;
  }

  // gsSubscribe has no index on phone/email and a person can have many abandoned attempts, so
  // this loads the whole (currently ~900-doc) collection once per request and picks, per phone
  // and per email, whichever doc is `active`, else whichever is most recently created.
  private async fetchBestSubscribeDocs(): Promise<{ byPhone: Map<string, SubscribeDoc>; byEmail: Map<string, SubscribeDoc> }> {
    const db = getDatabase();
    const docs = await db.collection('gsSubscribe').find({}).toArray();

    const byPhone = new Map<string, SubscribeDoc>();
    const byEmail = new Map<string, SubscribeDoc>();

    const consider = (map: Map<string, SubscribeDoc>, key: string, doc: any) => {
      if (!key) return;
      const candidate: SubscribeDoc = {
        status: doc.status || '',
        mandate_status: doc.mandate_status || '',
        created_at: doc.created_at ? new Date(doc.created_at) : null,
        payment_history: Array.isArray(doc.payment_history) ? doc.payment_history : [],
      };
      const existing = map.get(key);
      if (!existing) {
        map.set(key, candidate);
        return;
      }
      if (existing.mandate_status === 'active') return; // an active doc always wins
      if (candidate.mandate_status === 'active') {
        map.set(key, candidate);
        return;
      }
      const existingTime = existing.created_at?.getTime() || 0;
      const candidateTime = candidate.created_at?.getTime() || 0;
      if (candidateTime > existingTime) map.set(key, candidate);
    };

    for (const doc of docs) {
      consider(byPhone, normalizePhone(doc.number), doc);
      consider(byEmail, normalizeEmail(doc.email), doc);
    }

    return { byPhone, byEmail };
  }

  private toDayPayment(doc: SubscribeDoc | undefined, index: number): EmandateDayPayment | null {
    const entry = doc?.payment_history?.[index];
    if (!entry) return null;
    const status = entry.status === 'captured' || entry.status === 'refunded' ? entry.status : null;
    return { date: entry.payment_created_at || null, status };
  }

  // Shared by getEmandateTable (single batch) and getOverview (many batches aggregated) so the
  // classification/matching logic can't drift between the two views.
  private buildBatchRows(
    batchDateKey: string,
    paidRows: PaidRow[],
    byPhone: Map<string, SubscribeDoc>,
    byEmail: Map<string, SubscribeDoc>,
    remarkDocs: any[]
  ): { rows: EmandateRow[]; summary: EmandateSummary } {
    const batchDate = new Date(`${batchDateKey}T00:00:00.000Z`);
    const emandateEraApplies = batchDate.getTime() >= EMANDATE_ERA_START.getTime();

    const matchesBatch = (rawBatchDate: string): boolean => {
      const parsed = parseFlexibleDate(rawBatchDate);
      if (!parsed) return false;
      if (parsed.getTime() === batchDate.getTime()) return true;
      if (parsed.getUTCDate() === batchDate.getUTCDate() && parsed.getUTCMonth() === batchDate.getUTCMonth()) return true;
      const diffDays = Math.abs(parsed.getTime() - batchDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    };

    const remarkByPhone = new Map<string, { remark: string; statusOverride: PaymentStatus | null }>();
    for (const r of remarkDocs) {
      remarkByPhone.set(r.phone, { remark: r.remark || '', statusOverride: r.paymentStatusOverride || null });
    }

    const rows: EmandateRow[] = [];
    let completed = 0, cancelled = 0, halted = 0, notDone = 0, totalFullPaid = 0;

    paidRows.forEach((p) => {
      if (!matchesBatch(p.rawBatchDate)) return;

      const defaultStatus = classifyPaymentStatus(p.pinged, batchDate);
      const saved = remarkByPhone.get(p.phone);
      const paymentStatus = saved?.statusOverride || defaultStatus;
      if (paymentStatus === 'Full Paid') totalFullPaid++;

      const subDoc = byPhone.get(p.phone) || byEmail.get(p.email);
      let mandateState: MandateState = 'not_applicable';

      if (paymentStatus !== 'Full Paid' && emandateEraApplies) {
        if (subDoc?.mandate_status === 'active') {
          mandateState = 'active';
          completed++;
        } else if (subDoc?.mandate_status === 'cancelled') {
          mandateState = 'cancelled';
          cancelled++;
        } else if (subDoc?.mandate_status === 'inactive') {
          mandateState = 'halted';
          halted++;
        } else {
          mandateState = 'not_done';
          notDone++;
        }
      }

      const payment2 = this.toDayPayment(subDoc, 0);
      const payment3 = this.toDayPayment(subDoc, 1);
      const paymentDoneCount = (payment2?.status === 'captured' ? 1 : 0) + (payment3?.status === 'captured' ? 1 : 0);
      const settled = paymentStatus === 'Full Paid' || (payment2?.status === 'captured' && payment3?.status === 'captured');

      rows.push({
        name: p.name,
        phone: p.phone,
        email: p.email,
        paymentStatus,
        payment2,
        payment3,
        mandateState,
        settled,
        paymentDoneCount,
        remark: saved?.remark || '',
      });
    });

    const totalInitialPaid = rows.length;
    const remaining = totalInitialPaid - totalFullPaid;

    const summary: EmandateSummary = {
      totalInitialPaid,
      totalFullPaid,
      remaining,
      completed,
      completedPct: remaining > 0 ? parseFloat(((completed / remaining) * 100).toFixed(1)) : 0,
      notDone,
      cancelled,
      halted,
      emandateEraApplies,
    };

    return { rows, summary };
  }

  async getEmandateTable(batchDateKey: string): Promise<{ rows: EmandateRow[]; summary: EmandateSummary; batchDate: string }> {
    const [paidRows, { byPhone, byEmail }, remarkDocs] = await Promise.all([
      this.fetchPaidList(),
      this.fetchBestSubscribeDocs(),
      getDatabase().collection('emandate_remarks').find({ batchDate: batchDateKey }).toArray(),
    ]);

    const { rows, summary } = this.buildBatchRows(batchDateKey, paidRows, byPhone, byEmail, remarkDocs as any[]);
    return { rows, summary, batchDate: batchDateKey };
  }

  // Aggregates the same per-batch classification across an arbitrary set of batches (this/previous/
  // last-2/custom, decided by the frontend) — used by the new overview card above the single-batch
  // table. Refunded users are excluded from the "full payment completion" denominator since they
  // were never going to complete further payments in the first place.
  async getOverview(batchDateKeys: string[]): Promise<EmandateOverview> {
    const [paidRows, { byPhone, byEmail }, remarkDocs] = await Promise.all([
      this.fetchPaidList(),
      this.fetchBestSubscribeDocs(),
      getDatabase().collection('emandate_remarks').find({ batchDate: { $in: batchDateKeys } }).toArray(),
    ]);

    const remarksByBatch = new Map<string, any[]>();
    for (const r of remarkDocs as any[]) {
      if (!remarksByBatch.has(r.batchDate)) remarksByBatch.set(r.batchDate, []);
      remarksByBatch.get(r.batchDate)!.push(r);
    }

    let totalOwesEmandate = 0, completed = 0, notDone = 0, cancelled = 0, halted = 0;
    let emandateEraApplies = false;
    const buckets: EmandateOverview['buckets'] = { notDone: [], cancelled: [], halted: [] };
    const chart: EmandateOverviewBatchPoint[] = [];

    for (const batchDateKey of batchDateKeys) {
      const { rows, summary } = this.buildBatchRows(batchDateKey, paidRows, byPhone, byEmail, remarksByBatch.get(batchDateKey) || []);

      totalOwesEmandate += summary.remaining;
      completed += summary.completed;
      notDone += summary.notDone;
      cancelled += summary.cancelled;
      halted += summary.halted;
      if (summary.emandateEraApplies) emandateEraApplies = true;

      for (const row of rows) {
        const bucketEntry: EmandateOverviewBucketUser = {
          name: row.name,
          phone: row.phone,
          batchDate: batchDateKey,
          paymentDoneCount: row.paymentDoneCount,
          settled: row.settled,
        };
        if (row.mandateState === 'not_done') buckets.notDone.push(bucketEntry);
        else if (row.mandateState === 'cancelled') buckets.cancelled.push(bucketEntry);
        else if (row.mandateState === 'halted') buckets.halted.push(bucketEntry);
      }

      const refundedCount = rows.filter((r) => r.paymentStatus === 'Refunded').length;
      const settledCount = rows.filter((r) => r.settled).length;
      const fullPaymentDenominator = summary.totalInitialPaid - refundedCount;

      chart.push({
        batchDate: batchDateKey,
        initialCompletionPct: summary.remaining > 0 ? summary.completedPct : null,
        fullPaymentCompletionPct: fullPaymentDenominator > 0 ? parseFloat(((settledCount / fullPaymentDenominator) * 100).toFixed(1)) : null,
      });
    }

    return {
      totalOwesEmandate,
      completed,
      completedPct: totalOwesEmandate > 0 ? parseFloat(((completed / totalOwesEmandate) * 100).toFixed(1)) : 0,
      notDone,
      notDonePct: totalOwesEmandate > 0 ? parseFloat(((notDone / totalOwesEmandate) * 100).toFixed(1)) : 0,
      cancelled,
      cancelledPct: totalOwesEmandate > 0 ? parseFloat(((cancelled / totalOwesEmandate) * 100).toFixed(1)) : 0,
      halted,
      haltedPct: totalOwesEmandate > 0 ? parseFloat(((halted / totalOwesEmandate) * 100).toFixed(1)) : 0,
      emandateEraApplies,
      buckets,
      chart,
    };
  }

  async saveRemark(phone: string, batchDate: string, remark: string): Promise<void> {
    const db = getDatabase();
    await db.collection('emandate_remarks').updateOne(
      { phone, batchDate },
      { $set: { phone, batchDate, remark, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async savePaymentStatusOverride(phone: string, batchDate: string, statusOverride: PaymentStatus | null): Promise<void> {
    const db = getDatabase();
    const update = statusOverride === null
      ? { $unset: { paymentStatusOverride: '' }, $set: { phone, batchDate, updatedAt: new Date() } }
      : { $set: { phone, batchDate, paymentStatusOverride: statusOverride, updatedAt: new Date() } };
    await db.collection('emandate_remarks').updateOne({ phone, batchDate }, update as any, { upsert: true });
  }
}
