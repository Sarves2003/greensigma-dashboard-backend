export declare const LEAD_STATUS_OPTIONS: readonly ["DP", "Not Qualified", "Not Interested", "Pitched", "Booked", "Paid"];
export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number];
export interface NoteEntry {
    text: string;
    byName: string;
    createdAt: string;
}
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
    liveScoringCount: number;
    etfLiveScoringCount: number;
    etfBacktestCount: number;
    intradayCount: number;
    portfoliosCreatedCount: number;
    brokerConnectedCount: number;
    usageScore: number;
    intentScore: number;
    overallScore: number;
    status: string | null;
    latestNote: NoteEntry | null;
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
    leadFrom: string | null;
}
export interface UserDetail {
    id: string;
    name: string;
    mobile: string;
    email: string;
    type: string;
    referalCode: string | null;
    signedUpAt: string | null;
    lastLoginAt: string | null;
    portfolioDeployedAt: string | null;
    usageScore: number;
    intentScore: number;
    overallScore: number;
    featureBreakdown: {
        liveScoring: number;
        backtest: number;
        etfLiveScoring: number;
        etfBacktest: number;
        intraday: number;
        portfoliosCreated: number;
        brokerConnected: number;
    };
    demoCalls: {
        preferredDate: string | null;
        preferredTime: string | null;
        createdAt: string | null;
        leadFrom: string | null;
    }[];
    assessments: {
        status: string | null;
        registrationStatus: string | null;
        completedAt: string | null;
        leadFrom: string | null;
        district: string | null;
        state: string | null;
        occupation: string | null;
        investmentExperience: string | null;
        portfolioSize: string | null;
        challenges: string[];
        otherChallenge: string | null;
    }[];
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
    private static readonly STATUS_COLLECTION;
    private getStatusMap;
    setUserStatus(userId: string, status: LeadStatus | null): Promise<void>;
    addUserNote(userId: string, text: string, byName: string): Promise<NoteEntry[]>;
    getUserNotes(userId: string): Promise<NoteEntry[]>;
    getUserDetail(userId: string): Promise<UserDetail | null>;
}
//# sourceMappingURL=UsageAnalysisService.d.ts.map