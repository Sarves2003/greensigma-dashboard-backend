import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';

const COLLECTION = 'webinar_registrations';

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

// Raw shape in Mongo — the collection has evolved over time, so most fields past `status` are
// optional: older documents (pre dating the tracking/amount/webinarId additions) simply don't have
// them. Every registration attempt gets its own document — a person who abandons checkout and comes
// back later has TWO (or more) documents with the same phone number, not one updated document.
interface RegistrationDoc {
  _id: ObjectId;
  webinarType: string;
  phone: string;
  name: string;
  status: 'success' | 'created' | 'failed' | string;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt: Date | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amount?: number;
  currency?: string;
  payAttempts?: number;
  lastPayAttemptAt?: Date;
  webinarId?: ObjectId;
  webinarDate?: string;
  webinarDateISO?: string;
  webinarTime?: string;
  buyerContact?: string;
  buyerEmail?: string;
  metaEventId?: string;
  paymentMethod?: string; // 'upi' | 'card' | 'wallet' | ... — only ever set by Razorpay's capture webhook, so only success docs carry it, and only ones recent enough to predate this field being added
  messages?: {
    telegram?: { state?: string; detail?: { sent?: boolean } };
    confirmation?: { state?: string };
  };
  tracking?: { clientIp?: string; userAgent?: string; fbp?: string; fbc?: string; sourceUrl?: string };
}

export interface WebinarRegSummaryRow {
  id: string;
  webinarType: string;
  webinarDate: string;
  webinarDateISO: string;
  webinarTime: string;
  label: string;
  totalDocs: number;
}

// A person's actual classification is always one of the first three; 'all' only ever appears as a
// query filter value (meaning "no status filter"), never as something a person IS classified as.
export type PersonStatus = 'success' | 'failed' | 'notpaid';
export type RegCategory = PersonStatus | 'all';

export interface RegistrationPersonRow {
  key: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  attempts: number;
  amount: number | null;
  paymentMethod: string | null;
  welcomeMessageSent: boolean;
  status: PersonStatus;
  firstAttemptAt: string;
  paidAt: string | null;
}

export interface WebinarRegSummary {
  totalRegistered: number; // distinct people with a successful payment
  failed: number; // distinct people with no success, but at least one explicit "failed" attempt
  notPaid: number; // distinct people with no success and no failed attempt (abandoned checkout)
  amountCollected: number; // sum of the `amount` field across distinct successful people
  welcomeMessageSent: number; // of totalRegistered, how many got the post-payment Telegram welcome message
  totalAttempts: number; // raw checkout-attempt DOCUMENT count for this occurrence (not deduped by person)
  totalDistinctPeople: number; // success + failed + notPaid — sanity-check total for this webinar
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

type SortDir = 'asc' | 'desc';

const PERSON_SORT_FIELDS = ['name', 'phone', 'email', 'source', 'attempts', 'amount', 'paymentMethod', 'firstAttemptAt', 'paidAt'];

function sortRows<T extends Record<string, any>>(rows: T[], sortBy: string | undefined, sortDir: SortDir, allowed: string[]): T[] {
  if (!sortBy || !allowed.includes(sortBy)) return rows;
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
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
function encodeOccurrenceId(webinarId: ObjectId, webinarDateISO: string): string {
  return `${String(webinarId)}_${webinarDateISO}`;
}

function decodeOccurrenceId(occurrenceId: string): { webinarId: ObjectId; webinarDateISO: string } {
  const match = occurrenceId.match(/^([0-9a-fA-F]{24})_(\d{4}-\d{2}-\d{2})$/);
  if (!match) throw new Error('Invalid webinar occurrence id');
  return { webinarId: new ObjectId(match[1]), webinarDateISO: match[2] };
}

export class WebinarRegistrationsService {
  // ============ Webinar picker ============
  async listWebinars(): Promise<WebinarRegSummaryRow[]> {
    const db = getDatabase();
    const groups = await db
      .collection<RegistrationDoc>(COLLECTION)
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

    return groups.map((g: any) => ({
      id: encodeOccurrenceId(g._id.webinarId, g._id.webinarDateISO),
      webinarType: g.webinarType || '',
      webinarDate: g.webinarDate,
      webinarDateISO: g._id.webinarDateISO,
      webinarTime: g.webinarTime || '',
      label: `${g.webinarDate} ${this.titleCase(g.webinarType)}`,
      totalDocs: g.totalDocs,
    }));
  }

  private titleCase(s: string): string {
    return (s || '').split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
  }

  // ============ Core: load + dedupe into one row per person ============
  private async loadDocs(occurrenceId: string): Promise<RegistrationDoc[]> {
    const { webinarId, webinarDateISO } = decodeOccurrenceId(occurrenceId);
    const db = getDatabase();
    return db
      .collection<RegistrationDoc>(COLLECTION)
      .find({ webinarId, webinarDateISO })
      .sort({ createdAt: 1 })
      .toArray();
  }

  // Groups every attempt by person (normalized phone) and classifies them into exactly one of the
  // three categories. A person with several documents (abandoned once, came back and paid) is
  // classified by the BEST outcome across all their attempts — succeeding on attempt 2 still counts
  // as a successful registrant, never as "failed"/"not paid", since this collection is a transaction
  // log, not a one-row-per-person table.
  private buildPersonRows(docs: RegistrationDoc[]): RegistrationPersonRow[] {
    const byPhone = new Map<string, RegistrationDoc[]>();
    for (const d of docs) {
      const key = normalizePhone(d.phone || d.buyerContact);
      if (!key) continue;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(d);
    }

    const rows: RegistrationPersonRow[] = [];
    for (const [key, group] of byPhone) {
      const successDoc = group.find((d) => d.status === 'success');
      const failedDoc = group.find((d) => d.status === 'failed');
      const status: RegCategory = successDoc ? 'success' : failedDoc ? 'failed' : 'notpaid';
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

  async getSummary(occurrenceId: string): Promise<WebinarRegSummary> {
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

  private matchesSearch(fields: (string | null | undefined)[], search?: string): boolean {
    if (!search) return true;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => (f || '').toLowerCase().includes(q));
  }

  // 'all' means every distinct person regardless of outcome — still one row per PERSON with their
  // own `attempts` count, never one row per raw transaction document (the whole point of the
  // person-level dedup above; "all" only widens which people are included, not the row grain).
  private async filteredRows(occurrenceId: string, category: RegCategory, search?: string): Promise<RegistrationPersonRow[]> {
    const docs = await this.loadDocs(occurrenceId);
    const people = this.buildPersonRows(docs);
    return people
      .filter((p) => category === 'all' || p.status === category)
      .filter((p) => this.matchesSearch([p.name, p.phone, p.email], search));
  }

  async getTable(
    occurrenceId: string,
    category: RegCategory,
    page: number,
    pageSize: number,
    sortBy?: string,
    sortDir: SortDir = 'desc',
    search?: string
  ): Promise<PagedResult<RegistrationPersonRow>> {
    const rows = sortRows(await this.filteredRows(occurrenceId, category, search), sortBy, sortDir, PERSON_SORT_FIELDS);
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total, page, pageSize };
  }

  // ============ CSV download ============
  private csvFieldEscape(val: string): string {
    return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
  }

  private buildRawCsv(rows: RegistrationPersonRow[]): string {
    const header = 'Name,Number,Email,Source,Attempts,Status,Amount,Payment Method,Welcome Message Sent,First Attempt,Paid On\n';
    const statusLabel: Record<PersonStatus, string> = { success: 'Paid', failed: 'Failed', notpaid: 'Not Paid' };
    const fmtDate = (iso: string) =>
      new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    const body = rows
      .map((r) =>
        [
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
          .join(',')
      )
      .join('\n');
    return header + body;
  }

  // Matches AiSensy's real bulk-contact import schema exactly (see WebinarAnalysisService for the
  // reference export this was confirmed against): Source and the five custom lead-qualification
  // fields are always left blank for a bulk list where we don't have per-contact answers.
  private buildAisensyCsv(rows: RegistrationPersonRow[], tag: string): string {
    const header = 'Name,Mobile Number,Source,Tags,Experience,Challenge,Timeline,Capital,DecisionMaker\n';
    const body = rows
      .filter((r) => r.phone)
      .map((r) => [this.csvFieldEscape(r.name), r.phone, '', this.csvFieldEscape(tag), '', '', '', '', ''].join(','))
      .join('\n');
    return header + body;
  }

  async downloadCsv(
    occurrenceId: string,
    category: RegCategory,
    sortBy?: string,
    sortDir: SortDir = 'desc',
    search?: string,
    format: 'raw' | 'aisensy' = 'raw',
    tag = ''
  ): Promise<string> {
    const rows = sortRows(await this.filteredRows(occurrenceId, category, search), sortBy, sortDir, PERSON_SORT_FIELDS);
    return format === 'aisensy' ? this.buildAisensyCsv(rows, tag) : this.buildRawCsv(rows);
  }
}
