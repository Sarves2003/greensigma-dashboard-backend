import { Collection, Filter, UpdateFilter, Document } from 'mongodb';
import { COLLECTIONS } from '../config/database';
export declare abstract class BaseRepository<T extends Document> {
    protected abstract collectionName: keyof typeof COLLECTIONS;
    protected getCollection(): Collection<T>;
    findOne(filter: Filter<T>): Promise<T | null>;
    findMany(filter: Filter<T>, options?: {
        limit?: number;
        skip?: number;
        sort?: Record<string, 1 | -1>;
    }): Promise<T[]>;
    count(filter: Filter<T>): Promise<number>;
    aggregate<R extends Document>(pipeline: Document[]): Promise<R[]>;
    insertOne(document: T): Promise<string>;
    updateOne(filter: Filter<T>, update: UpdateFilter<T>): Promise<number>;
    deleteOne(filter: Filter<T>): Promise<number>;
}
//# sourceMappingURL=BaseRepository.d.ts.map