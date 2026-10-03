export interface CountPct {
    count: number;
    pct: number;
}
export interface AgentCallStats {
    agent: string;
    total: number;
    rnr: number;
    picked: number;
    booked: number;
    notQualified: number;
    pickedPctOfTotal: number;
    bookedPctOfPicked: number;
    bookedPctOfTotal: number;
    totalDurationSec: number;
    avgDurationPerPickedCallSec: number | null;
}
export interface CallsOverview {
    kpis: {
        totalCalls: number;
        picked: CountPct;
        rnr: CountPct;
        notQualified: CountPct;
        avgCallDurationSec: number | null;
        maxCallDurationSec: number | null;
        totalCallDurationSec: number;
        avgFollowupsPerIndividual: number | null;
    };
    byAgent: AgentCallStats[];
    team: AgentCallStats;
    outcomeMatrix: {
        outcome: string;
        byAgent: Record<string, number>;
    }[];
}
export interface AgentLeadStats {
    agent: string;
    total: number;
    rnr: number;
    picked: number;
    booked: number;
    notQualified: number;
    pickedPctOfTotal: number;
    bookedPctOfPicked: number;
    bookedPctOfTotal: number;
    notQualifiedPctOfTotal: number;
}
export interface LeadsOverview {
    kpis: {
        totalLeadsCalled: number;
        picked: CountPct;
        rnr: CountPct;
        booked: CountPct;
        notQualified: CountPct;
        avgLeadsPerDay: number | null;
        maxLeadsReachedInADay: number | null;
    };
    byAgent: AgentLeadStats[];
    team: AgentLeadStats;
    outcomeMatrix: {
        outcome: string;
        byAgent: Record<string, number>;
    }[];
}
export interface FilterOptions {
    agents: string[];
    leadSources: string[];
}
export interface CallRecord {
    id: string;
    dateTime: string;
    agent: string;
    leadId: string | null;
    leadName: string | null;
    number: string | null;
    disposition: string | null;
    subDisposition: string | null;
    durationSec: number;
    recordingUrl: string | null;
}
export interface LeadRecord {
    leadId: string;
    name: string | null;
    number: string | null;
    agent: string;
    disposition: string | null;
    subDisposition: string | null;
    followUpDateTime: string | null;
    callsInPeriod: number;
    lastCallDateTime: string | null;
}
export interface LeadHistoryEntry {
    id: string;
    dateTime: string;
    agent: string;
    disposition: string | null;
    subDisposition: string | null;
    durationSec: number;
    recordingUrl: string | null;
}
export interface PagedResult<T> {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare class ZohoCrmService {
    private cachedToken;
    private filterCache;
    private get accountsDomain();
    private get apiDomain();
    private getAccessToken;
    private coqlQuery;
    private ymd;
    private agentLabel;
    private fetchCallsRaw;
    private fetchLeadSources;
    private fetchLeadDetails;
    getFilterOptions(): Promise<FilterOptions>;
    private getFilteredCalls;
    private countPct;
    getCallsOverview(startDate: Date, endDate: Date, agents?: string[], leadSource?: string): Promise<CallsOverview>;
    getLeadsOverview(startDate: Date, endDate: Date, agents?: string[], leadSource?: string): Promise<LeadsOverview>;
    getCallRecords(startDate: Date, endDate: Date, agents: string[] | undefined, leadSource: string | undefined, page: number, pageSize: number): Promise<PagedResult<CallRecord>>;
    getLeadRecords(startDate: Date, endDate: Date, agents: string[] | undefined, leadSource: string | undefined, page: number, pageSize: number): Promise<PagedResult<LeadRecord>>;
    getLeadHistory(leadId: string): Promise<LeadHistoryEntry[]>;
}
//# sourceMappingURL=ZohoCrmService.d.ts.map