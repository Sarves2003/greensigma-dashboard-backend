"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsService = void 0;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const EMPTY_TOOLS = { aisensy: 0, periskope: 0, exly: 0, zoom: 0, zohoCrm: 0 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
class GoogleSheetsService {
    constructor() {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
    // Strips currency symbols, thousands separators, %, spaces — anything that isn't part of the
    // number itself — before parsing. Blank/non-numeric cells are 0.
    toNumber(val) {
        if (!val)
            return 0;
        const cleaned = val.toString().replace(/[^0-9.\-]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }
    // First header that exists in the row wins — lets a renamed column keep working under its old name.
    num(r, ...headers) {
        for (const h of headers) {
            if (r[h] !== undefined && r[h] !== '')
                return this.toNumber(r[h]);
        }
        return 0;
    }
    // The Marketing and Brokerage tabs live in the same published document as the monthly tab, so their
    // URLs are the monthly URL with the tab's gid swapped in (no new env var needed on deploy). A full
    // GS_MARKETING_CSV_URL / GS_BROKERAGE_CSV_URL overrides that if the tabs are ever published elsewhere.
    tabUrl(monthlyUrl, gid, override) {
        if (override)
            return override;
        return /([?&])gid=\d+/.test(monthlyUrl) ? monthlyUrl.replace(/([?&])gid=\d+/, `$1gid=${gid}`) : null;
    }
    async fetchTab(url, label) {
        if (!url)
            return null;
        try {
            const response = await axios_1.default.get(url, { responseType: 'text', timeout: 15000 });
            return (0, sync_1.parse)(response.data, {
                columns: (header) => header.map((h) => h.trim()),
                skip_empty_lines: true,
                relax_column_count: true,
            });
        }
        catch (error) {
            // These tabs enrich the numbers but must never take the whole page down if they're unreachable.
            console.warn(`GS Health: could not read the ${label} tab, falling back to the monthly sheet columns`, error.message);
            return null;
        }
    }
    // "28-09-2024", "28/9/2024" or "2024-09-28" -> "2024-09"
    monthKeyFromDate(raw) {
        const t = (raw || '').trim();
        let m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
        if (m)
            return `${m[3]}-${m[2].padStart(2, '0')}`;
        m = t.match(/^(\d{4})-(\d{2})-\d{2}/);
        return m ? `${m[1]}-${m[2]}` : null;
    }
    async readMarketingByMonth(monthlyUrl) {
        const url = this.tabUrl(monthlyUrl, process.env.GS_MARKETING_GID || '1534982478', process.env.GS_MARKETING_CSV_URL);
        const records = await this.fetchTab(url, 'Marketing');
        if (!records)
            return null;
        const byMonth = new Map();
        for (const r of records) {
            const key = this.monthKeyFromDate(r['Date']);
            if (!key)
                continue;
            // Match tool headers case-insensitively ("Zoho Crm" / "Zoho CRM").
            const get = (name) => {
                const header = Object.keys(r).find((h) => h.toLowerCase() === name);
                return header ? this.toNumber(r[header]) : 0;
            };
            const cur = byMonth.get(key) || { ...EMPTY_TOOLS };
            cur.aisensy += get('aisensy');
            cur.periskope += get('periskope');
            cur.exly += get('exly');
            cur.zoom += get('zoom');
            cur.zohoCrm += get('zoho crm');
            byMonth.set(key, cur);
        }
        return byMonth;
    }
    async readBrokerageByMonth(monthlyUrl) {
        const url = this.tabUrl(monthlyUrl, process.env.GS_BROKERAGE_GID || '1004023964', process.env.GS_BROKERAGE_CSV_URL);
        const records = await this.fetchTab(url, 'Brokerage');
        if (!records)
            return null;
        const byMonth = new Map();
        for (const r of records) {
            const year = parseInt(r['Year'], 10);
            const month = parseInt(r['Month'], 10);
            if (!year || !month)
                continue;
            byMonth.set(`${year}-${String(month).padStart(2, '0')}`, this.toNumber(r['Amount']));
        }
        return byMonth;
    }
    async getMonthlyData() {
        const now = Date.now();
        if (this.cache && now - this.cacheTimestamp < CACHE_TTL_MS) {
            return this.cache;
        }
        const csvUrl = process.env.GS_HEALTH_CSV_URL;
        if (!csvUrl) {
            throw new Error('GS_HEALTH_CSV_URL environment variable is not set');
        }
        const [response, marketingByMonth, brokerageByMonth] = await Promise.all([
            axios_1.default.get(csvUrl, { responseType: 'text', timeout: 15000 }),
            this.readMarketingByMonth(csvUrl),
            this.readBrokerageByMonth(csvUrl),
        ]);
        const records = (0, sync_1.parse)(response.data, {
            columns: (header) => header.map((h) => h.trim()),
            skip_empty_lines: true,
            relax_column_count: true,
        });
        const rows = records
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
            const totalRevenue = this.num(r, 'Webinar Total Revenue', 'Total Revenue');
            const netRevenue = this.num(r, 'Webinar Net Revenue', 'Net Revenue');
            const demoFunnelTotalRevenue = this.toNumber(r['Demo Funnel Total Revenue']);
            const demoFunnelNetRevenue = this.toNumber(r['Demo Funnel Net Revenue']);
            const renewalTotalRevenue = this.toNumber(r['Renewal Total Revenue']);
            const renewalNetRevenue = this.toNumber(r['Renewal Net Revenue']);
            const marketingByTool = marketingByMonth?.get(monthKey) || { ...EMPTY_TOOLS };
            const toolsTotal = marketingByTool.aisensy + marketingByTool.periskope + marketingByTool.exly + marketingByTool.zoom + marketingByTool.zohoCrm;
            const monthlyColumnMarketing = this.toNumber(r['Marketing Spending']); // blank -> 0
            const marketingSpending = toolsTotal > 0 ? toolsTotal : monthlyColumnMarketing;
            const marketingUnallocated = toolsTotal > 0 ? 0 : monthlyColumnMarketing;
            const brokerageProfit = brokerageByMonth?.get(monthKey) || 0;
            const ugcInfluencerCost = this.toNumber(r['UGC & Influencer Cost']);
            const totalSpendGross = webinarAdsSpentWithGST + leadAdsSpentWithGST + marketingSpending + ugcInfluencerCost;
            const totalSpendNet = this.toNumber(r['Webinar Ads spent']) + this.toNumber(r['Demo Lead Ads Spent']) + marketingSpending + ugcInfluencerCost;
            const revenueGross = totalRevenue + demoFunnelTotalRevenue + renewalTotalRevenue + brokerageProfit;
            const revenueNet = netRevenue + demoFunnelNetRevenue + renewalNetRevenue + brokerageProfit;
            // Free-text remarks: the sheet's old "Notes" column now sits under a blank header, and a
            // separate "Monthly Change" column carries similar short comments. Show whichever exist.
            const notes = [r['Notes'], r['Monthly Change'], r['']]
                .map((v) => (v || '').trim())
                .filter(Boolean)
                .join(' · ');
            return {
                year,
                month,
                monthLabel,
                monthKey,
                quarter: r['Quarter'] || '',
                webinarRegisteredCount,
                leadFormRegisteredCount,
                expectedRenewalCount: this.toNumber(r['Expected Renewal Count']),
                totalRevenue,
                netRevenue,
                demoFunnelTotalRevenue,
                demoFunnelNetRevenue,
                renewalTotalRevenue,
                renewalNetRevenue,
                renewalCount: this.toNumber(r['Renewal']),
                marketingSpending,
                marketingByTool,
                marketingUnallocated,
                brokerageProfit,
                paymentCompletion: this.toNumber(r['Payment Completion']),
                eventSpent: this.toNumber(r['Event Spent']),
                webinarAdsSpent: this.toNumber(r['Webinar Ads spent']),
                webinarAdsSpentWithGST,
                leadAdsSpent: this.toNumber(r['Demo Lead Ads Spent']),
                leadAdsSpentWithGST,
                ugcInfluencerCost,
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
                notes,
                registeredCount: webinarRegisteredCount + leadFormRegisteredCount,
                paidUsers: webinarConvertedCount + demoConvertedCount,
                adsSpent: webinarAdsSpentWithGST + leadAdsSpentWithGST,
                cac: this.toNumber(r['Overall CAC']),
                cpp: this.toNumber(r['Webinar CPL']),
                netRoas: this.toNumber(r['Webinar Net ROAS']),
                combinedTotalRevenue: totalRevenue + demoFunnelTotalRevenue + renewalTotalRevenue,
                combinedNetRevenue: netRevenue + demoFunnelNetRevenue + renewalNetRevenue,
                totalSpendGross,
                totalSpendNet,
                merGross: totalSpendGross > 0 ? parseFloat((revenueGross / totalSpendGross).toFixed(2)) : 0,
                merNet: totalSpendNet > 0 ? parseFloat((revenueNet / totalSpendNet).toFixed(2)) : 0,
                ltvGross: webinarConvertedCount + demoConvertedCount > 0 ? parseFloat((revenueGross / (webinarConvertedCount + demoConvertedCount)).toFixed(2)) : 0,
                ltvNet: webinarConvertedCount + demoConvertedCount > 0 ? parseFloat((revenueNet / (webinarConvertedCount + demoConvertedCount)).toFixed(2)) : 0,
            };
        })
            .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        this.cache = rows;
        this.cacheTimestamp = now;
        return rows;
    }
}
exports.GoogleSheetsService = GoogleSheetsService;
//# sourceMappingURL=GoogleSheetsService.js.map