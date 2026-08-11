"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
const mongodb_1 = require("mongodb");
class UserRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'USERS';
    }
    async getUserById(userId) {
        return this.findOne({ _id: userId });
    }
    async getUsersByIds(userIds) {
        const objectIds = userIds.filter((id) => mongodb_1.ObjectId.isValid(id)).map((id) => new mongodb_1.ObjectId(id));
        if (objectIds.length === 0)
            return [];
        return this.findMany({ _id: { $in: objectIds } });
    }
    async getUserByEmail(email) {
        return this.findOne({ email });
    }
    async getUserByMobile(mobile) {
        return this.findOne({ mobile });
    }
    async getUserByWhatsApp(whatsappNumber) {
        return this.findOne({ whatsappNumber });
    }
    async getUsersByType(type) {
        return this.findMany({ type });
    }
    async getUsersByState(state) {
        return this.findMany({ state });
    }
    async getUsersByDistrict(district) {
        return this.findMany({ district });
    }
    async getUsersByReferralCode(referalCode) {
        return this.findMany({ referalCode });
    }
    async getUsersCreatedBetween(startDate, endDate) {
        return this.findMany({
            createdOn: { $gte: startDate, $lt: endDate },
        });
    }
    async countUsersByType(type) {
        return this.count({ type });
    }
    async countTotalUsers() {
        return this.count({});
    }
    async getDistinctStates() {
        const collection = this.getCollection();
        const states = await collection.distinct('state', {});
        return states.filter((s) => typeof s === 'string' && s !== null);
    }
    async getDistinctDistricts() {
        const collection = this.getCollection();
        const districts = await collection.distinct('district', {});
        return districts.filter((d) => typeof d === 'string' && d !== null);
    }
    async getDistinctReferralCodes() {
        const collection = this.getCollection();
        const codes = await collection.distinct('referalCode', {});
        return codes.filter((c) => typeof c === 'string' && c !== null);
    }
    async searchUsers(query) {
        const searchFilter = {
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } },
                { mobile: { $regex: query, $options: 'i' } },
                { whatsappNumber: { $regex: query, $options: 'i' } },
            ],
        };
        return this.findMany(searchFilter, { limit: 20 });
    }
    async getUsersWithPagination(filter, page, pageSize) {
        const skip = (page - 1) * pageSize;
        const users = await this.findMany(filter, { skip, limit: pageSize, sort: { createdOn: -1 } });
        const total = await this.count(filter);
        return { users, total };
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=UserRepository.js.map