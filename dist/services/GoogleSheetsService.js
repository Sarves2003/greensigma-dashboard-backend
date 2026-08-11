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
            skip_empty_lines: true,
        });
        const [header, ...dataRows] = records;
        const rows = dataRows
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
exports.GoogleSheetsService = GoogleSheetsService;
//# sourceMappingURL=GoogleSheetsService.js.map