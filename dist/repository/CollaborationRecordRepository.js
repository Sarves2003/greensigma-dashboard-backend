"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationRecordRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
const mongodb_1 = require("mongodb");
class CollaborationRecordRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'COLLABORATION_RECORDS';
    }
    async listByStage(stage) {
        return this.findMany({ stage }, { sort: { createdAt: 1 } });
    }
    async getById(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return null;
        return this.findOne({ _id: new mongodb_1.ObjectId(id) });
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
exports.CollaborationRecordRepository = CollaborationRecordRepository;
//# sourceMappingURL=CollaborationRecordRepository.js.map