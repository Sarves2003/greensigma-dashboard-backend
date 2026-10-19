export interface WebinarRegSummaryRow {
    id: string;
    webinarType: string;
    webinarDate: string;
    webinarDateISO: string;
    webinarTime: string;
    label: string;
    totalDocs: number;
}
export type PersonStatus = 'success' | 'failed' | 'notpaid';
export type RegCategory = PersonStatus | 'all';
export interface RegistrationPersonRow {
    key: string;
    name: string;
    phone: string;
    email: string | null;
    source: string | null;
    attempts: number;
    amount: number | null;
    paymentMethod: string | null;
    welcomeMessageSent: boolean;
    status: PersonStatus;
    firstAttemptAt: string;
    paidAt: string | null;
}
export interface WebinarRegSummary {
    totalRegistered: number;
    failed: number;
    notPaid: number;
    amountCollected: number;
    welcomeMessageSent: number;
    totalAttempts: number;
    totalDistinctPeople: number;
}
export interface PagedResult<T> {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
}
type SortDir = 'asc' | 'desc';
export declare class WebinarRegistrationsService {
    listWebinars(): Promise<WebinarRegSummaryRow[]>;
    private titleCase;
    private loadDocs;
    private buildPersonRows;
    getSummary(occurrenceId: string): Promise<WebinarRegSummary>;
    private matchesSearch;
    private filteredRows;
    getTable(occurrenceId: string, category: RegCategory, page: number, pageSize: number, sortBy?: string, sortDir?: SortDir, search?: string): Promise<PagedResult<RegistrationPersonRow>>;
    private csvFieldEscape;
    private buildRawCsv;
    private buildAisensyCsv;
    downloadCsv(occurrenceId: string, category: RegCategory, sortBy?: string, sortDir?: SortDir, search?: string, format?: 'raw' | 'aisensy', tag?: string): Promise<string>;
}
export {};
//# sourceMappingURL=WebinarRegistrationsService.d.ts.map