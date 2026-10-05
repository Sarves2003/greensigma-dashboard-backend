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
        registeredViaFunnel: CountPct;
        fromPreviousWebinar: CountPct;
        previouslyPaid: CountPct;
        organic: CountPct;
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
    };
    registrationDataAvailable: boolean;
}
export interface MainRow {
    email: string;
    name: string;
    number: string;
    batchLabel: string;
    paid5k: boolean;
    totalMin: number;
    rejoins: number;
    chatCount: number;
    signedUp: boolean;
}
export interface NotJoinedRow {
    email: string;
    name: string;
    number: string;
    batchLabel: string;
    paid5k: boolean;
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
}
export interface AttendeeDetail {
    email: string;
    name: string;
    number: string;
    signedUp: boolean;
    previouslyPaid: boolean;
    previouslyPaidOn: string | null;
    paid5k: boolean;
    paidEvidence: {
        msg: string;
        wallClock: string | null;
    } | null;
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
    uploadWebinar(participantsCsv: Buffer, chatTxt: Buffer): Promise<WebinarSummary>;
    private parseParticipantsCsv;
    private attachChat;
    listWebinars(): Promise<WebinarSummary[]>;
    private fetchRegistrations;
    private fetchPaidSheet;
    private loadBatch;
    private enrich;
    private findPaidEvidence;
    getReport(batchId: string, attendedThresholdMin: number): Promise<WebinarReport>;
    private static readonly MAIN_SORT_FIELDS;
    private static readonly NOT_JOINED_SORT_FIELDS;
    private static readonly NOT_REGISTERED_SORT_FIELDS;
    private static readonly KEYWORD_SORT_FIELDS;
    private mainRows;
    getMainTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir): Promise<PagedResult<MainRow>>;
    downloadMainCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir?: SortDir): Promise<string>;
    private notJoinedRows;
    getNotJoinedTable(batchId: string, attendedThresholdMin: number, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir): Promise<PagedResult<NotJoinedRow>>;
    downloadNotJoinedCsv(batchId: string, attendedThresholdMin: number, sortBy?: string, sortDir?: SortDir): Promise<string>;
    private notRegisteredRows;
    getNotRegisteredTable(batchId: string, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir): Promise<PagedResult<NotRegisteredRow> & {
        registrationDataAvailable: boolean;
    }>;
    downloadNotRegisteredCsv(batchId: string, sortBy?: string, sortDir?: SortDir): Promise<string>;
    private keywordRows;
    getKeywordMatches(batchId: string, keyword: string, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir): Promise<PagedResult<KeywordRow>>;
    downloadKeywordCsv(batchId: string, keyword: string, sortBy?: string, sortDir?: SortDir): Promise<string>;
    getAttendeeDetail(batchId: string, email: string): Promise<AttendeeDetail>;
    private paginate;
}
export {};
//# sourceMappingURL=WebinarAnalysisService.d.ts.map