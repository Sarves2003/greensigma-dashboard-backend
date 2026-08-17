export type PaymentStatus = 'Full Paid' | 'Emandate' | 'Refunded' | 'Cancelled' | 'Pending';
export interface EmandateDayPayment {
    date: string | null;
    status: 'captured' | 'refunded' | null;
}
export type MandateState = 'active' | 'cancelled' | 'halted' | 'not_done' | 'not_applicable';
export interface EmandateRow {
    name: string;
    phone: string;
    email: string;
    paymentStatus: PaymentStatus;
    payment2: EmandateDayPayment | null;
    payment3: EmandateDayPayment | null;
    mandateState: MandateState;
    settled: boolean;
    paymentDoneCount: number;
    remark: string;
}
export interface EmandateSummary {
    totalInitialPaid: number;
    totalFullPaid: number;
    remaining: number;
    completed: number;
    completedPct: number;
    notDone: number;
    cancelled: number;
    halted: number;
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
    totalOwesEmandate: number;
    completed: number;
    completedPct: number;
    notDone: number;
    notDonePct: number;
    cancelled: number;
    cancelledPct: number;
    halted: number;
    haltedPct: number;
    emandateEraApplies: boolean;
    buckets: {
        notDone: EmandateOverviewBucketUser[];
        cancelled: EmandateOverviewBucketUser[];
        halted: EmandateOverviewBucketUser[];
    };
    chart: EmandateOverviewBatchPoint[];
}
export declare class EmandateTrackerService {
    private paidCache;
    private fetchPaidList;
    private fetchBestSubscribeDocs;
    private toDayPayment;
    private buildBatchRows;
    getEmandateTable(batchDateKey: string): Promise<{
        rows: EmandateRow[];
        summary: EmandateSummary;
        batchDate: string;
    }>;
    getOverview(batchDateKeys: string[]): Promise<EmandateOverview>;
    saveRemark(phone: string, batchDate: string, remark: string): Promise<void>;
    savePaymentStatusOverride(phone: string, batchDate: string, statusOverride: PaymentStatus | null): Promise<void>;
}
//# sourceMappingURL=EmandateTrackerService.d.ts.map