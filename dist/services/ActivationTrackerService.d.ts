export interface ActivationDayCell {
    completed: boolean;
    response: string | null;
    submittedAt: string | null;
    manual: boolean;
}
export interface ActivationRow {
    name: string;
    phone: string;
    email: string;
    status: 'Full Paid' | 'Emandate' | 'None';
    days: ActivationDayCell[];
    score: number;
    remark: string;
}
export declare class ActivationTrackerService {
    private paidCache;
    private activationCache;
    private fetchPaidList;
    private fetchDayTab;
    private fetchActivationByDay;
    getActivationTable(batchDateKey: string): Promise<{
        rows: ActivationRow[];
        batchDate: string;
    }>;
    saveRemark(phone: string, batchDate: string, remark: string): Promise<void>;
    saveDayOverride(phone: string, batchDate: string, day: number, completed: boolean | null): Promise<void>;
}
//# sourceMappingURL=ActivationTrackerService.d.ts.map