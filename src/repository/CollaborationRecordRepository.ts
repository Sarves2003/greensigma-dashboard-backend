import { BaseRepository } from './BaseRepository';
import { CollaborationRecord, CollaborationStage } from '../types';
import { ObjectId } from 'mongodb';

export class CollaborationRecordRepository extends BaseRepository<CollaborationRecord> {
  protected collectionName = 'COLLABORATION_RECORDS' as const;

  async listByStage(stage: CollaborationStage): Promise<CollaborationRecord[]> {
    return this.findMany({ stage } as any, { sort: { createdAt: 1 } });
  }

  async getById(id: string): Promise<CollaborationRecord | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.findOne({ _id: new ObjectId(id) } as any);
  }

  async updateById(id: string, update: Record<string, any>): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.updateOne({ _id: new ObjectId(id) } as any, { $set: update } as any);
  }

  async deleteById(id: string): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.deleteOne({ _id: new ObjectId(id) } as any);
  }
}
