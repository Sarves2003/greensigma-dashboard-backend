export interface ActivationDayCell {
    completed: boolean;
    response: string | null;
    submittedAt: string | null;
    manual: boolean;
}
export interface ActivationPortfolioLine {
    name: string;
    broker: string;
    invested: number;
    current: number;
    pnl: number;
}
export interface ActivationPortfolioSummary {
    broker: string;
    count: number;
    totalInvested: number;
    totalCurrent: number;
    totalPnl: number;
    portfolios: ActivationPortfolioLine[];
}
export interface ActivationManualInvestment {
    broker: string;
    investedAmount: number;
    currentValue: number;
    updatedAt: string;
}
export interface ActivationRow {
    name: string;
    phone: string;
    email: string;
    status: 'Full Paid' | 'Emandate' | 'None';
    days: ActivationDayCell[];
    score: number;
    remark: string;
    lastLoginAt: string | null;
    livePortfolio: ActivationPortfolioSummary | null;
    manualInvestment: ActivationManualInvestment | null;
}
export declare class ActivationTrackerService {
    private paidCache;
    private activationCache;
    private portfolioPnlCache;
    private unrealizedPnlService;
    private fetchPaidList;
    private fetchDayTab;
    private fetchActivationByDay;
    getActivationTable(batchDateKey: string): Promise<{
        rows: ActivationRow[];
        batchDate: string;
        investedCount: number;
    }>;
    private getCachedLivePortfolios;
    private getLastLoginMap;
    private enrichWithPortfolioAndLogin;
    saveRemark(phone: string, batchDate: string, remark: string): Promise<void>;
    saveDayOverride(phone: string, batchDate: string, day: number, completed: boolean | null): Promise<void>;
}
//# sourceMappingURL=ActivationTrackerService.d.ts.map