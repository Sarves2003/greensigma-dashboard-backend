"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioRepository = exports.BrokerRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
class BrokerRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'BROKER_DETAILS';
    }
    async getBrokerByUserId(userId) {
        return this.findOne({ userId });
    }
    async getBrokersByType(brokerType) {
        return this.findMany({ borkrageType: brokerType });
    }
    async countBrokersByType(brokerType) {
        return this.count({ borkrageType: brokerType });
    }
    async getConnectedUsersBetween(startDate, endDate, userIds) {
        const filter = {
            createdAt: { $gte: startDate, $lt: endDate },
        };
        if (userIds && userIds.length > 0) {
            filter.userId = { $in: userIds };
        }
        return this.findMany(filter);
    }
    async getRealBrokers() {
        return this.findMany({
            borkrageType: { $in: ['kite', 'zebu'] },
            apiKey: { $exists: true },
        });
    }
    async getPaperTradingUsers() {
        return this.findMany({ borkrageType: 'paper_trade' });
    }
    async getLatestAuthorizationsBetween(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    accessTokenIssuedAt: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $sort: { accessTokenIssuedAt: -1 },
            },
        ];
        return this.aggregate(pipeline);
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    createdAt: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                        },
                        type: '$borkrageType',
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
exports.BrokerRepository = BrokerRepository;
class PortfolioRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'PORTFOLIO';
    }
    async getPortfolioByUserId(userId) {
        return this.findOne({ userId });
    }
    async getPortfoliosBetween(startDate, endDate) {
        return this.findMany({
            createdAt: { $gte: startDate, $lt: endDate },
        });
    }
    async countPortfoliosByStatus(isInvested, startDate, endDate) {
        return this.count({
            createdAt: { $gte: startDate, $lt: endDate },
            isInvested,
        });
    }
    async countAutomatedPortfolios(startDate, endDate) {
        return this.count({
            createdAt: { $gte: startDate, $lt: endDate },
            fromBacktest: true,
        });
    }
    async countManualPortfolios(startDate, endDate) {
        return this.count({
            createdAt: { $gte: startDate, $lt: endDate },
            $or: [{ fromBacktest: { $exists: false } }, { fromBacktest: false }],
        });
    }
    async getLiveRealPortfolios() {
        return this.findMany({
            isInvested: true,
            borkrageType: { $in: ['kite', 'zebu'] },
        });
    }
    async getLiveRealPortfoliosWithHoldings() {
        return this.findMany({
            isInvested: true,
            borkrageType: { $in: ['kite', 'zebu'] },
            stockDetails: { $exists: true, $ne: [], $type: 'array' },
        });
    }
    async getPaperPortfolios() {
        return this.findMany({
            borkrageType: 'paper_trade',
        });
    }
    async getTotalInvestmentCapital(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    createdAt: { $gte: startDate, $lt: endDate },
                    investmentCapital: { $exists: true, $ne: null },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$investmentCapital' },
                },
            },
        ];
        const result = await this.aggregate(pipeline);
        return result[0]?.total || 0;
    }
    async getTrendData(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    createdAt: { $gte: startDate, $lt: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                        },
                        status: { $cond: ['$isInvested', 'Live', 'Draft'] },
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
    async getAverageInvestmentCapital(startDate, endDate) {
        const pipeline = [
            {
                $match: {
                    createdAt: { $gte: startDate, $lt: endDate },
                    investmentCapital: { $exists: true, $ne: null },
                },
            },
            {
                $group: {
                    _id: null,
                    average: { $avg: '$investmentCapital' },
                },
            },
        ];
        const result = await this.aggregate(pipeline);
        return result[0]?.average || 0;
    }
}
exports.PortfolioRepository = PortfolioRepository;
//# sourceMappingURL=BrokerRepository.js.map