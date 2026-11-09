import { CollaborationFieldDef, CollaborationFieldType, CollaborationListType, CollaborationRecord, CollaborationStage } from '../types';
export declare class CollaborationService {
    private fieldRepo;
    private recordRepo;
    isValidListType(listType: string): listType is CollaborationListType;
    isValidStage(stage: string): stage is CollaborationStage;
    isValidFieldType(type: string): type is CollaborationFieldType;
    getFields(listType: CollaborationListType): Promise<CollaborationFieldDef[]>;
    createField(listType: CollaborationListType, input: {
        label: string;
        type: CollaborationFieldType;
        options?: string[];
        required?: boolean;
    }): Promise<CollaborationFieldDef>;
    updateField(fieldId: string, update: {
        label?: string;
        options?: string[];
        required?: boolean;
    }): Promise<void>;
    reorderFields(orderedIds: string[]): Promise<void>;
    deleteField(fieldId: string): Promise<void>;
    listRecords(stage: CollaborationStage): Promise<CollaborationRecord[]>;
    createRecord(stage: CollaborationStage, values: Record<string, any>, createdBy?: string): Promise<CollaborationRecord>;
    updateRecordValues(recordId: string, valuesPatch: Record<string, any>, updatedBy?: string): Promise<void>;
    deleteRecord(recordId: string): Promise<void>;
    promoteRecord(recordId: string): Promise<CollaborationRecord | null>;
    demoteRecord(recordId: string): Promise<CollaborationRecord | null>;
}
//# sourceMappingURL=CollaborationService.d.ts.map