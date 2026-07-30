import axios from 'axios';
import { parse } from 'csv-parse/sync';

export interface GsHealthRow {
  year: number;
  month: number; // 1-12
  monthLabel: string; // derived from year+month, e.g. "Jul 2026"
  monthKey: string; // "2026-07", sortable
  quarter: string;
  registeredCount: number;
  totalRevenue: number;
  netRevenue: number;
  eventSpent: number;
  adsSpent: number;
  adsSpentWithGST: number;
  cpp: number;
  netRoas: number;
  team: string;
  agencyCost: number;
  salesSalary: number;
  paidUsers: number; // "Fully converted User Count"
  cac: number;
  productCost: number;
  cacRatio: number;
  notes: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GoogleSheetsService {
  private cache: GsHealthRow[] | null = null;
  private cacheTimestamp = 0;

  private toNumber(val: string): number {
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

    const records: string[][] = parse(response.data, {
      skip_empty_lines: true,
    });

    const [header, ...dataRows] = records;

    const rows: GsHealthRow[] = dataRows
      .filter(r => r[0] && r[1]) // must have Year + Month
      .map(r => {
        const year = parseInt(r[0], 10);
        const month = parseInt(r[1], 10);
        const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        return {
          year,
          month,
          monthLabel,
          monthKey,
          quarter: r[3] || '',
          registeredCount: this.toNumber(r[4]),
          totalRevenue: this.toNumber(r[5]),
          netRevenue: this.toNumber(r[6]),
          eventSpent: this.toNumber(r[7]),
          adsSpent: this.toNumber(r[8]),
          adsSpentWithGST: this.toNumber(r[9]),
          cpp: this.toNumber(r[10]),
          netRoas: this.toNumber(r[11]),
          team: r[12] || '',
          agencyCost: this.toNumber(r[13]),
          salesSalary: this.toNumber(r[14]),
          paidUsers: this.toNumber(r[15]),
          cac: this.toNumber(r[16]),
          productCost: this.toNumber(r[17]),
          cacRatio: this.toNumber(r[18]),
          notes: (r[20] || '').trim(),
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    this.cache = rows;
    this.cacheTimestamp = now;
    return rows;
  }
}
