export interface MainTabRow {
    id: string;
    name: string;
    mobile: string;
    email: string;
    type: string;
    referalCode: string | null;
    signedUpAt: string | null;
    lastLoginAt: string | null;
    demoCallCount: number;
    assessmentCount: number;
    btCount: number;
    usageScore: number;
}
export interface BookingRow {
    id: string;
    name: string;
    mobile: string;
    email: string | null;
    preferredDate: string | null;
    preferredTime: string | null;
    status: string | null;
    createdAt: string | null;
    registered: boolean;
    matchedType: string | null;
    matchedReferalCode: string | null;
}
export interface MainTabFilters {
    startDate?: Date;
    endDate?: Date;
    type?: string;
    referalCode?: string;
    search?: string;
}
export declare class UsageAnalysisService {
    getMainTab(filters: MainTabFilters): Promise<MainTabRow[]>;
    getDemoCallTab(): Promise<BookingRow[]>;
    getAssessmentTab(): Promise<BookingRow[]>;
    private toBookingRow;
    private getUserLookupMaps;
    private getLastLoginMap;
    private getDemoCallPhoneMap;
    private getAssessmentPhoneMap;
    private getAssessmentEmailMap;
    private getFeatureCountMaps;
}
//# sourceMappingURL=UsageAnalysisService.d.ts.map