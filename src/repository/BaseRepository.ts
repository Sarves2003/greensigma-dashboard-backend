import { Collection, Filter, UpdateFilter, Document } from 'mongodb';
import { getDatabase, COLLECTIONS } from '../config/database';

export abstract class BaseRepository<T extends Document> {
  protected abstract collectionName: keyof typeof COLLECTIONS;

  protected getCollection(): Collection<T> {
    const db = getDatabase();
    const colName = COLLECTIONS[this.collectionName];
    return db.collection<T>(colName);
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    const collection = this.getCollection();
    const result = await collection.findOne(filter);
    return result as T | null;
  }

  async findMany(filter: Filter<T>, options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> }): Promise<T[]> {
    const collection = this.getCollection();
    let query = collection.find(filter);

    if (options?.sort) {
      query = query.sort(options.sort);
    }
    if (options?.skip) {
      query = query.skip(options.skip);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const results = await query.toArray();
    return results as T[];
  }

  async count(filter: Filter<T>): Promise<number> {
    const collection = this.getCollection();
    return collection.countDocuments(filter);
  }

  async aggregate<R extends Document>(pipeline: Document[]): Promise<R[]> {
    const collection = this.getCollection();
    const results = await collection.aggregate<R>(pipeline).toArray();
    return results as R[];
  }

  async insertOne(document: T): Promise<string> {
    const collection = this.getCollection();
    const result = await collection.insertOne(document as any);
    return result.insertedId.toString();
  }

  async updateOne(filter: Filter<T>, update: UpdateFilter<T>): Promise<number> {
    const collection = this.getCollection();
    const result = await collection.updateOne(filter, update);
    return result.modifiedCount;
  }

  async deleteOne(filter: Filter<T>): Promise<number> {
    const collection = this.getCollection();
    const result = await collection.deleteOne(filter);
    return result.deletedCount;
  }
}
