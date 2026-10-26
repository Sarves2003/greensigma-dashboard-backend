export type AttendanceSource = 'sheet' | 'live' | 'unavailable';
export interface WebinarWiseRow {
    date: string;
    label: string;
    batch: string;
    registered: number;
    total: number;
    paymentFull: number;
    advance: number;
    preSales: number;
    convByRegistration: number;
    convBySales: number;
    attendance: number | null;
    attendanceSource: AttendanceSource;
    attendanceNumerator: number | null;
    attendanceDenominator: number | null;
    attendanceNote: string;
    productPrice: number;
    webinarType: string;
    remarks: string;
}
export interface MonthWiseRow {
    year: number;
    month: number;
    label: string;
    webinarCount: number;
    totalRegistered: number;
    totalPaid: number;
    convByRegistration: number;
    convBySales: number;
    attendance: number | null;
    spansAttendanceCutover: boolean;
}
export interface QuarterWiseRow {
    year: number;
    quarter: number;
    label: string;
    monthCount: number;
    totalRegistered: number;
    totalPaid: number;
    convByRegistration: number;
    convBySales: number;
    attendance: number | null;
    spansAttendanceCutover: boolean;
}
export interface DataGap {
    date: string;
    label: string;
    reason: string;
}
export interface MomentumAnalyticsReport {
    webinarWise: WebinarWiseRow[];
    monthWise: MonthWiseRow[];
    quarterWise: QuarterWiseRow[];
    currentMonth: MonthWiseRow | null;
    currentQuarter: QuarterWiseRow | null;
    previousQuarter: QuarterWiseRow | null;
    dataGaps: DataGap[];
    generatedAt: string;
}
export declare class WebinarMomentumAnalyticsService {
    private sheetCache;
    private zoomAnalysisSvc;
    private fetchSheet;
    private getLiveAttended;
    getReport(): Promise<MomentumAnalyticsReport>;
}
//# sourceMappingURL=WebinarMomentumAnalyticsService.d.ts.map