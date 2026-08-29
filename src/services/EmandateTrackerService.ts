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

// Raw per-document shape read from gsSubscribe. A person can have many of these (one had 44 —
// mostly abandoned retries), so all downstream logic works across the full set for a person, not
// a single "best" doc.
interface SubscribeDoc {
  subscriptionId: string;
  phone: string;
  email: string;
  status: string;
  authenticatedAt: string | null;
  createdAt: Date | null;
  paymentHistory: Array<{ status: string; payment_created_at: string | null }>;
}

export interface EmandateDayPayment {
  date: string | null;
  status: 'captured' | 'refunded' | null;
}

// "Current health" of a person's most-relevant mandate — ranked active > halted > cancelled >
// not_started (never even authenticated), independent of how much progress they made historically.
// not_applicable = Full Paid, no emandate needed at all.
export type MandateState = 'active' | 'halted' | 'cancelled' | 'not_started' | 'not_applicable';

// Historical facts about a person's e-mandate journey, aggregated across every doc that matches
// their phone or email — never derived from a single "best" doc, since authentication or a
// captured payment on an older/abandoned doc still really happened even if a newer doc looks more
// current. `authenticated_at` never gets cleared once set, so "any doc has it" == "initial process
// was ever completed", regardless of what happened afterward (including halting later).
interface PersonFacts {
  initialDone: boolean;
  payments: EmandateDayPayment[]; // captured/refunded entries only, chronological, across all docs
  currentState: MandateState;
}

export interface EmandateRow {
  name: string;
  phone: string;
  email: string;
  paymentStatus: PaymentStatus;
  payment2: EmandateDayPayment | null;
  payment3: EmandateDayPayment | null;
  initialDone: boolean;
  payment2Done: boolean;
  payment3Done: boolean;
  currentState: MandateState;
  // Full Paid upfront, or completed both remaining installments via emandate — nothing left to
  // chase from this person.
  settled: boolean;
  paymentDoneCount: number;
  remark: string;
}

export interface EmandateSummary {
  totalInitialPaid: number;
  totalFullPaid: number;
  totalRefunded: number;
  owesEmandate: number; // totalInitialPaid - totalFullPaid - totalRefunded — the base every % below divides by
  initialDoneCount: number;
  initialDonePct: number | null;
  payment2DoneCount: number;
  payment2DonePct: number | null;
  payment3DoneCount: number;
  payment3DonePct: number | null;
  notDoneAtAllCount: number;
  notDoneAtAllPct: number | null;
  cancelledCount: number;
  cancelledPct: number | null;
  haltedCount: number;
  haltedPct: number | null;
  // Over the WHOLE batch (not just the owesEmandate pool): Full Paid, or completed both emandate
  // installments — the true "nothing left to collect" rate.
  overallConversionPct: number | null;
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
  owesEmandate: number;
  initialDoneCount: number;
  initialDonePct: number | null;
  payment2DoneCount: number;
  payment2DonePct: number | null;
  payment3DoneCount: number;
  payment3DonePct: number | null;
  notDoneAtAllCount: number;
  notDoneAtAllPct: number | null;
  cancelledCount: number;
  cancelledPct: number | null;
  haltedCount: number;
  haltedPct: number | null;
  emandateEraApplies: boolean;
  buckets: {
    notDoneAtAll: EmandateOverviewBucketUser[];
    cancelled: EmandateOverviewBucketUser[];
    halted: EmandateOverviewBucketUser[];
  };
  chart: EmandateOverviewBatchPoint[];
}

// One summary row per webinar batch, for the benchmark table. Same fields as EmandateSummary plus
// the batch's own label.
export interface EmandateBatchTableRow extends EmandateSummary {
  batchDate: string;
}

const STATE_PRIORITY: Record<string, number> = { active: 4, halted: 3, cancelled: 2, created: 1 };

export class EmandateTrackerService {
  private paidCache: { data: PaidRow[]; ts: number } | null = null;
  private subscribeCache: { data: SubscribeDoc[]; ts: number } | null = null;

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

  private async fetchSubscribeDocs(): Promise<SubscribeDoc[]> {
    const now = Date.now();
    if (this.subscribeCache && now - this.subscribeCache.ts < SHEET_CACHE_TTL_MS) {
      return this.subscribeCache.data;
    }

    const db = getDatabase();
    const raw = await db.collection('gsSubscribe').find({}).toArray();
    const docs: SubscribeDoc[] = raw.map((d: any) => ({
      subscriptionId: d.subscription_id || String(d._id),
      phone: normalizePhone(d.number),
      email: normalizeEmail(d.email),
      status: d.status || '',
      authenticatedAt: d.authenticated_at || null,
      createdAt: d.created_at ? new Date(d.created_at) : null,
      paymentHistory: Array.isArray(d.payment_history) ? d.payment_history : [],
    }));

    this.subscribeCache = { data: docs, ts: now };
    return docs;
  }

  private buildSubscribeIndex(docs: SubscribeDoc[]): { byPhone: Map<string, SubscribeDoc[]>; byEmail: Map<string, SubscribeDoc[]> } {
    const byPhone = new Map<string, SubscribeDoc[]>();
    const byEmail = new Map<string, SubscribeDoc[]>();
    for (const d of docs) {
      if (d.phone) {
        if (!byPhone.has(d.phone)) byPhone.set(d.phone, []);
        byPhone.get(d.phone)!.push(d);
      }
      if (d.email) {
        if (!byEmail.has(d.email)) byEmail.set(d.email, []);
        byEmail.get(d.email)!.push(d);
      }
    }
    return { byPhone, byEmail };
  }

  // Unions every doc that matches this person by either phone or email (deduped by subscription
  // id, since the same doc can legitimately match both), then derives facts across the whole set —
  // never from a single "most recent" doc, per the halted/authenticated_at investigation above.
  private getPersonFacts(
    phone: string,
    email: string,
    byPhone: Map<string, SubscribeDoc[]>,
    byEmail: Map<string, SubscribeDoc[]>
  ): PersonFacts {
    const seen = new Set<string>();
    const docs: SubscribeDoc[] = [];
    for (const d of [...(byPhone.get(phone) || []), ...(byEmail.get(email) || [])]) {
      if (seen.has(d.subscriptionId)) continue;
      seen.add(d.subscriptionId);
      docs.push(d);
    }

    if (docs.length === 0) {
      return { initialDone: false, payments: [], currentState: 'not_started' };
    }

    const initialDone = docs.some((d) => !!d.authenticatedAt);

    const payments: EmandateDayPayment[] = docs
      .flatMap((d) =>
        d.paymentHistory
          .filter((p) => (p.status === 'captured' || p.status === 'refunded') && p.payment_created_at)
          .map((p) => ({ date: p.payment_created_at, status: p.status as 'captured' | 'refunded' }))
      )
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());

    let bestDoc = docs[0];
    for (const d of docs) {
      const dRank = STATE_PRIORITY[d.status] || 0;
      const bestRank = STATE_PRIORITY[bestDoc.status] || 0;
      if (dRank > bestRank) {
        bestDoc = d;
      } else if (dRank === bestRank && (d.createdAt?.getTime() || 0) > (bestDoc.createdAt?.getTime() || 0)) {
        bestDoc = d;
      }
    }

    const currentState: MandateState =
      bestDoc.status === 'active' ? 'active' : bestDoc.status === 'halted' ? 'halted' : bestDoc.status === 'cancelled' ? 'cancelled' : 'not_started';

    return { initialDone, payments, currentState };
  }

  // Shared by getEmandateTable (single batch), getOverview (many batches aggregated), and
  // getBatchTable (one summary row per batch) so the classification logic can't drift between views.
  private buildBatchRows(
    batchDateKey: string,
    paidRows: PaidRow[],
    byPhone: Map<string, SubscribeDoc[]>,
    byEmail: Map<string, SubscribeDoc[]>,
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
    let totalFullPaid = 0, totalRefunded = 0;
    let initialDoneCount = 0, payment2DoneCount = 0, payment3DoneCount = 0, notDoneAtAllCount = 0, cancelledCount = 0, haltedCount = 0;

    paidRows.forEach((p) => {
      if (!matchesBatch(p.rawBatchDate)) return;

      const defaultStatus = classifyPaymentStatus(p.pinged, batchDate);
      const saved = remarkByPhone.get(p.phone);
      const paymentStatus = saved?.statusOverride || defaultStatus;
      if (paymentStatus === 'Full Paid') totalFullPaid++;
      if (paymentStatus === 'Refunded') totalRefunded++;

      const owesEmandate = paymentStatus !== 'Full Paid' && paymentStatus !== 'Refunded';
      let initialDone = false, payment2Done = false, payment3Done = false;
      let currentState: MandateState = 'not_applicable';
      let payment2: EmandateDayPayment | null = null;
      let payment3: EmandateDayPayment | null = null;

      if (owesEmandate && emandateEraApplies) {
        const facts = this.getPersonFacts(p.phone, p.email, byPhone, byEmail);
        initialDone = facts.initialDone;
        payment2 = facts.payments[0] || null;
        payment3 = facts.payments[1] || null;
        payment2Done = facts.payments.filter((pay) => pay.status === 'captured').length >= 1;
        payment3Done = facts.payments.filter((pay) => pay.status === 'captured').length >= 2;
        currentState = facts.currentState;

        if (initialDone) initialDoneCount++; else notDoneAtAllCount++;
        if (payment2Done) payment2DoneCount++;
        if (payment3Done) payment3DoneCount++;
        if (currentState === 'cancelled') cancelledCount++;
        if (currentState === 'halted') haltedCount++;
      }

      const paymentDoneCount = (payment2?.status === 'captured' ? 1 : 0) + (payment3?.status === 'captured' ? 1 : 0);
      const settled = paymentStatus === 'Full Paid' || payment3Done;

      rows.push({
        name: p.name,
        phone: p.phone,
        email: p.email,
        paymentStatus,
        payment2,
        payment3,
        initialDone,
        payment2Done,
        payment3Done,
        currentState,
        settled,
        paymentDoneCount,
        remark: saved?.remark || '',
      });
    });

    const totalInitialPaid = rows.length;
    const owesEmandate = totalInitialPaid - totalFullPaid - totalRefunded;
    const pct = (n: number) => (owesEmandate > 0 ? parseFloat(((n / owesEmandate) * 100).toFixed(1)) : null);
    const overallConversionCount = totalFullPaid + payment3DoneCount;

    const summary: EmandateSummary = {
      totalInitialPaid,
      totalFullPaid,
      totalRefunded,
      owesEmandate,
      initialDoneCount,
      initialDonePct: pct(initialDoneCount),
      payment2DoneCount,
      payment2DonePct: pct(payment2DoneCount),
      payment3DoneCount,
      payment3DonePct: pct(payment3DoneCount),
      notDoneAtAllCount,
      notDoneAtAllPct: pct(notDoneAtAllCount),
      cancelledCount,
      cancelledPct: pct(cancelledCount),
      haltedCount,
      haltedPct: pct(haltedCount),
      overallConversionPct: totalInitialPaid > 0 ? parseFloat(((overallConversionCount / totalInitialPaid) * 100).toFixed(1)) : null,
      emandateEraApplies,
    };

    return { rows, summary };
  }

  private async loadCommonData(batchDateKeys: string[]) {
    const [paidRows, subscribeDocs, remarkDocs] = await Promise.all([
      this.fetchPaidList(),
      this.fetchSubscribeDocs(),
      getDatabase().collection('emandate_remarks').find({ batchDate: { $in: batchDateKeys } }).toArray(),
    ]);
    const { byPhone, byEmail } = this.buildSubscribeIndex(subscribeDocs);

    const remarksByBatch = new Map<string, any[]>();
    for (const r of remarkDocs as any[]) {
      if (!remarksByBatch.has(r.batchDate)) remarksByBatch.set(r.batchDate, []);
      remarksByBatch.get(r.batchDate)!.push(r);
    }

    return { paidRows, byPhone, byEmail, remarksByBatch };
  }

  async getEmandateTable(batchDateKey: string): Promise<{ rows: EmandateRow[]; summary: EmandateSummary; batchDate: string }> {
    const { paidRows, byPhone, byEmail, remarksByBatch } = await this.loadCommonData([batchDateKey]);
    const { rows, summary } = this.buildBatchRows(batchDateKey, paidRows, byPhone, byEmail, remarksByBatch.get(batchDateKey) || []);
    return { rows, summary, batchDate: batchDateKey };
  }

  // Aggregates the same per-batch classification across an arbitrary set of batches (this/previous/
  // last-2/custom, decided by the frontend) — used by the overview card above the single-batch table.
  async getOverview(batchDateKeys: string[]): Promise<EmandateOverview> {
    const { paidRows, byPhone, byEmail, remarksByBatch } = await this.loadCommonData(batchDateKeys);

    let owesEmandate = 0, initialDoneCount = 0, payment2DoneCount = 0, payment3DoneCount = 0;
    let notDoneAtAllCount = 0, cancelledCount = 0, haltedCount = 0;
    let emandateEraApplies = false;
    const buckets: EmandateOverview['buckets'] = { notDoneAtAll: [], cancelled: [], halted: [] };
    const chart: EmandateOverviewBatchPoint[] = [];

    for (const batchDateKey of batchDateKeys) {
      const { rows, summary } = this.buildBatchRows(batchDateKey, paidRows, byPhone, byEmail, remarksByBatch.get(batchDateKey) || []);

      owesEmandate += summary.owesEmandate;
      initialDoneCount += summary.initialDoneCount;
      payment2DoneCount += summary.payment2DoneCount;
      payment3DoneCount += summary.payment3DoneCount;
      notDoneAtAllCount += summary.notDoneAtAllCount;
      cancelledCount += summary.cancelledCount;
      haltedCount += summary.haltedCount;
      if (summary.emandateEraApplies) emandateEraApplies = true;

      for (const row of rows) {
        if (row.currentState === 'not_applicable') continue;
        const bucketEntry: EmandateOverviewBucketUser = {
          name: row.name,
          phone: row.phone,
          batchDate: batchDateKey,
          paymentDoneCount: row.paymentDoneCount,
          settled: row.settled,
        };
        if (!row.initialDone) buckets.notDoneAtAll.push(bucketEntry);
        if (row.currentState === 'cancelled') buckets.cancelled.push(bucketEntry);
        if (row.currentState === 'halted') buckets.halted.push(bucketEntry);
      }

      chart.push({
        batchDate: batchDateKey,
        initialCompletionPct: summary.initialDonePct,
        fullPaymentCompletionPct: summary.overallConversionPct,
      });
    }

    const pct = (n: number) => (owesEmandate > 0 ? parseFloat(((n / owesEmandate) * 100).toFixed(1)) : null);

    return {
      owesEmandate,
      initialDoneCount,
      initialDonePct: pct(initialDoneCount),
      payment2DoneCount,
      payment2DonePct: pct(payment2DoneCount),
      payment3DoneCount,
      payment3DonePct: pct(payment3DoneCount),
      notDoneAtAllCount,
      notDoneAtAllPct: pct(notDoneAtAllCount),
      cancelledCount,
      cancelledPct: pct(cancelledCount),
      haltedCount,
      haltedPct: pct(haltedCount),
      emandateEraApplies,
      buckets,
      chart,
    };
  }

  // One row per webinar batch (all of them, not just emandate-era ones — pre-era batches just show
  // trivial/blank emandate columns) for the benchmark table.
  async getBatchTable(batchDateKeys: string[]): Promise<EmandateBatchTableRow[]> {
    const { paidRows, byPhone, byEmail, remarksByBatch } = await this.loadCommonData(batchDateKeys);

    return batchDateKeys.map((batchDateKey) => {
      const { summary } = this.buildBatchRows(batchDateKey, paidRows, byPhone, byEmail, remarksByBatch.get(batchDateKey) || []);
      return { batchDate: batchDateKey, ...summary };
    });
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
