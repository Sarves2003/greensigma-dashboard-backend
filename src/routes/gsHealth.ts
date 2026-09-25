import { Router, Request, Response } from 'express';
import { GoogleSheetsService, GsHealthRow } from '../services/GoogleSheetsService';
import { APIResponse } from '../types';
import { getDatabase } from '../config/database';
import { AuthedRequest, requirePermission } from '../middleware/auth';

const router = Router();
const sheetsService = new GoogleSheetsService();

function selectRows(allRows: GsHealthRow[], req: Request): GsHealthRow[] {
  const preset = req.query.preset as string; // 'thisMonth' | 'lastMonth' | 'last2' | 'last3'
  const startMonth = req.query.startMonth as string; // 'YYYY-MM'
  const endMonth = req.query.endMonth as string; // 'YYYY-MM'

  if (startMonth && endMonth) {
    return allRows.filter(r => r.monthKey >= startMonth && r.monthKey <= endMonth);
  }

  switch (preset) {
    case 'thisMonth': return allRows.slice(-1);
    case 'lastMonth': return allRows.slice(-2, -1);
    case 'last2': return allRows.slice(-2);
    case 'last3': return allRows.slice(-3);
    default: return allRows.slice(-3);
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function sum(values: number[]): number {
  return parseFloat(values.reduce((a, b) => a + b, 0).toFixed(2));
}

function quarterKeyOf(row: GsHealthRow): string {
  return `${row.year}-Q${Math.floor((row.month - 1) / 3) + 1}`;
}

function quarterLabel(qKey: string): string {
  const [y, q] = qKey.split('-Q');
  return `Q${q} ${y}`;
}

function prevQuarterKey(qKey: string): string {
  const [yStr, qStr] = qKey.split('-Q');
  let y = parseInt(yStr, 10);
  let q = parseInt(qStr, 10) - 1;
  if (q < 1) {
    q = 4;
    y -= 1;
  }
  return `${y}-Q${q}`;
}

interface MetricSlice {
  label: string | null;
  value: number | null;
}

// A brand-new month gets an empty placeholder row in the sheet the moment it starts (e.g. Sep 1st,
// before any real activity is logged) — anchoring "current month" to that row makes every KPI look
// like a 100% crash. Detected as "no leads AND no spend" since a real month always has at least one
// of those by the time anyone looks at it.
function isEmptyRow(r: GsHealthRow): boolean {
  return r.registeredCount === 0 && r.adsSpent === 0;
}

// Resolves which rows to treat as "the data" for this request: an explicit ?asOfMonth=YYYY-MM
// truncates to that month (so "select Jun-Aug, treat Aug as current" works); with no override,
// trailing empty placeholder rows are dropped automatically so day-1-of-a-new-month never becomes
// "current month" on its own.
function effectiveRows(allRows: GsHealthRow[], asOfMonth?: string): GsHealthRow[] {
  if (asOfMonth) {
    const truncated = allRows.filter((r) => r.monthKey <= asOfMonth);
    return truncated.length > 0 ? truncated : allRows;
  }

  let end = allRows.length;
  while (end > 1 && isEmptyRow(allRows[end - 1])) end--;
  return allRows.slice(0, end);
}

// Anchored to the LATEST row actually present in the sheet — not real calendar "today",
// since the sheet is manually updated and may lag behind the current date.
function buildMetricBreakdown(
  allRows: GsHealthRow[],
  extract: (r: GsHealthRow) => number,
  quarterAgg: 'sum' | 'avg'
): { currentMonth: MetricSlice; lastMonth: MetricSlice; currentQuarter: MetricSlice; lastQuarter: MetricSlice } {
  const latest = allRows[allRows.length - 1];
  const previous = allRows.length >= 2 ? allRows[allRows.length - 2] : null;

  const currentQKey = quarterKeyOf(latest);
  const lastQKey = prevQuarterKey(currentQKey);

  const currentQuarterRows = allRows.filter((r) => quarterKeyOf(r) === currentQKey);
  const lastQuarterRows = allRows.filter((r) => quarterKeyOf(r) === lastQKey);

  const agg = (rows: GsHealthRow[]): number | null => {
    if (rows.length === 0) return null;
    return quarterAgg === 'avg' ? average(rows.map(extract)) : sum(rows.map(extract));
  };

  return {
    currentMonth: { label: latest.monthLabel, value: parseFloat(extract(latest).toFixed(2)) },
    lastMonth: previous
      ? { label: previous.monthLabel, value: parseFloat(extract(previous).toFixed(2)) }
      : { label: null, value: null },
    currentQuarter: { label: quarterLabel(currentQKey), value: agg(currentQuarterRows) },
    lastQuarter: { label: quarterLabel(lastQKey), value: agg(lastQuarterRows) },
  };
}

// Also anchored to the latest row's year, not real calendar "today".
function buildYearBreakdown(
  allRows: GsHealthRow[],
  extract: (r: GsHealthRow) => number,
  lowerIsBetter: boolean
): {
  currentYearAvgPerMonth: MetricSlice;
  previousYearAvgPerMonth: MetricSlice;
  currentYearTotal: MetricSlice;
  previousYearTotal: MetricSlice;
  currentYearBest: MetricSlice;
  previousYearBest: MetricSlice;
} {
  const currentYear = allRows[allRows.length - 1].year;
  const previousYear = currentYear - 1;

  const currentYearRows = allRows.filter((r) => r.year === currentYear);
  const previousYearRows = allRows.filter((r) => r.year === previousYear);

  const avgPerMonth = (rows: GsHealthRow[], yearLabel: number): MetricSlice =>
    rows.length === 0 ? { label: null, value: null } : { label: String(yearLabel), value: average(rows.map(extract)) };

  const total = (rows: GsHealthRow[], yearLabel: number): MetricSlice =>
    rows.length === 0 ? { label: null, value: null } : { label: String(yearLabel), value: sum(rows.map(extract)) };

  const best = (rows: GsHealthRow[]): MetricSlice => {
    if (rows.length === 0) return { label: null, value: null };
    let bestRow = rows[0];
    for (const r of rows) {
      const isBetter = lowerIsBetter ? extract(r) < extract(bestRow) : extract(r) > extract(bestRow);
      if (isBetter) bestRow = r;
    }
    return { label: bestRow.monthLabel, value: parseFloat(extract(bestRow).toFixed(2)) };
  };

  return {
    currentYearAvgPerMonth: avgPerMonth(currentYearRows, currentYear),
    previousYearAvgPerMonth: avgPerMonth(previousYearRows, previousYear),
    currentYearTotal: total(currentYearRows, currentYear),
    previousYearTotal: total(previousYearRows, previousYear),
    currentYearBest: best(currentYearRows),
    previousYearBest: best(previousYearRows),
  };
}

router.get('/key-metrics', async (req: Request, res: Response) => {
  try {
    const allRowsRaw = await sheetsService.getMonthlyData();

    if (allRowsRaw.length === 0) {
      res.json({ success: true, data: null, timestamp: new Date().toISOString() } as APIResponse<any>);
      return;
    }

    const allRows = effectiveRows(allRowsRaw, req.query.asOfMonth as string | undefined);

    const buildCategory = (extract: (r: GsHealthRow) => number, quarterAgg: 'sum' | 'avg', lowerIsBetter: boolean) => ({
      ...buildMetricBreakdown(allRows, extract, quarterAgg),
      ...buildYearBreakdown(allRows, extract, lowerIsBetter),
    });

    // Revenue is the sum of all three funnels (Webinar + Demo Funnel + Renewal), shown both gross
    // (totalRevenue) and net (revenue).
    const data = {
      totalRevenue: buildCategory((r) => r.combinedTotalRevenue, 'sum', false),
      revenue: buildCategory((r) => r.combinedNetRevenue, 'sum', false),
      brokerage: buildCategory((r) => r.brokerageProfit, 'sum', false),
      merGross: buildCategory((r) => r.merGross, 'avg', false),
      merNet: buildCategory((r) => r.merNet, 'avg', false),
      cac: buildCategory((r) => r.cac, 'avg', true),
      paidUsers: buildCategory((r) => r.paidUsers, 'sum', false),
      // Spend is shown as separate figures, never summed into one: Webinar ads, Demo Funnel ads
      // (both with GST) and Marketing = the sheet's Marketing Spending (Exly, AiSensy, Periskope)
      // plus UGC & Influencer cost.
      webinarAds: buildCategory((r) => r.webinarAdsSpentWithGST, 'sum', true),
      demoAds: buildCategory((r) => r.leadAdsSpentWithGST, 'sum', true),
      marketing: buildCategory((r) => r.marketingSpending + r.ugcInfluencerCost, 'sum', true),
      leads: buildCategory((r) => r.registeredCount, 'sum', false),
      cpp: buildCategory((r) => r.cpp, 'avg', true),
    };

    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health key metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GS Health key metrics',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Same breakdown shape as /key-metrics, scoped to a single funnel — each field maps 1:1 to that
// funnel's own columns in the sheet (never derived/combined), so these numbers are exactly what
// the business already tracks per funnel, nothing re-interpreted. Funnels: webinar, demo (Demo /
// Lead Form funnel; "leadform" is still accepted as its old name) and renewal.
router.get('/channel-metrics', async (req: Request, res: Response) => {
  try {
    const rawChannel = req.query.channel as string;
    const channel = rawChannel === 'leadform' ? 'demo' : rawChannel;
    if (channel !== 'webinar' && channel !== 'demo' && channel !== 'renewal') {
      res.status(400).json({ success: false, error: 'channel must be "webinar", "demo" or "renewal"', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const allRowsRaw = await sheetsService.getMonthlyData();
    if (allRowsRaw.length === 0) {
      res.json({ success: true, data: null, timestamp: new Date().toISOString() } as APIResponse<any>);
      return;
    }

    const allRows = effectiveRows(allRowsRaw, req.query.asOfMonth as string | undefined);

    const buildCategory = (extract: (r: GsHealthRow) => number, quarterAgg: 'sum' | 'avg', lowerIsBetter: boolean) => ({
      ...buildMetricBreakdown(allRows, extract, quarterAgg),
      ...buildYearBreakdown(allRows, extract, lowerIsBetter),
    });

    let data: Record<string, any>;
    if (channel === 'webinar') {
      data = {
        leads: buildCategory((r) => r.webinarRegisteredCount, 'sum', false),
        adsSpent: buildCategory((r) => r.webinarAdsSpentWithGST, 'sum', true),
        cac: buildCategory((r) => r.webinarCAC, 'avg', true),
        totalRevenue: buildCategory((r) => r.totalRevenue, 'sum', false),
        revenue: buildCategory((r) => r.netRevenue, 'sum', false),
        convertedUsers: buildCategory((r) => r.webinarConvertedCount, 'sum', false),
        cpl: buildCategory((r) => r.webinarCPL, 'avg', true),
        netRoas: buildCategory((r) => r.webinarNetROAS, 'avg', false),
      };
    } else if (channel === 'demo') {
      data = {
        leads: buildCategory((r) => r.leadFormRegisteredCount, 'sum', false),
        adsSpent: buildCategory((r) => r.leadAdsSpentWithGST, 'sum', true),
        cac: buildCategory((r) => r.leadFunnelCAC, 'avg', true),
        totalRevenue: buildCategory((r) => r.demoFunnelTotalRevenue, 'sum', false),
        revenue: buildCategory((r) => r.demoFunnelNetRevenue, 'sum', false),
        convertedUsers: buildCategory((r) => r.demoConvertedCount, 'sum', false),
        cpl: buildCategory((r) => r.demoFunnelCPL, 'avg', true),
        netRoas: buildCategory((r) => r.demoFunnelNetROAS, 'avg', false),
      };
    } else {
      // The sheet has no ads spend / CPL / CAC / ROAS columns for renewals — only these.
      data = {
        expectedRenewals: buildCategory((r) => r.expectedRenewalCount, 'sum', false),
        renewedUsers: buildCategory((r) => r.renewalCount, 'sum', false),
        totalRevenue: buildCategory((r) => r.renewalTotalRevenue, 'sum', false),
        revenue: buildCategory((r) => r.renewalNetRevenue, 'sum', false),
      };
    }

    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health channel metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GS Health channel metrics',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// ============ Month-over-month summary (the "Summarize" popup) ============
// Current month vs the month before it, for the handful of headline numbers, each straight from the
// sheet's own columns. Anchored the same way as Key Metrics (latest non-empty month, or ?asOfMonth).
type SummaryFormat = 'currency' | 'number' | 'ratio';
const SUMMARY_METRICS: { key: string; label: string; sub?: string; format: SummaryFormat; lowerIsBetter: boolean; get: (r: GsHealthRow) => number }[] = [
  { key: 'grossRevenue', label: 'Gross Revenue', format: 'currency', lowerIsBetter: false, get: (r) => r.combinedTotalRevenue },
  { key: 'brokerage', label: 'Algo Brokerage Profit', format: 'currency', lowerIsBetter: false, get: (r) => r.brokerageProfit },
  { key: 'webinarAds', label: 'Webinar Ads Spent', format: 'currency', lowerIsBetter: true, get: (r) => r.webinarAdsSpentWithGST },
  { key: 'demoAds', label: 'Demo Funnel Ads Spent', format: 'currency', lowerIsBetter: true, get: (r) => r.leadAdsSpentWithGST },
  { key: 'marketing', label: 'Marketing Spent (incl. UGC)', format: 'currency', lowerIsBetter: true, get: (r) => r.marketingSpending + r.ugcInfluencerCost },
  // One MER row (gross figures); the Gross / Net switch lives inside its drill-down popup.
  { key: 'mer', label: 'MER', sub: 'gross · switch to net inside', format: 'ratio', lowerIsBetter: false, get: (r) => r.merGross },
  // LTV, like MER, shows the gross figure in the table; the Gross / Net switch is inside its drill-down popup.
  { key: 'ltv', label: 'LTV', sub: 'gross · switch to net inside', format: 'currency', lowerIsBetter: false, get: (r) => r.ltvGross },
  { key: 'cac', label: 'Overall CAC', format: 'currency', lowerIsBetter: true, get: (r) => r.cac },
  { key: 'webinarCpl', label: 'Webinar CPL', format: 'currency', lowerIsBetter: true, get: (r) => r.webinarCPL },
  { key: 'demoCpl', label: 'Demo Funnel CPL', format: 'currency', lowerIsBetter: true, get: (r) => r.demoFunnelCPL },
  { key: 'renewed', label: 'Renewed Users', format: 'number', lowerIsBetter: false, get: (r) => r.renewalCount },
  { key: 'demoPaid', label: 'Demo Funnel Paid Users', format: 'number', lowerIsBetter: false, get: (r) => r.demoConvertedCount },
  { key: 'webinarPaid', label: 'Webinar Funnel Paid Users', format: 'number', lowerIsBetter: false, get: (r) => r.webinarConvertedCount },
  { key: 'webinarRegistered', label: 'Webinar Registered', format: 'number', lowerIsBetter: false, get: (r) => r.webinarRegisteredCount },
];

router.get('/month-summary', async (req: Request, res: Response) => {
  try {
    const allRowsRaw = await sheetsService.getMonthlyData();
    if (allRowsRaw.length === 0) {
      res.json({ success: true, data: null, timestamp: new Date().toISOString() } as APIResponse<any>);
      return;
    }

    const allRows = effectiveRows(allRowsRaw, req.query.asOfMonth as string | undefined);
    const current = allRows[allRows.length - 1];
    const previous = allRows.length >= 2 ? allRows[allRows.length - 2] : null;

    const rows = SUMMARY_METRICS.map((m) => {
      const cur = parseFloat(m.get(current).toFixed(2));
      const prev = previous ? parseFloat(m.get(previous).toFixed(2)) : null;
      const delta = prev === null ? null : parseFloat((cur - prev).toFixed(2));
      const pct = prev === null || prev === 0 ? null : parseFloat((((cur - prev) / Math.abs(prev)) * 100).toFixed(1));
      return { key: m.key, label: m.label, sub: m.sub || null, format: m.format, lowerIsBetter: m.lowerIsBetter, current: cur, previous: prev, delta, pct };
    });

    // Months the popup's dropdown can jump to: every month that has real data, newest first.
    const months = allRowsRaw
      .filter((r) => !isEmptyRow(r))
      .map((r) => ({ key: r.monthKey, label: r.monthLabel }))
      .reverse();

    res.json({
      success: true,
      data: {
        currentKey: current.monthKey,
        currentLabel: current.monthLabel,
        previousLabel: previous ? previous.monthLabel : null,
        months,
        rows,
      },
      timestamp: new Date().toISOString(),
    } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health month summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch month summary', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

// ============ Month components (the drill-down popups behind "Marketing Spent" and "MER") ============
// Everything that goes into one month's revenue and spend, item by item, each with a gross figure
// (GST-inclusive / as entered) and a net figure (GST-exclusive / as entered). The MER popup lets the
// user tick items off and recomputes MER from this list; the Marketing popup shows the "marketing"
// group of it (tool spend + UGC) per product.
router.get('/month-components', async (req: Request, res: Response) => {
  try {
    const allRowsRaw = await sheetsService.getMonthlyData();
    if (allRowsRaw.length === 0) {
      res.json({ success: true, data: null, timestamp: new Date().toISOString() } as APIResponse<any>);
      return;
    }

    const wanted = req.query.month as string | undefined;
    const fallback = effectiveRows(allRowsRaw);
    const r = allRowsRaw.find((x) => x.monthKey === wanted) || fallback[fallback.length - 1];
    const round2 = (n: number) => parseFloat(n.toFixed(2));

    const revenue = [
      { key: 'webinarRevenue', label: 'Webinar revenue', gross: r.totalRevenue, net: r.netRevenue },
      { key: 'demoRevenue', label: 'Demo Funnel revenue', gross: r.demoFunnelTotalRevenue, net: r.demoFunnelNetRevenue },
      { key: 'renewalRevenue', label: 'Renewal revenue', gross: r.renewalTotalRevenue, net: r.renewalNetRevenue },
      { key: 'brokerage', label: 'Algo brokerage profit', gross: r.brokerageProfit, net: r.brokerageProfit },
    ].map((i) => ({ ...i, gross: round2(i.gross), net: round2(i.net) }));

    const tools = r.marketingByTool;
    const spend: { key: string; label: string; group: 'ads' | 'marketing'; gross: number; net: number }[] = [
      { key: 'webinarAds', label: 'Webinar ads', group: 'ads', gross: r.webinarAdsSpentWithGST, net: r.webinarAdsSpent },
      { key: 'demoAds', label: 'Demo Funnel ads', group: 'ads', gross: r.leadAdsSpentWithGST, net: r.leadAdsSpent },
      { key: 'aisensy', label: 'AiSensy', group: 'marketing', gross: tools.aisensy, net: tools.aisensy },
      { key: 'periskope', label: 'Periskope', group: 'marketing', gross: tools.periskope, net: tools.periskope },
      { key: 'exly', label: 'Exly', group: 'marketing', gross: tools.exly, net: tools.exly },
      { key: 'zoom', label: 'Zoom', group: 'marketing', gross: tools.zoom, net: tools.zoom },
      { key: 'zohoCrm', label: 'Zoho CRM', group: 'marketing', gross: tools.zohoCrm, net: tools.zohoCrm },
    ];
    // Only appears when the Marketing tab has nothing for this month but the monthly sheet's own
    // Marketing Spending column does.
    if (r.marketingUnallocated > 0) {
      spend.push({ key: 'marketingOther', label: 'Other marketing (monthly sheet)', group: 'marketing', gross: r.marketingUnallocated, net: r.marketingUnallocated });
    }
    spend.push({ key: 'ugc', label: 'UGC & Influencer', group: 'marketing', gross: r.ugcInfluencerCost, net: r.ugcInfluencerCost });

    // People the LTV is spread over. Renewed users are listed too so they can be ticked in, but the default
    // (and the dashboard's LTV) counts only NEW paid customers.
    const customers = [
      { key: 'webinarPaid', label: 'Webinar paid users', value: r.webinarConvertedCount },
      { key: 'demoPaid', label: 'Demo Funnel paid users', value: r.demoConvertedCount },
      { key: 'renewedUsers', label: 'Renewed users', value: r.renewalCount },
    ];

    res.json({
      success: true,
      data: {
        monthKey: r.monthKey,
        monthLabel: r.monthLabel,
        customers,
        ltv: { gross: r.ltvGross, net: r.ltvNet },
        revenue,
        spend: spend.map((i) => ({ ...i, gross: round2(i.gross), net: round2(i.net) })),
        mer: { gross: r.merGross, net: r.merNet },
      },
      timestamp: new Date().toISOString(),
    } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health month components:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch month components', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

// ============ Chart report ============
// Every metric for every month, so the Chart Report popup can plot any one of them month by month or
// as a running total. `additive` metrics (revenue, spend, user counts) can be accumulated; ratios and
// per-unit costs (MER, CAC, CPL, ROAS) cannot, so the popup only offers "Monthly" for those. For
// non-additive metrics a 0 means "not tracked that month", so it is sent as null to leave a gap in
// the line instead of dropping to zero.
type ChartFormat = 'currency' | 'number' | 'ratio';
interface ChartMetricDef {
  key: string;
  label: string;
  group: 'Revenue' | 'Spend' | 'Efficiency' | 'Users & Leads';
  format: ChartFormat;
  additive: boolean;
  lowerIsBetter: boolean;
  get: (r: GsHealthRow) => number;
}
const money = (key: string, label: string, group: 'Revenue' | 'Spend', get: (r: GsHealthRow) => number): ChartMetricDef =>
  ({ key, label, group, format: 'currency', additive: true, lowerIsBetter: group === 'Spend', get });
const perUnit = (key: string, label: string, get: (r: GsHealthRow) => number): ChartMetricDef =>
  ({ key, label, group: 'Efficiency', format: 'currency', additive: false, lowerIsBetter: true, get });
const ratio = (key: string, label: string, get: (r: GsHealthRow) => number): ChartMetricDef =>
  ({ key, label, group: 'Efficiency', format: 'ratio', additive: false, lowerIsBetter: false, get });
const unitValue = (key: string, label: string, get: (r: GsHealthRow) => number): ChartMetricDef =>
  ({ key, label, group: 'Efficiency', format: 'currency', additive: false, lowerIsBetter: false, get });
const count = (key: string, label: string, get: (r: GsHealthRow) => number): ChartMetricDef =>
  ({ key, label, group: 'Users & Leads', format: 'number', additive: true, lowerIsBetter: false, get });

const CHART_METRICS: ChartMetricDef[] = [
  money('grossRevenue', 'Gross Revenue (all funnels)', 'Revenue', (r) => r.combinedTotalRevenue),
  money('netRevenue', 'Net Revenue (all funnels)', 'Revenue', (r) => r.combinedNetRevenue),
  money('webinarRevenue', 'Webinar Revenue (gross)', 'Revenue', (r) => r.totalRevenue),
  money('webinarNetRevenue', 'Webinar Revenue (net)', 'Revenue', (r) => r.netRevenue),
  money('demoRevenue', 'Demo Funnel Revenue (gross)', 'Revenue', (r) => r.demoFunnelTotalRevenue),
  money('demoNetRevenue', 'Demo Funnel Revenue (net)', 'Revenue', (r) => r.demoFunnelNetRevenue),
  money('renewalRevenue', 'Renewal Revenue (gross)', 'Revenue', (r) => r.renewalTotalRevenue),
  money('renewalNetRevenue', 'Renewal Revenue (net)', 'Revenue', (r) => r.renewalNetRevenue),
  money('brokerage', 'Algo Brokerage Profit', 'Revenue', (r) => r.brokerageProfit),

  money('totalSpend', 'Total Spend (ads with GST + marketing + UGC)', 'Spend', (r) => r.totalSpendGross),
  money('webinarAds', 'Webinar Ads (with GST)', 'Spend', (r) => r.webinarAdsSpentWithGST),
  money('demoAds', 'Demo Funnel Ads (with GST)', 'Spend', (r) => r.leadAdsSpentWithGST),
  money('marketing', 'Marketing Spent (tools + UGC)', 'Spend', (r) => r.marketingSpending + r.ugcInfluencerCost),
  money('aisensy', 'AiSensy', 'Spend', (r) => r.marketingByTool.aisensy),
  money('periskope', 'Periskope', 'Spend', (r) => r.marketingByTool.periskope),
  money('exly', 'Exly', 'Spend', (r) => r.marketingByTool.exly),
  money('zoom', 'Zoom', 'Spend', (r) => r.marketingByTool.zoom),
  money('zohoCrm', 'Zoho CRM', 'Spend', (r) => r.marketingByTool.zohoCrm),
  money('ugc', 'UGC & Influencer', 'Spend', (r) => r.ugcInfluencerCost),

  ratio('merGross', 'MER (Gross)', (r) => r.merGross),
  ratio('merNet', 'MER (Net)', (r) => r.merNet),
  unitValue('ltvGross', 'LTV (Gross)', (r) => r.ltvGross),
  unitValue('ltvNet', 'LTV (Net)', (r) => r.ltvNet),
  perUnit('cac', 'Overall CAC', (r) => r.cac),
  perUnit('webinarCac', 'Webinar CAC', (r) => r.webinarCAC),
  perUnit('leadCac', 'Demo Funnel CAC', (r) => r.leadFunnelCAC),
  perUnit('webinarCpl', 'Webinar CPL', (r) => r.webinarCPL),
  perUnit('demoCpl', 'Demo Funnel CPL', (r) => r.demoFunnelCPL),
  ratio('webinarRoas', 'Webinar Net ROAS', (r) => r.webinarNetROAS),
  ratio('demoRoas', 'Demo Funnel Net ROAS', (r) => r.demoFunnelNetROAS),
  ratio('cacRatio', 'CAC Ratio', (r) => r.cacRatio),

  count('webinarRegistered', 'Webinar Registered', (r) => r.webinarRegisteredCount),
  count('demoLeads', 'Demo Funnel Leads (Lead Form)', (r) => r.leadFormRegisteredCount),
  count('paidUsers', 'Paid Users (Webinar + Demo)', (r) => r.paidUsers),
  count('webinarPaid', 'Webinar Paid Users', (r) => r.webinarConvertedCount),
  count('demoPaid', 'Demo Funnel Paid Users', (r) => r.demoConvertedCount),
  count('expectedRenewals', 'Expected Renewals', (r) => r.expectedRenewalCount),
  count('renewedUsers', 'Renewed Users', (r) => r.renewalCount),
];

router.get('/chart-data', async (_req: Request, res: Response) => {
  try {
    const allRowsRaw = await sheetsService.getMonthlyData();
    if (allRowsRaw.length === 0) {
      res.json({ success: true, data: null, timestamp: new Date().toISOString() } as APIResponse<any>);
      return;
    }

    // Same rule as Key Metrics: a still-empty placeholder month at the end is not plotted.
    const rows = effectiveRows(allRowsRaw);

    const data = {
      months: rows.map((r) => ({ key: r.monthKey, label: r.monthLabel, year: r.year })),
      metrics: CHART_METRICS.map((m) => ({
        key: m.key,
        label: m.label,
        group: m.group,
        format: m.format,
        additive: m.additive,
        lowerIsBetter: m.lowerIsBetter,
        values: rows.map((r) => {
          const v = m.get(r);
          return !m.additive && v === 0 ? null : parseFloat(v.toFixed(2));
        }),
      })),
    };

    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health chart data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chart data', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

// ============ Monthly revenue targets ============
// One target per calendar month (YYYY-MM), shared by everyone with access to this tab. "Achieved" is
// always the sheet's Total Revenue for that month (Webinar + Demo Funnel + Renewal), so the target
// popup can show how much is left without any extra data entry.
const TARGETS_COLLECTION = 'gs_revenue_targets';
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get('/revenue-targets', async (_req: Request, res: Response) => {
  try {
    const [rows, targetDocs] = await Promise.all([
      sheetsService.getMonthlyData(),
      getDatabase().collection(TARGETS_COLLECTION).find({}).toArray(),
    ]);

    const months = rows.map((r) => ({
      monthKey: r.monthKey,
      monthLabel: r.monthLabel,
      totalRevenue: r.combinedTotalRevenue,
      netRevenue: r.combinedNetRevenue,
      webinar: r.totalRevenue,
      demo: r.demoFunnelTotalRevenue,
      renewal: r.renewalTotalRevenue,
    }));

    const targets: Record<string, number> = {};
    for (const d of targetDocs as any[]) targets[d.monthKey] = d.target;

    // The month the Key Metrics cards treat as "current" (skips a still-empty placeholder month).
    const defaultMonth = rows.length > 0 ? effectiveRows(rows)[effectiveRows(rows).length - 1].monthKey : null;

    res.json({ success: true, data: { months, targets, defaultMonth }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching revenue targets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue targets', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

// target = a positive number sets/replaces that month's target; null or 0 clears it.
router.put('/revenue-targets/:monthKey', requirePermission('card:gs-health:key-metrics'), async (req: AuthedRequest, res: Response) => {
  try {
    const monthKey = req.params.monthKey;
    if (!MONTH_KEY_RE.test(monthKey)) {
      res.status(400).json({ success: false, error: 'monthKey must look like 2026-09', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const raw = req.body?.target;
    const target = raw === null || raw === undefined ? 0 : Number(raw);
    if (!Number.isFinite(target) || target < 0 || target > 1e11) {
      res.status(400).json({ success: false, error: 'target must be a non-negative number', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const col = getDatabase().collection(TARGETS_COLLECTION);
    if (target === 0) {
      await col.deleteOne({ monthKey });
    } else {
      await col.updateOne(
        { monthKey },
        { $set: { monthKey, target: Math.round(target), updatedAt: new Date(), updatedBy: req.authUser?.email || null } },
        { upsert: true }
      );
    }

    res.json({ success: true, data: { monthKey, target: target === 0 ? null : Math.round(target) }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error saving revenue target:', error);
    res.status(500).json({ success: false, error: 'Failed to save revenue target', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const allRows = await sheetsService.getMonthlyData();
    const rows = selectRows(allRows, req);

    if (rows.length === 0) {
      res.json({
        success: true,
        data: { cards: {}, charts: {}, table: [] },
        timestamp: new Date().toISOString(),
      } as APIResponse<any>);
      return;
    }

    // Cards: simple monthly average across selected range, plus totals
    const cards = {
      totalNetRevenue: sum(rows.map(r => r.combinedNetRevenue)),
      avgCac: average(rows.map(r => r.cac)),
      avgPaidUsers: average(rows.map(r => r.paidUsers)),
      totalAdsSpent: sum(rows.map(r => r.adsSpent)),
      avgCpp: average(rows.map(r => r.cpp)),
      totalLeads: sum(rows.map(r => r.registeredCount)),
      avgLeads: average(rows.map(r => r.registeredCount)),
    };

    // Charts: pre-shaped series, chronological order (oldest -> newest)
    const labels = rows.map(r => r.monthLabel);

    let cumulativeNetRevenue = 0;
    const cumulativeNetRevenueSeries = rows.map(r => {
      cumulativeNetRevenue += r.combinedNetRevenue;
      return cumulativeNetRevenue;
    });

    const charts = {
      labels,
      cac: rows.map(r => r.cac),
      cacRatio: rows.map(r => r.cacRatio),
      netRevenueMonthly: rows.map(r => r.combinedNetRevenue),
      netRevenueCumulative: cumulativeNetRevenueSeries,
      cpp: rows.map(r => r.cpp),
      netRoas: rows.map(r => r.netRoas),
    };

    // Table: newest first for readability
    const table = [...rows].reverse();

    res.json({
      success: true,
      data: { cards, charts, table },
      timestamp: new Date().toISOString(),
    } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GS Health data',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
