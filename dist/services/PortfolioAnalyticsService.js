"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioAnalyticsService = void 0;
const BrokerRepository_1 = require("../repository/BrokerRepository");
const UserRepository_1 = require("../repository/UserRepository");
const database_1 = require("../config/database");
const mongodb_1 = require("mongodb");
class PortfolioAnalyticsService {
    constructor() {
        this.portfolioRepo = new BrokerRepository_1.PortfolioRepository();
        this.userRepo = new UserRepository_1.UserRepository();
    }
    // Get portfolio metrics
    async getPortfolioMetrics(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const brokerTypes = filters.brokerTypes || ['kite', 'zebu', 'paper_trade'];
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            borkrageType: { $in: brokerTypes },
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const portfolios = await this.portfolioRepo.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalCreated: { $sum: 1 },
                    draftCount: {
                        $sum: { $cond: ['$isInvested', 0, 1] },
                    },
                    liveCount: {
                        $sum: { $cond: ['$isInvested', 1, 0] },
                    },
                    manualCount: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [{ $eq: ['$fromBacktest', false] }, { $eq: ['$fromBacktest', null] }],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    automatedCount: {
                        $sum: { $cond: ['$fromBacktest', 1, 0] },
                    },
                    realPortfolioCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $in: ['$borkrageType', ['kite', 'zebu']] },
                                        '$isInvested',
                                        { $gt: [{ $size: { $ifNull: ['$stockDetails', []] } }, 0] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    realPortfolioUsers: {
                        $addToSet: {
                            $cond: [
                                {
                                    $and: [
                                        { $in: ['$borkrageType', ['kite', 'zebu']] },
                                        '$isInvested',
                                        { $gt: [{ $size: { $ifNull: ['$stockDetails', []] } }, 0] },
                                    ],
                                },
                                '$userId',
                                null,
                            ],
                        },
                    },
                    paperPortfolioCount: {
                        $sum: { $cond: [{ $eq: ['$borkrageType', 'paper_trade'] }, 1, 0] },
                    },
                    paperPortfolioUsers: {
                        $addToSet: {
                            $cond: [{ $eq: ['$borkrageType', 'paper_trade'] }, '$userId', null],
                        },
                    },
                    realMoneyCapital: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $in: ['$borkrageType', ['kite', 'zebu']] },
                                        '$isInvested',
                                    ],
                                },
                                { $ifNull: ['$investmentCapital', 0] },
                                0,
                            ],
                        },
                    },
                    paperMoneyCapital: {
                        $sum: {
                            $cond: [
                                { $eq: ['$borkrageType', 'paper_trade'] },
                                { $ifNull: ['$investmentCapital', 0] },
                                0,
                            ],
                        },
                    },
                    totalInvestmentCapital: {
                        $sum: { $ifNull: ['$investmentCapital', 0] },
                    },
                },
            },
        ]);
        if (portfolios.length === 0) {
            return {
                totalCreated: 0,
                draft: 0,
                live: 0,
                manual: 0,
                automated: 0,
                realPortfolio: '0(0)',
                paperPortfolio: '0(0)',
                realCapital: 0,
                paperCapital: 0,
                investmentCapital: 0,
                estimatedAUM: 0,
            };
        }
        const data = portfolios[0];
        const realUserCount = (data.realPortfolioUsers || []).filter((u) => u !== null).length;
        const paperUserCount = (data.paperPortfolioUsers || []).filter((u) => u !== null).length;
        return {
            totalCreated: data.totalCreated || 0,
            draft: data.draftCount || 0,
            live: data.liveCount || 0,
            manual: data.manualCount || 0,
            automated: data.automatedCount || 0,
            realPortfolio: `${data.realPortfolioCount || 0}(${realUserCount})`,
            paperPortfolio: `${data.paperPortfolioCount || 0}(${paperUserCount})`,
            realCapital: parseFloat((data.realMoneyCapital || 0).toFixed(2)),
            paperCapital: parseFloat((data.paperMoneyCapital || 0).toFixed(2)),
            investmentCapital: parseFloat((data.totalInvestmentCapital || 0).toFixed(2)),
            estimatedAUM: parseFloat((data.totalInvestmentCapital || 0).toFixed(2)),
        };
    }
    // Get portfolio AUM trend over time (by broker type)
    async getPortfolioTrend(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const brokerTypes = filters.brokerTypes || ['kite', 'zebu'];
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            isInvested: true,
            borkrageType: { $in: brokerTypes },
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const trend = await this.portfolioRepo.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        brokerType: '$borkrageType',
                    },
                    dailyAUM: { $sum: { $ifNull: ['$investmentCapital', 0] } },
                    portfolioCount: { $sum: 1 },
                },
            },
            { $sort: { '_id.date': 1, '_id.brokerType': 1 } },
        ]);
        const trendByDate = {};
        trend.forEach(item => {
            const date = item._id.date;
            const brokerType = item._id.brokerType;
            if (!trendByDate[date]) {
                trendByDate[date] = { date, kiteAUM: 0, zebuAUM: 0, paperTradeAUM: 0 };
            }
            if (brokerType === 'kite') {
                trendByDate[date].kiteAUM = item.dailyAUM;
            }
            else if (brokerType === 'zebu') {
                trendByDate[date].zebuAUM = item.dailyAUM;
            }
            else if (brokerType === 'paper_trade') {
                trendByDate[date].paperTradeAUM = item.dailyAUM;
            }
        });
        let cumulativeKite = 0, cumulativeZebu = 0, cumulativePaperTrade = 0;
        return Object.keys(trendByDate).sort().map(date => {
            const item = trendByDate[date];
            cumulativeKite += item.kiteAUM;
            cumulativeZebu += item.zebuAUM;
            cumulativePaperTrade += item.paperTradeAUM;
            return {
                date,
                kiteAUM: parseFloat(cumulativeKite.toFixed(2)),
                zebuAUM: parseFloat(cumulativeZebu.toFixed(2)),
                paperTradeAUM: parseFloat(cumulativePaperTrade.toFixed(2)),
            };
        });
    }
    // Get capital distribution histogram
    async getPortfolioTypeBreakdown(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const brokerTypes = filters.brokerTypes || ['kite', 'zebu', 'paper_trade'];
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            borkrageType: { $in: brokerTypes },
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const portfolios = await this.portfolioRepo.findMany(matchStage);
        const bins = {
            '50k-1L': { min: 50000, max: 100000, count: 0 },
            '1L-2L': { min: 100000, max: 200000, count: 0 },
            '2L-5L': { min: 200000, max: 500000, count: 0 },
            '5L+': { min: 500000, max: Infinity, count: 0 },
        };
        portfolios.forEach((portfolio) => {
            const capital = portfolio.investmentCapital || 0;
            if (capital >= 50000 && capital < 100000) {
                bins['50k-1L'].count++;
            }
            else if (capital >= 100000 && capital < 200000) {
                bins['1L-2L'].count++;
            }
            else if (capital >= 200000 && capital < 500000) {
                bins['2L-5L'].count++;
            }
            else if (capital >= 500000) {
                bins['5L+'].count++;
            }
        });
        return Object.keys(bins).map(bin => ({
            bin,
            count: bins[bin].count,
        }));
    }
    // Get top investors with pagination and detailed metrics
    async getTopInvestors(filters, limit = 10, offset = 0) {
        const userIds = await this.getFilteredUserIds(filters);
        const brokerTypes = filters.brokerTypes || ['kite', 'zebu'];
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            borkrageType: { $in: brokerTypes },
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const topInvestors = await this.portfolioRepo.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$userId',
                    livePortfolioCount: {
                        $sum: { $cond: [
                                { $and: [
                                        '$isInvested',
                                        { $ne: ['$borkrageType', 'paper_trade'] }
                                    ] },
                                1,
                                0
                            ] },
                    },
                    paperPortfolioCount: {
                        $sum: { $cond: [
                                { $and: [
                                        '$isInvested',
                                        { $eq: ['$borkrageType', 'paper_trade'] }
                                    ] },
                                1,
                                0
                            ] },
                    },
                    liveAUM: {
                        $sum: {
                            $cond: [
                                { $and: [
                                        '$isInvested',
                                        { $ne: ['$borkrageType', 'paper_trade'] }
                                    ] },
                                { $ifNull: ['$investmentCapital', 0] },
                                0
                            ],
                        },
                    },
                    paperAUM: {
                        $sum: {
                            $cond: [
                                { $and: [
                                        '$isInvested',
                                        { $eq: ['$borkrageType', 'paper_trade'] }
                                    ] },
                                { $ifNull: ['$investmentCapital', 0] },
                                0
                            ],
                        },
                    },
                    firstPortfolioDate: { $min: '$createdAt' },
                },
            },
            { $sort: { liveAUM: -1 } },
        ]);
        const total = topInvestors.length;
        const paginatedInvestors = topInvestors.slice(offset, offset + limit);
        const investors = await Promise.all(paginatedInvestors.map(async (item) => {
            let username = 'Unknown';
            let createdOn = null;
            try {
                const userId = new mongodb_1.ObjectId(item._id);
                const user = await this.userRepo.findOne({ _id: userId });
                username = user?.name || user?.email || user?.whatsappNumber || 'Unknown';
                createdOn = user?.createdOn || null;
            }
            catch (error) {
                console.error(`Failed to find user ${item._id}:`, error);
            }
            const avgInvested = item.livePortfolioCount > 0
                ? item.liveAUM / item.livePortfolioCount
                : 0;
            let daysToFirstDeploy = null;
            if (createdOn && item.firstPortfolioDate) {
                const diffTime = Math.abs(item.firstPortfolioDate.getTime() - createdOn.getTime());
                daysToFirstDeploy = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            return {
                userId: item._id,
                username,
                createdOn: createdOn || null,
                firstPortfolioDate: item.firstPortfolioDate || null,
                daysToFirstDeploy,
                livePortfolioCount: item.livePortfolioCount,
                paperPortfolioCount: item.paperPortfolioCount,
                liveAUM: parseFloat(item.liveAUM.toFixed(2)),
                paperAUM: parseFloat(item.paperAUM.toFixed(2)),
                avgInvestedPerPortfolio: parseFloat(avgInvested.toFixed(2)),
            };
        }));
        return {
            investors,
            total,
            page: Math.floor(offset / limit) + 1,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    // Get portfolio details for a specific user
    async getUserPortfolios(userId, filters) {
        const db = (0, database_1.getDatabase)();
        const portfolios = await db
            .collection('portfolio_details')
            .find({
            userId,
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
        })
            .project({
            _id: 1,
            portfolioName: 1,
            portfolioDescription: 1,
            createdAt: 1,
            borkrageType: 1,
            isInvested: 1,
            investmentCapital: 1,
            fromBacktest: 1,
        })
            .toArray();
        return portfolios;
    }
    async getFilteredUserIds(filters) {
        const userFilter = {};
        if (filters.userType) {
            userFilter.type = filters.userType;
        }
        if (filters.state) {
            userFilter.state = filters.state;
        }
        if (filters.district) {
            userFilter.district = filters.district;
        }
        const users = await this.userRepo.findMany(userFilter);
        return users.map(u => u._id.toString());
    }
}
exports.PortfolioAnalyticsService = PortfolioAnalyticsService;
//# sourceMappingURL=PortfolioAnalyticsService.js.map