"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginLogRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
const mongodb_1 = require("mongodb");
class LoginLogRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'LOGIN_LOGS';
    }
    async getLoginsByUserId(userId) {
        return this.findMany({ userId }, { sort: { loginTime: -1 } });
    }
    async getLoginsBetween(startDate, endDate) {
        return this.findMany({
            loginTime: { $gte: startDate, $lt: endDate },
        });
    }
    async getSuccessfulLogins(startDate, endDate) {
        return this.findMany({
            loginTime: { $gte: startDate, $lt: endDate },
            status: 'SUCCESS',
        });
    }
    async getFailedLogins(startDate, endDate) {
        return this.findMany({
            loginTime: { $gte: startDate, $lt: endDate },
            status: 'FAILURE',
        });
    }
    async countSuccessfulLogins(startDate, endDate, userIds) {
        const filter = {
            loginTime: { $gte: startDate, $lt: endDate },
            status: 'SUCCESS',
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds.map(id => new mongodb_1.ObjectId(id)) };
        }
        return this.count(filter);
    }
    async countFailedLogins(startDate, endDate, userIds) {
        const filter = {
            loginTime: { $gte: startDate, $lt: endDate },
            status: 'FAILURE',
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds.map(id => new mongodb_1.ObjectId(id)) };
        }
        return this.count(filter);
    }
    async getUniqueLoginUsers(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            loginTime: { $gte: startDate, $lt: endDate },
            status: 'SUCCESS',
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds.map(id => new mongodb_1.ObjectId(id)) };
        }
        return collection.distinct('userId', filter);
    }
    async getLoginsByChannel(channel, startDate, endDate) {
        return this.findMany({
            loginTime: { $gte: startDate, $lt: endDate },
            channel,
        });
    }
    async getLastLoginByUser(userId) {
        return this.findOne({
            userId,
            status: 'SUCCESS',
        });
    }
    async getLoginTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    loginTime: { $gte: startDate, $lt: endDate },
                    status: 'SUCCESS',
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$loginTime' },
                    },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
    async getHourlyLoginTrend(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    loginTime: { $gte: startDate, $lt: endDate },
                    status: 'SUCCESS',
                },
            },
            {
                $group: {
                    _id: { $hour: '$loginTime' },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.LoginLogRepository = LoginLogRepository;
//# sourceMappingURL=LoginLogRepository.js.map