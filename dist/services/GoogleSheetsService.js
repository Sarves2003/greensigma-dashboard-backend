"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsService = void 0;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
class GoogleSheetsService {
    constructor() {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
    toNumber(val) {
        if (!val)
            return 0;
        const n = parseFloat(val.toString().replace(/,/g, '').trim());
        return isNaN(n) ? 0 : n;
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
        const response = await axios_1.default.get(csvUrl, { responseType: 'text', timeout: 15000 });
        const records = (0, sync_1.parse)(response.data, {
            columns: true,
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
exports.GoogleSheetsService = GoogleSheetsService;
//# sourceMappingURL=GoogleSheetsService.js.map