"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationFieldRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
const mongodb_1 = require("mongodb");
class CollaborationFieldRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'COLLABORATION_FIELDS';
    }
    async listByType(listType) {
        return this.findMany({ listType }, { sort: { order: 1 } });
    }
    async getById(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return null;
        return this.findOne({ _id: new mongodb_1.ObjectId(id) });
    }
    async insertMany(fields) {
        if (fields.length === 0)
            return;
        const collection = this.getCollection();
        await collection.insertMany(fields);
    }
    async updateById(id, update) {
        if (!mongodb_1.ObjectId.isValid(id))
            return 0;
        return this.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: update });
    }
    async deleteById(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return 0;
        return this.deleteOne({ _id: new mongodb_1.ObjectId(id) });
    }
}
exports.CollaborationFieldRepository = CollaborationFieldRepository;
//# sourceMappingURL=CollaborationFieldRepository.js.map