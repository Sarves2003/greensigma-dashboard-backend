"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntradayScoreRepository = exports.ETFBacktestRepository = exports.ETFScoreRepository = exports.BacktestRepository = exports.StockScoreRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
class StockScoreRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'STOCK_SCORES';
    }
    async getScoresByUserId(userId) {
        return this.findMany({ userId }, { sort: { savedDate: -1 } });
    }
    async getScoresBetween(startDate, endDate) {
        return this.findMany({
            savedDate: { $gte: startDate, $lt: endDate },
        });
    }
    async countScoresBetween(startDate, endDate, userIds) {
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.count(filter);
    }
    async getUniqueUsersBetween(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return collection.distinct('userId', filter);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
                    },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                },
            },
            {
                $addFields: {
                    uniqueUserCount: { $size: '$uniqueUsers' },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
    async getTopUsers(startDate, endDate, limit = 10) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: '$userId',
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { count: -1 },
            },
            {
                $limit: limit,
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.StockScoreRepository = StockScoreRepository;
class BacktestRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'BACKTEST_RESULTS';
    }
    async getBacktestsByUserId(userId) {
        return this.findMany({ userId }, { sort: { savedDate: -1 } });
    }
    async getBacktestsBetween(startDate, endDate) {
        return this.findMany({
            savedDate: { $gte: startDate, $lt: endDate },
        });
    }
    async countBacktestsByStatus(status, startDate, endDate, userIds) {
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
            status,
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.count(filter);
    }
    async getUniqueUsersBetween(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return collection.distinct('userId', filter);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
                        },
                        status: '$status',
                    },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { '_id.date': 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
    async getTopUsers(startDate, endDate, limit = 10) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: '$userId',
                    count: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Success'] }, 1, 0] },
                    },
                },
            },
            {
                $sort: { count: -1 },
            },
            {
                $limit: limit,
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.BacktestRepository = BacktestRepository;
class ETFScoreRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'ETF_SCORES';
    }
    async getScoresBetween(startDate, endDate) {
        return this.findMany({
            requestedAt: { $gte: startDate, $lt: endDate },
        });
    }
    async countScoresBetween(startDate, endDate, userIds) {
        const filter = {
            requestedAt: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.count(filter);
    }
    async getUniqueUsersBetween(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            requestedAt: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return collection.distinct('userId', filter);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    requestedAt: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$requestedAt' },
                    },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                },
            },
            {
                $addFields: {
                    uniqueUserCount: { $size: '$uniqueUsers' },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.ETFScoreRepository = ETFScoreRepository;
class ETFBacktestRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'ETF_BACKTEST';
    }
    async getBacktestsBetween(startDate, endDate) {
        return this.findMany({
            savedDate: { $gte: startDate, $lt: endDate },
        });
    }
    async countBacktestsByStatus(status, startDate, endDate, userIds) {
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
            status,
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.count(filter);
    }
    async getUniqueUsersBetween(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return collection.distinct('userId', filter);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
                        },
                        status: '$status',
                    },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { '_id.date': 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.ETFBacktestRepository = ETFBacktestRepository;
class IntradayScoreRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'INTRADAY_SCORES';
    }
    async getScoresBetween(startDate, endDate) {
        return this.findMany({
            savedDate: { $gte: startDate, $lt: endDate },
        });
    }
    async countScoresBetween(startDate, endDate, userIds) {
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.count(filter);
    }
    async getUniqueUsersBetween(startDate, endDate, userIds) {
        const collection = this.getCollection();
        const filter = {
            savedDate: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return collection.distinct('userId', filter);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    savedDate: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
                    },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                },
            },
            {
                $addFields: {
                    uniqueUserCount: { $size: '$uniqueUsers' },
                },
            },
            {
                $sort: { _id: 1 },
            },
        ];
        return this.aggregate(pipeline);
    }
}
exports.IntradayScoreRepository = IntradayScoreRepository;
//# sourceMappingURL=ActivityRepository.js.map