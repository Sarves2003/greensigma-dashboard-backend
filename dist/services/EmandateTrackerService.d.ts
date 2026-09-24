export type PaymentStatus = 'Full Paid' | 'Emandate' | 'Refunded' | 'Cancelled' | 'Pending';
export interface EmandateDayPayment {
    date: string | null;
    status: 'captured' | 'refunded' | null;
}
export type MandateState = 'active' | 'halted' | 'cancelled' | 'not_started' | 'not_applicable';
export interface EmandatePortfolioLine {
    name: string;
    broker: string;
    invested: number;
    current: number;
    pnl: number;
}
export interface EmandatePortfolioSummary {
    broker: string;
    count: number;
    totalInvested: number;
    totalCurrent: number;
    totalPnl: number;
    portfolios: EmandatePortfolioLine[];
}
export interface EmandateManualInvestment {
    broker: string;
    investedAmount: number;
    currentValue: number;
    updatedAt: string;
}
export interface EmandateRow {
    name: string;
    phone: string;
    email: string;
    paymentStatus: PaymentStatus;
    payment2: EmandateDayPayment | null;
    payment3: EmandateDayPayment | null;
    initialDone: boolean;
    payment2Done: boolean;
    payment3Done: boolean;
    currentState: MandateState;
    settled: boolean;
    paymentDoneCount: number;
    remark: string;
    lastLoginAt: string | null;
    livePortfolio: EmandatePortfolioSummary | null;
    manualInvestment: EmandateManualInvestment | null;
}
export interface EmandateSummary {
    totalInitialPaid: number;
    totalFullPaid: number;
    totalRefunded: number;
    owesEmandate: number;
    initialDoneCount: number;
    initialDonePct: number | null;
    payment2DoneCount: number;
    payment2DonePct: number | null;
    payment3DoneCount: number;
    payment3DonePct: number | null;
    notDoneAtAllCount: number;
    notDoneAtAllPct: number | null;
    cancelledCount: number;
    cancelledPct: number | null;
    haltedCount: number;
    haltedPct: number | null;
    overallConversionPct: number | null;
    emandateEraApplies: boolean;
}
export interface EmandateOverviewBucketUser {
    name: string;
    phone: string;
    batchDate: string;
    paymentDoneCount: number;
    settled: boolean;
}
export interface EmandateOverviewBatchPoint {
    batchDate: string;
    initialCompletionPct: number | null;
    fullPaymentCompletionPct: number | null;
}
export interface EmandateOverview {
    owesEmandate: number;
    initialDoneCount: number;
    initialDonePct: number | null;
    payment2DoneCount: number;
    payment2DonePct: number | null;
    payment3DoneCount: number;
    payment3DonePct: number | null;
    notDoneAtAllCount: number;
    notDoneAtAllPct: number | null;
    cancelledCount: number;
    cancelledPct: number | null;
    haltedCount: number;
    haltedPct: number | null;
    emandateEraApplies: boolean;
    buckets: {
        notDoneAtAll: EmandateOverviewBucketUser[];
        cancelled: EmandateOverviewBucketUser[];
        halted: EmandateOverviewBucketUser[];
    };
    chart: EmandateOverviewBatchPoint[];
}
export interface EmandateBatchTableRow extends EmandateSummary {
    batchDate: string;
}
export declare class EmandateTrackerService {
    private paidCache;
    private subscribeCache;
    private portfolioPnlCache;
    private unrealizedPnlService;
    private fetchPaidList;
    private fetchSubscribeDocs;
    private buildSubscribeIndex;
    private getPersonFacts;
    private buildBatchRows;
    private loadCommonData;
    getEmandateTable(batchDateKey: string): Promise<{
        rows: EmandateRow[];
        summary: EmandateSummary;
        batchDate: string;
    }>;
    private getCachedLivePortfolios;
    private getLastLoginMap;
    private enrichWithPortfolioAndLogin;
    getOverview(batchDateKeys: string[]): Promise<EmandateOverview>;
    getBatchTable(batchDateKeys: string[]): Promise<EmandateBatchTableRow[]>;
    saveRemark(phone: string, batchDate: string, remark: string): Promise<void>;
    savePaymentStatusOverride(phone: string, batchDate: string, statusOverride: PaymentStatus | null): Promise<void>;
    saveManualInvestment(phone: string, broker: string, investedAmount: number, currentValue: number): Promise<void>;
}
//# sourceMappingURL=EmandateTrackerService.d.ts.map