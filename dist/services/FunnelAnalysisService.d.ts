import { ObjectId } from 'mongodb';
interface BatchDateDoc {
    _id: ObjectId;
    date: Date;
    label: string;
}
export interface BatchResolution {
    batch: Date | null;
    method: 'exact' | 'year-typo-fix' | 'nearest-day-fuzzy' | 'unresolved' | 'unparseable';
}
export declare class FunnelAnalysisService {
    private registrationCache;
    private paidCache;
    getBatchDates(): Promise<BatchDateDoc[]>;
    addBatchDate(dateStr: string): Promise<void>;
    removeBatchDate(id: string): Promise<void>;
    private getSortedMasterDates;
    resolveBatch(rawDate: string, masterDates: Date[]): BatchResolution;
    private fetchRegistrations;
    private fetchPaidList;
    private buildWebinarYearLookup;
    private computeFunnelTag;
    private getTaggedUsers;
    getSegment1(startDate: Date, endDate: Date): Promise<any>;
    getSegment2(): Promise<any>;
    getSegment3(): Promise<any>;
    getWebinarBatchDetail(requestedKeys?: string[]): Promise<any[]>;
}
export {};
//# sourceMappingURL=FunnelAnalysisService.d.ts.map