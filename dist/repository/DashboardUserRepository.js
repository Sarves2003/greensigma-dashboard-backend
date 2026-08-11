"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardUserRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
const mongodb_1 = require("mongodb");
class DashboardUserRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'DASHBOARD_USERS';
    }
    async getByEmail(email) {
        return this.findOne({ email });
    }
    async getById(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return null;
        return this.findOne({ _id: new mongodb_1.ObjectId(id) });
    }
    async listAll() {
        return this.findMany({}, { sort: { createdAt: -1 } });
    }
    async createUser(user) {
        return this.insertOne(user);
    }
    async updateUser(id, update) {
        if (!mongodb_1.ObjectId.isValid(id))
            return 0;
        return this.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: update });
    }
    async deleteUser(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return 0;
        return this.deleteOne({ _id: new mongodb_1.ObjectId(id) });
    }
    async touchLastLogin(id) {
        if (!mongodb_1.ObjectId.isValid(id))
            return;
        await this.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { lastLoginAt: new Date() } });
    }
    async countAll() {
        return this.count({});
    }
}
exports.DashboardUserRepository = DashboardUserRepository;
//# sourceMappingURL=DashboardUserRepository.js.map