"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const database_1 = require("../config/database");
class BaseRepository {
    getCollection() {
        const db = (0, database_1.getDatabase)();
        const colName = database_1.COLLECTIONS[this.collectionName];
        return db.collection(colName);
    }
    async findOne(filter) {
        const collection = this.getCollection();
        const result = await collection.findOne(filter);
        return result;
    }
    async findMany(filter, options) {
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
        return results;
    }
    async count(filter) {
        const collection = this.getCollection();
        return collection.countDocuments(filter);
    }
    async aggregate(pipeline) {
        const collection = this.getCollection();
        const results = await collection.aggregate(pipeline).toArray();
        return results;
    }
    async insertOne(document) {
        const collection = this.getCollection();
        const result = await collection.insertOne(document);
        return result.insertedId.toString();
    }
    async updateOne(filter, update) {
        const collection = this.getCollection();
        const result = await collection.updateOne(filter, update);
        return result.modifiedCount;
    }
    async deleteOne(filter) {
        const collection = this.getCollection();
        const result = await collection.deleteOne(filter);
        return result.deletedCount;
    }
}
exports.BaseRepository = BaseRepository;
//# sourceMappingURL=BaseRepository.js.map