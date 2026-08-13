import { FilterOptions } from '../types';
declare const LEDGER_SOURCES: readonly ["login", "stockScore", "stockBacktest", "etfScore", "etfBacktest", "intraday", "portfolio", "broker"];
type LedgerSource = typeof LEDGER_SOURCES[number];
export declare const ACTIVE_ACTION_COLLECTIONS: {
    name: string;
    dateField: string;
}[];
export declare class OverviewV2Service {
    private plot5Cache;
    private buildUserFilter;
    getKeyMetrics(filters: FilterOptions): Promise<any>;
    private getActiveUserCount;
    private getAvgDaysToFirstPortfolio;
    getFeatureUsage(filters: FilterOptions): Promise<any[]>;
    getSignupsMonthly(filters: FilterOptions): Promise<any>;
    getLedgerUsageByCohort(filters: FilterOptions, ledgerItems: LedgerSource[]): Promise<any>;
    getActivationRate(monthKeys: string[], type: 'real' | 'paper', dayWindow?: number): Promise<any>;
    getLiveCapitalRate(monthKeys: string[]): Promise<any>;
    getMonthlyActivePaid(ledgerItems: LedgerSource[]): Promise<any>;
    private computeMonthlyActivePaid;
    getActiveUserFlow(userType: string, dayWindow: number): Promise<any>;
    getActiveUserFlowByPeriod(userType: string, period: 'thisMonth' | 'lastMonth' | 'last3Months'): Promise<any>;
    private static readonly ENGAGEMENT_BUCKETS;
    getEngagementDistribution(userType: string, period: 'thisMonth' | 'lastMonth' | 'last3Months' | 'custom', customStart?: Date, customEnd?: Date): Promise<any>;
    getActiveUserBreakdown(userType: string, granularity: 'daily' | 'monthly' | 'quarterly' | 'daywise', startDate: Date, endDate: Date): Promise<any>;
}
export { LEDGER_SOURCES, LedgerSource };
//# sourceMappingURL=OverviewV2Service.d.ts.map