import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '../config/database';
import { WebinarAnalysisService } from './WebinarAnalysisService';

const ANALYTICS_SHEET_URL =
  process.env.WEBINAR_MOMENTUM_ANALYTICS_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRZrcu0syGalGM9_7J3_QC5euzGcG_P2xLANR1MUwP4gV6twZJPgdmQDWAIMGKw9_QTMclY8SNfxv2S/pub?output=csv';

const SHEET_CACHE_TTL_MS = 10 * 60 * 1000;

// 3 Oct 2026 — the Owner confirmed the sheet's own Max Joined / Groupcount columns stopped being
// reliably maintained from this date; Attendance switches to a live-Zoom-data formula from here on.
const ATTENDANCE_CUTOVER = Date.UTC(2026, 9, 3);

// Keywords a Zoom upload's title must contain at least one of to count as THIS tracked webinar
// series for live attendance — never a plain date match, since a genuinely different, unrelated
// webinar (confirmed case: a "Swing Trading Master-Class" upload landed on 7 Oct 2026, the same date
// as a tracked Momentum batch that was never itself uploaded) must resolve to "unavailable", not
// silently borrow that other webinar's attendance numbers. The series was originally always titled
// "... Momentum ..."; from 25 Oct 2026 the Owner renamed it to "ALGO Investing Masterclass" with no
// "momentum" in the title at all, which the old single-keyword check missed entirely (every date from
// then on showed N/A). Kept as an env-configurable list — not another hardcoded single word — so the
// next rename only needs a Cloud Run env var change, not a redeploy, to avoid the same outage again.
const MOMENTUM_TITLE_KEYWORDS = (process.env.WEBINAR_MOMENTUM_TITLE_KEYWORDS || 'momentum,algo')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Sheet "Date" column: "21Jun2025", "3Oct2026", etc. — same compact format used across this app's
// other Google-Sheet-backed date columns.
function parseCompactDate(s: string): Date | null {
  const cleaned = (s || '').replace(/[-/.\s]/g, '').toLowerCase();
  const m = cleaned.match(/^(\d{1,2})([a-z]+)(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3)];
  if (month === undefined) return null;
  return new Date(Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10)));
}

function ordinalLabel(d: Date): string {
  const day = d.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SheetRow {
  batch: string;
  date: Date;
  registered: number;
  total: number;
  paymentFull: number;
  advance: number;
  preSales: number;
  maxJoined: number;
  groupcount: number;
  productPrice: number;
  webinarType: string;
  remarks: string;
}

export type AttendanceSource = 'sheet' | 'live' | 'unavailable';

export interface WebinarWiseRow {
  date: string; // ISO
  label: string;
  batch: string;
  registered: number;
  total: number;
  paymentFull: number;
  advance: number;
  preSales: number;
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  attendanceSource: AttendanceSource;
  attendanceNumerator: number | null;
  attendanceDenominator: number | null;
  attendanceNote: string;
  productPrice: number;
  webinarType: string;
  remarks: string;
}

export interface MonthWiseRow {
  year: number;
  month: number; // 0-indexed
  label: string;
  webinarCount: number;
  totalRegistered: number; // sum of each webinar's own Registered count that month
  totalPaid: number; // sum of each webinar's own Paid (Total) count that month
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  spansAttendanceCutover: boolean; // true if this month mixes sheet-based and live-based attendance
}

export interface QuarterWiseRow {
  year: number;
  quarter: number; // 1-4
  label: string;
  monthCount: number;
  totalRegistered: number; // sum of each month's totalRegistered that quarter
  totalPaid: number; // sum of each month's totalPaid that quarter
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  spansAttendanceCutover: boolean;
}

export interface DataGap {
  date: string;
  label: string;
  reason: string;
}

export interface MomentumAnalyticsReport {
  webinarWise: WebinarWiseRow[];
  monthWise: MonthWiseRow[];
  quarterWise: QuarterWiseRow[];
  currentMonth: MonthWiseRow | null;
  currentQuarter: QuarterWiseRow | null;
  previousQuarter: QuarterWiseRow | null;
  dataGaps: DataGap[];
  generatedAt: string;
}

export class WebinarMomentumAnalyticsService {
  private sheetCache: { data: SheetRow[]; ts: number } | null = null;
  private zoomAnalysisSvc = new WebinarAnalysisService();

  private async fetchSheet(): Promise<SheetRow[]> {
    const now = Date.now();
    if (this.sheetCache && now - this.sheetCache.ts < SHEET_CACHE_TTL_MS) return this.sheetCache.data;

    const response = await axios.get(ANALYTICS_SHEET_URL, { responseType: 'text', timeout: 20000 });
    const records: any[] = parse(response.data, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });

    const rows: SheetRow[] = records
      .filter((r) => r['Batch'] && r['Date'])
      .map((r) => {
        const date = parseCompactDate(r['Date']);
        return date
          ? {
              batch: (r['Batch'] || '').trim(),
              date,
              registered: parseFloat(r['Registered count']) || 0,
              total: parseFloat(r['Total']) || 0,
              paymentFull: parseFloat(r['Payment full']) || 0,
              advance: parseFloat(r['Advance']) || 0,
              preSales: parseFloat(r['10.00 PM - Before sales amount']) || 0,
              maxJoined: parseFloat(r['Max joined count in webinar']) || 0,
              groupcount: parseFloat(r['Groupcount(new+old)']) || 0,
              productPrice: parseFloat(r['Product Price']) || 0,
              webinarType: (r['Webinar Type'] || '').trim(),
              remarks: (r['Remarks'] || '').trim(),
            }
          : null;
      })
      .filter((r): r is SheetRow => r !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    this.sheetCache = { data: rows, ts: now };
    return rows;
  }

  // Finds the live Zoom Analysis "Current Webinar" attended count for a given date — only ever
  // matches an upload whose title contains one of MOMENTUM_TITLE_KEYWORDS (a Swing Trading upload on
  // the same date must never be used for this tracked series), and picks whichever upload has more
  // attendee rows if the same date was accidentally uploaded twice.
  private async getLiveAttended(date: Date): Promise<number | null> {
    const db = getDatabase();
    const key = dateKey(date);
    const start = new Date(key + 'T00:00:00.000Z');
    const end = new Date(key + 'T23:59:59.999Z');
    const sameDayUploads = await db
      .collection('webinar_analysis_batches')
      .find({ webinarDate: { $gte: start, $lte: end } })
      .project({ title: 1, attendees: 1 })
      .toArray();
    const candidates = sameDayUploads.filter((d: any) => {
      const title = String(d.title || '').toLowerCase();
      return MOMENTUM_TITLE_KEYWORDS.some((kw) => title.includes(kw));
    });
    if (candidates.length === 0) return null;

    let best = candidates[0];
    if (candidates.length > 1) {
      best = candidates.reduce((a, b) => ((b.attendees?.length || 0) > (a.attendees?.length || 0) ? b : a));
    }

    const report = await this.zoomAnalysisSvc.getReport(String(best._id), 10);
    return report.cards.segments.current.attended.count;
  }

  async getReport(): Promise<MomentumAnalyticsReport> {
    const sheetRows = await this.fetchSheet();
    const dataGaps: DataGap[] = [];

    const webinarWise: WebinarWiseRow[] = [];
    for (const r of sheetRows) {
      const convByRegistration = r.registered > 0 ? Math.round((r.total / r.registered) * 1000) / 10 : 0;
      const convBySales = r.preSales > 0 ? Math.round((r.total / r.preSales) * 1000) / 10 : 0;

      let attendance: number | null = null;
      let attendanceSource: AttendanceSource = 'sheet';
      let attendanceNumerator: number | null = null;
      let attendanceDenominator: number | null = null;
      let attendanceNote = '';

      if (r.date.getTime() < ATTENDANCE_CUTOVER) {
        attendanceSource = 'sheet';
        attendanceNumerator = r.maxJoined;
        attendanceDenominator = r.groupcount;
        attendance = r.groupcount > 0 ? Math.round((r.maxJoined / r.groupcount) * 1000) / 10 : null;
        attendanceNote = 'Max Joined ÷ Groupcount (sheet)';
      } else {
        const attended = await this.getLiveAttended(r.date);
        if (attended === null) {
          attendanceSource = 'unavailable';
          attendanceNote = 'No Momentum Zoom Analysis upload found for this date';
          dataGaps.push({ date: dateKey(r.date), label: ordinalLabel(r.date), reason: attendanceNote });
        } else {
          attendanceSource = 'live';
          attendanceNumerator = attended;
          attendanceDenominator = r.registered;
          attendance = r.registered > 0 ? Math.round((attended / r.registered) * 1000) / 10 : null;
          attendanceNote = 'Zoom Analysis attended ÷ sheet Registered count';
        }
      }

      webinarWise.push({
        date: r.date.toISOString(),
        label: ordinalLabel(r.date),
        batch: r.batch,
        registered: r.registered,
        total: r.total,
        paymentFull: r.paymentFull,
        advance: r.advance,
        preSales: r.preSales,
        convByRegistration,
        convBySales,
        attendance,
        attendanceSource,
        attendanceNumerator,
        attendanceDenominator,
        attendanceNote,
        productPrice: r.productPrice,
        webinarType: r.webinarType,
        remarks: r.remarks,
      });
    }

    // ============ Month-wise (weighted sum ÷ sum, same formula as webinar-wise) ============
    interface MonthAcc {
      year: number;
      month: number;
      sumRegistered: number;
      sumTotal: number;
      sumPreSales: number;
      sumAttNumerator: number;
      sumAttDenominator: number;
      hasSheetAtt: boolean;
      hasLiveAtt: boolean;
      count: number;
    }
    const monthMap = new Map<string, MonthAcc>();
    for (const w of webinarWise) {
      const d = new Date(w.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { year: d.getUTCFullYear(), month: d.getUTCMonth(), sumRegistered: 0, sumTotal: 0, sumPreSales: 0, sumAttNumerator: 0, sumAttDenominator: 0, hasSheetAtt: false, hasLiveAtt: false, count: 0 });
      }
      const acc = monthMap.get(key)!;
      acc.count++;
      acc.sumRegistered += w.registered;
      acc.sumTotal += w.total;
      acc.sumPreSales += w.preSales;
      if (w.attendanceSource === 'sheet') acc.hasSheetAtt = true;
      if (w.attendanceSource === 'live') acc.hasLiveAtt = true;
      if (w.attendanceNumerator !== null && w.attendanceDenominator !== null) {
        acc.sumAttNumerator += w.attendanceNumerator;
        acc.sumAttDenominator += w.attendanceDenominator;
      }
    }

    const monthWise: MonthWiseRow[] = [...monthMap.values()]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((acc) => ({
        year: acc.year,
        month: acc.month,
        label: `${MONTH_NAMES[acc.month]} ${acc.year}`,
        webinarCount: acc.count,
        totalRegistered: acc.sumRegistered,
        totalPaid: acc.sumTotal,
        convByRegistration: acc.sumRegistered > 0 ? Math.round((acc.sumTotal / acc.sumRegistered) * 1000) / 10 : 0,
        convBySales: acc.sumPreSales > 0 ? Math.round((acc.sumTotal / acc.sumPreSales) * 1000) / 10 : 0,
        attendance: acc.sumAttDenominator > 0 ? Math.round((acc.sumAttNumerator / acc.sumAttDenominator) * 1000) / 10 : null,
        spansAttendanceCutover: acc.hasSheetAtt && acc.hasLiveAtt,
      }));

    // ============ Quarter-wise (average of that quarter's months) ============
    interface QuarterAcc {
      year: number;
      quarter: number;
      months: MonthWiseRow[];
    }
    const quarterMap = new Map<string, QuarterAcc>();
    for (const m of monthWise) {
      const quarter = Math.floor(m.month / 3) + 1;
      const key = `${m.year}-Q${quarter}`;
      if (!quarterMap.has(key)) quarterMap.set(key, { year: m.year, quarter, months: [] });
      quarterMap.get(key)!.months.push(m);
    }
    const quarterWise: QuarterWiseRow[] = [...quarterMap.values()]
      .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .map((acc) => {
        const attMonths = acc.months.filter((m) => m.attendance !== null);
        return {
          year: acc.year,
          quarter: acc.quarter,
          label: `${acc.year} Q${acc.quarter}`,
          monthCount: acc.months.length,
          totalRegistered: acc.months.reduce((s, m) => s + m.totalRegistered, 0),
          totalPaid: acc.months.reduce((s, m) => s + m.totalPaid, 0),
          convByRegistration: Math.round((acc.months.reduce((s, m) => s + m.convByRegistration, 0) / acc.months.length) * 10) / 10,
          convBySales: Math.round((acc.months.reduce((s, m) => s + m.convBySales, 0) / acc.months.length) * 10) / 10,
          attendance: attMonths.length > 0 ? Math.round((attMonths.reduce((s, m) => s + (m.attendance || 0), 0) / attMonths.length) * 10) / 10 : null,
          spansAttendanceCutover: acc.months.some((m) => m.spansAttendanceCutover) || (acc.months.some((m) => m.month < 9 || m.year < 2026) && acc.months.some((m) => m.year === 2026 && m.month >= 9)),
        };
      });

    // ============ Current month / current & previous quarter ============
    const now = new Date();
    const currentMonth = monthWise.find((m) => m.year === now.getUTCFullYear() && m.month === now.getUTCMonth()) || null;
    const currentQuarterNum = Math.floor(now.getUTCMonth() / 3) + 1;
    const currentQuarter = quarterWise.find((q) => q.year === now.getUTCFullYear() && q.quarter === currentQuarterNum) || null;
    const prevQuarterYear = currentQuarterNum === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const prevQuarterNum = currentQuarterNum === 1 ? 4 : currentQuarterNum - 1;
    const previousQuarter = quarterWise.find((q) => q.year === prevQuarterYear && q.quarter === prevQuarterNum) || null;

    return {
      webinarWise,
      monthWise,
      quarterWise,
      currentMonth,
      currentQuarter,
      previousQuarter,
      dataGaps,
      generatedAt: new Date().toISOString(),
    };
  }
}
