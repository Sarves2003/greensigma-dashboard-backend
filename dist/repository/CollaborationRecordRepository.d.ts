import { BaseRepository } from './BaseRepository';
import { CollaborationRecord, CollaborationStage } from '../types';
export declare class CollaborationRecordRepository extends BaseRepository<CollaborationRecord> {
    protected collectionName: "COLLABORATION_RECORDS";
    listByStage(stage: CollaborationStage): Promise<CollaborationRecord[]>;
    getById(id: string): Promise<CollaborationRecord | null>;
    updateById(id: string, update: Record<string, any>): Promise<number>;
    deleteById(id: string): Promise<number>;
}
//# sourceMappingURL=CollaborationRecordRepository.d.ts.map