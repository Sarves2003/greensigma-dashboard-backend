import { BaseRepository } from './BaseRepository';
import { CollaborationFieldDef, CollaborationListType } from '../types';
export declare class CollaborationFieldRepository extends BaseRepository<CollaborationFieldDef> {
    protected collectionName: "COLLABORATION_FIELDS";
    listByType(listType: CollaborationListType): Promise<CollaborationFieldDef[]>;
    getById(id: string): Promise<CollaborationFieldDef | null>;
    insertMany(fields: CollaborationFieldDef[]): Promise<void>;
    updateById(id: string, update: Partial<CollaborationFieldDef>): Promise<number>;
    deleteById(id: string): Promise<number>;
}
//# sourceMappingURL=CollaborationFieldRepository.d.ts.map