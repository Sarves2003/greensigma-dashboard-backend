type SortDir = 'asc' | 'desc';
export interface CountPct {
    count: number;
    pct: number;
}
export interface WebinarSummary {
    id: string;
    title: string;
    webinarDate: string;
    batchLabel: string;
    uploadedAt: string;
    attendeeCount: number;
}
export interface SegmentReport {
    totalRegistered: number;
    attended: CountPct;
    totalChats: number;
    avgAttendedDurationMin: number | null;
    avgRejoinsAttended: number | null;
    peakConcurrent: {
        count: number;
        atTime: string | null;
    };
    stayedTillMiddle: CountPct;
    stayedTillEnd2hr: CountPct | null;
    stayedTill150Min: CountPct | null;
    stayedTill180Min: CountPct | null;
    conversions: {
        count: number;
        avgAttendedMin: number | null;
    };
    reRegisteredToday: CountPct | null;
}
export interface WebinarReport {
    webinar: {
        id: string;
        title: string;
        webinarDate: string;
        batchLabel: string;
        sessionStart: string;
        sessionEnd: string;
        totalDurationMin: number;
    };
    attendedThresholdMin: number;
    cards: {
        totalRegistered: number;
        segments: {
            current: SegmentReport;
            previousNotPaid: SegmentReport;
            alreadyPaid: SegmentReport;
            organic: SegmentReport;
        };
    };
    registrationDataAvailable: boolean;
    funnelPaidTotal: number | null;
}
export interface MainRow {
    email: string;
    name: string;
    number: string;
    registeredBatches: string | null;
    paid5k: boolean;
    paidOnBatch: string | null;
    totalMin: number;
    rejoins: number;
    chatCount: number;
    signedUp: boolean;
}
export interface NotJoinedRow {
    email: string;
    name: string;
    number: string;
    registeredBatches: string | null;
    paid5k: boolean;
    paidOnBatch: string | null;
    signedUp: boolean;
}
export interface NotRegisteredRow {
    email: string;
    name: string;
    number: string;
    signedUp: boolean;
    signedUpBeforeSession: boolean;
}
export interface KeywordRow {
    email: string;
    name: string;
    number: string;
    timeIso: string;
    msg: string;
}
export interface ChatPersonRow {
    email: string;
    name: string;
    number: string;
    signedUp: boolean;
    chatCount: number;
}
export interface AttendeeDetail {
    email: string;
    name: string;
    number: string;
    signedUp: boolean;
    previouslyPaid: boolean;
    previouslyPaidOn: string | null;
    paid5k: boolean;
    paidOnBatch: string | null;
    registeredBatches: string | null;
    totalMin: number;
    sessions: {
        joinTime: string;
        leaveTime: string;
        durationMin: number;
    }[];
    chat: {
        wallClock: string | null;
        msg: string;
    }[];
}
export interface PagedResult<T> {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare class WebinarAnalysisService {
    private registrationCache;
    private paidCache;
    private funnelSvc;
    uploadWebinar(participantsCsv: Buffer, chatTxt: Buffer): Promise<WebinarSummary>;
    private parseParticipantsCsv;
    private attachChat;
    listWebinars(): Promise<WebinarSummary[]>;
    private fetchRegistrations;
    private fetchPaidSheet;
    private loadBatch;
    private enrich;
    private computeSegmentMetrics;
    getReport(batchId: string, attendedThresholdMin: number): Promise<WebinarReport>;
    private static readonly MAIN_SORT_FIELDS;
    private static readonly NOT_JOINED_SORT_FIELDS;
    private static readonly NOT_REGISTERED_SORT_FIELDS;
    private static readonly KEYWORD_SORT_FIELDS;
    getChatPeople(batchId: string): Promise<ChatPersonRow[]>;
    getBatchOptions(batchId: string): Promise<string[]>;
    private matchesBatchFilter;
    private matchesSearch;
    private mainRows;
    getMainTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir, batchFilter?: string[], search?: string): Promise<PagedResult<MainRow>>;
    private csvFieldEscape;
    private buildAisensyCsv;
    downloadMainCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir?: SortDir, batchFilter?: string[], search?: string, format?: 'raw' | 'aisensy', tag?: string): Promise<string>;
    private notJoinedRows;
    getNotJoinedTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir, batchFilter?: string[], search?: string): Promise<PagedResult<NotJoinedRow>>;
    downloadNotJoinedCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir?: SortDir, batchFilter?: string[], search?: string, format?: 'raw' | 'aisensy', tag?: string): Promise<string>;
    private notRegisteredRows;
    getNotRegisteredTable(batchId: string, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir, search?: string): Promise<PagedResult<NotRegisteredRow> & {
        registrationDataAvailable: boolean;
    }>;
    downloadNotRegisteredCsv(batchId: string, sortBy?: string, sortDir?: SortDir, search?: string, format?: 'raw' | 'aisensy', tag?: string): Promise<string>;
    private keywordRows;
    getKeywordMatches(batchId: string, keyword: string, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir): Promise<PagedResult<KeywordRow>>;
    downloadKeywordCsv(batchId: string, keyword: string, sortBy?: string, sortDir?: SortDir, format?: 'raw' | 'aisensy', tag?: string): Promise<string>;
    getAttendeeDetail(batchId: string, email: string): Promise<AttendeeDetail>;
    private paginate;
}
export {};
//# sourceMappingURL=WebinarAnalysisService.d.ts.map