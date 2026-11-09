import { BaseRepository } from './BaseRepository';
import { CollaborationFieldDef, CollaborationListType } from '../types';
import { ObjectId } from 'mongodb';

export class CollaborationFieldRepository extends BaseRepository<CollaborationFieldDef> {
  protected collectionName = 'COLLABORATION_FIELDS' as const;

  async listByType(listType: CollaborationListType): Promise<CollaborationFieldDef[]> {
    return this.findMany({ listType } as any, { sort: { order: 1 } });
  }

  async getById(id: string): Promise<CollaborationFieldDef | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.findOne({ _id: new ObjectId(id) } as any);
  }

  async insertMany(fields: CollaborationFieldDef[]): Promise<void> {
    if (fields.length === 0) return;
    const collection = this.getCollection();
    await collection.insertMany(fields as any);
  }

  async updateById(id: string, update: Partial<CollaborationFieldDef>): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.updateOne({ _id: new ObjectId(id) } as any, { $set: update } as any);
  }

  async deleteById(id: string): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.deleteOne({ _id: new ObjectId(id) } as any);
  }
}
