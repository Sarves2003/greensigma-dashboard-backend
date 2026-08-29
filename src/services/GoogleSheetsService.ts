import axios from 'axios';
import { parse } from 'csv-parse/sync';

// Parsed by column HEADER, not position — the sheet has had columns inserted before (e.g. "Lead
// form Registered Count" landing between "Webinar registered Count" and "Total Revenue"), and a
// position-based parse silently reads the wrong column for everything after the insertion point.
// Reading by header name is immune to future reordering/insertion as long as the header text itself
// doesn't change.
export interface GsHealthRow {
  year: number;
  month: number; // 1-12
  monthLabel: string; // derived from year+month, e.g. "Jul 2026"
  monthKey: string; // "2026-07", sortable
  quarter: string;

  webinarRegisteredCount: number;
  leadFormRegisteredCount: number;
  totalRevenue: number;
  netRevenue: number;
  demoFunnelTotalRevenue: number;
  demoFunnelNetRevenue: number;
  eventSpent: number;
  webinarAdsSpent: number;
  webinarAdsSpentWithGST: number;
  leadAdsSpent: number;
  leadAdsSpentWithGST: number;
  ugcInfluencerCost: number;
  webinarCPL: number;
  demoFunnelCPL: number;
  webinarNetROAS: number;
  demoFunnelNetROAS: number;
  team: string;
  agencyCost: number;
  salesSalary: number;
  webinarConvertedCount: number;
  demoConvertedCount: number;
  webinarCAC: number;
  leadFunnelCAC: number;
  overallCAC: number;
  productCost: number;
  cacRatio: number;
  notes: string;

  // Combined/derived fields used by the unified (channel-agnostic) Key Metrics tab.
  registeredCount: number; // webinar + lead form
  paidUsers: number; // webinar + demo converted
  adsSpent: number; // webinar + lead ads spend, GST-inclusive (the real cash outlay)
  cac: number; // sheet's own Overall CAC — not re-derived
  cpp: number; // webinar CPL, kept under the old field name for backward compatibility
  netRoas: number; // webinar Net ROAS, kept under the old field name for backward compatibility
  // "Total Revenue"/"Net Revenue" are webinar-only; Demo Funnel revenue is a separate pool on top
  // of that, not a breakdown of it — confirmed with the business, not inferred from column names.
  combinedTotalRevenue: number;
  combinedNetRevenue: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GoogleSheetsService {
  private cache: GsHealthRow[] | null = null;
  private cacheTimestamp = 0;

  private toNumber(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.toString().replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
  }

  async getMonthlyData(): Promise<GsHealthRow[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cache;
    }

    const csvUrl = process.env.GS_HEALTH_CSV_URL;
    if (!csvUrl) {
      throw new Error('GS_HEALTH_CSV_URL environment variable is not set');
    }

    const response = await axios.get(csvUrl, { responseType: 'text', timeout: 15000 });

    const records: Record<string, string>[] = parse(response.data, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });

    const rows: GsHealthRow[] = records
      .filter((r) => r['Year'] && r['Month']) // must have Year + Month
      .map((r) => {
        const year = parseInt(r['Year'], 10);
        const month = parseInt(r['Month'], 10);
        const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        const webinarRegisteredCount = this.toNumber(r['Webinar registered Count']);
        const leadFormRegisteredCount = this.toNumber(r['Lead form Registered Count']);
        const webinarAdsSpentWithGST = this.toNumber(r['Webinar Ads spent with GST']);
        const leadAdsSpentWithGST = this.toNumber(r['Demo Lead Ads Spent with GST']);
        const webinarConvertedCount = this.toNumber(r['Webinar Converter Counts']);
        const demoConvertedCount = this.toNumber(r['Demo Converted Counts']);
        const totalRevenue = this.toNumber(r['Total Revenue']);
        const netRevenue = this.toNumber(r['Net Revenue']);
        const demoFunnelTotalRevenue = this.toNumber(r['Demo Funnel Total Revenue']);
        const demoFunnelNetRevenue = this.toNumber(r['Demo Funnel Net Revenue']);

        return {
          year,
          month,
          monthLabel,
          monthKey,
          quarter: r['Quarter'] || '',

          webinarRegisteredCount,
          leadFormRegisteredCount,
          totalRevenue,
          netRevenue,
          demoFunnelTotalRevenue,
          demoFunnelNetRevenue,
          eventSpent: this.toNumber(r['Event Spent']),
          webinarAdsSpent: this.toNumber(r['Webinar Ads spent']),
          webinarAdsSpentWithGST,
          leadAdsSpent: this.toNumber(r['Demo Lead Ads Spent']),
          leadAdsSpentWithGST,
          ugcInfluencerCost: this.toNumber(r['UGC & Influencer Cost']),
          webinarCPL: this.toNumber(r['Webinar CPL']),
          demoFunnelCPL: this.toNumber(r['Demo Funnel CPL']),
          webinarNetROAS: this.toNumber(r['Webinar Net ROAS']),
          demoFunnelNetROAS: this.toNumber(r['Demo Funnel Net ROAS']),
          team: r['Team'] || '',
          agencyCost: this.toNumber(r['Agency Cost']),
          salesSalary: this.toNumber(r['Sales Salary']),
          webinarConvertedCount,
          demoConvertedCount,
          webinarCAC: this.toNumber(r['Webinar CAC']),
          leadFunnelCAC: this.toNumber(r['Lead Funnel CAC']),
          overallCAC: this.toNumber(r['Overall CAC']),
          productCost: this.toNumber(r['Product Cost']),
          cacRatio: this.toNumber(r['CAC Ratio']),
          notes: (r['Notes'] || '').trim(),

          registeredCount: webinarRegisteredCount + leadFormRegisteredCount,
          paidUsers: webinarConvertedCount + demoConvertedCount,
          adsSpent: webinarAdsSpentWithGST + leadAdsSpentWithGST,
          cac: this.toNumber(r['Overall CAC']),
          cpp: this.toNumber(r['Webinar CPL']),
          netRoas: this.toNumber(r['Webinar Net ROAS']),
          combinedTotalRevenue: totalRevenue + demoFunnelTotalRevenue,
          combinedNetRevenue: netRevenue + demoFunnelNetRevenue,
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    this.cache = rows;
    this.cacheTimestamp = now;
    return rows;
  }
}
