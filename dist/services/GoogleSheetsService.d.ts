export interface GsHealthRow {
    year: number;
    month: number;
    monthLabel: string;
    monthKey: string;
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
    paidUsers: number;
    cac: number;
    productCost: number;
    cacRatio: number;
    notes: string;
}
export declare class GoogleSheetsService {
    private cache;
    private cacheTimestamp;
    private toNumber;
    getMonthlyData(): Promise<GsHealthRow[]>;
}
//# sourceMappingURL=GoogleSheetsService.d.ts.map