"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const UserRepository_1 = require("../repository/UserRepository");
const LoginLogRepository_1 = require("../repository/LoginLogRepository");
const ActivityRepository_1 = require("../repository/ActivityRepository");
const BrokerRepository_1 = require("../repository/BrokerRepository");
const LOGIN_DATA_CUTOFF = new Date('2026-05-23');
class AnalyticsService {
    constructor() {
        this.userRepo = new UserRepository_1.UserRepository();
        this.loginRepo = new LoginLogRepository_1.LoginLogRepository();
        this.stockScoreRepo = new ActivityRepository_1.StockScoreRepository();
        this.backtestRepo = new ActivityRepository_1.BacktestRepository();
        this.etfScoreRepo = new ActivityRepository_1.ETFScoreRepository();
        this.etfBacktestRepo = new ActivityRepository_1.ETFBacktestRepository();
        this.intradayRepo = new ActivityRepository_1.IntradayScoreRepository();
        this.brokerRepo = new BrokerRepository_1.BrokerRepository();
        this.portfolioRepo = new BrokerRepository_1.PortfolioRepository();
    }
    // Build user filter based on additional filters
    buildUserFilter(filters) {
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
        if (filters.referralCode) {
            userFilter.referalCode = filters.referralCode;
        }
        return userFilter;
    }
    // Get filtered user IDs for use in activity queries
    async getFilteredUserIds(filters) {
        const userFilter = this.buildUserFilter(filters);
        const users = await this.userRepo.findMany(userFilter);
        return users.map(u => u._id.toString());
    }
    // New Users
    async getNewUsers(filters) {
        const userFilter = this.buildUserFilter(filters);
        userFilter.createdOn = { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate };
        const users = await this.userRepo.findMany(userFilter);
        return {
            value: users.length,
            label: 'New Users',
        };
    }
    // Active Users
    async getActiveUsers(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        if (userIds.length === 0) {
            return { value: 0, label: 'Active Users' };
        }
        const afterCutoff = filters.dateRange.startDate > LOGIN_DATA_CUTOFF;
        if (afterCutoff) {
            const logins = await this.loginRepo.getUniqueLoginUsers(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
            return { value: logins.length, label: 'Active Users' };
        }
        // Before cutoff: infer from ANY feature usage
        const [stockUsers, backtestUsers, etfScoreUsers, etfBacktestUsers, intradayUsers] = await Promise.all([
            this.stockScoreRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds),
            this.backtestRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds),
            this.etfScoreRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds),
            this.etfBacktestRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds),
            this.intradayRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds),
        ]);
        const uniqueUsers = new Set([
            ...stockUsers,
            ...backtestUsers,
            ...etfScoreUsers,
            ...etfBacktestUsers,
            ...intradayUsers,
        ]);
        return {
            value: uniqueUsers.size,
            label: 'Active Users',
        };
    }
    async getSuccessfulLogins(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const count = await this.loginRepo.countSuccessfulLogins(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        return { value: count, label: 'Successful Logins' };
    }
    async getFailedLogins(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const count = await this.loginRepo.countFailedLogins(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        return { value: count, label: 'Failed Logins' };
    }
    async getLoginSuccessRate(filters) {
        const successful = await this.loginRepo.countSuccessfulLogins(filters.dateRange.startDate, filters.dateRange.endDate);
        const failed = await this.loginRepo.countFailedLogins(filters.dateRange.startDate, filters.dateRange.endDate);
        const total = successful + failed;
        const percentage = total > 0 ? (successful / total) * 100 : 0;
        return {
            value: Math.round(percentage * 100) / 100,
            label: 'Login Success %',
        };
    }
    // Stock Scores - with average per user
    async getStockScores(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        if (userIds.length === 0) {
            return {
                value: 0,
                label: 'Stock Scores (Avg: N/A)',
            };
        }
        const totalScores = await this.stockScoreRepo.countScoresBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const uniqueUsers = userIds;
        const avgPerUser = uniqueUsers.length > 0 ? totalScores / uniqueUsers.length : 0;
        return {
            value: totalScores,
            label: `Stock Scores (Avg: ${uniqueUsers.length > 0 ? avgPerUser.toFixed(1) : 'N/A'}/user)`,
        };
    }
    // Stock Backtests
    async getStockBacktests(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const successful = await this.backtestRepo.countBacktestsByStatus('Success', filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const failed = await this.backtestRepo.countBacktestsByStatus('Failed', filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const total = successful + failed;
        return {
            value: successful,
            label: `Stock Backtests (Avg: ${total > 0 ? (successful / total).toFixed(1) : 0}/user)`,
        };
    }
    // ETF Scores
    async getETFScores(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        if (userIds.length === 0) {
            return {
                value: 0,
                label: 'ETF Scores (Avg: N/A)',
            };
        }
        const totalScores = await this.etfScoreRepo.countScoresBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const uniqueUsers = userIds;
        const avgPerUser = uniqueUsers.length > 0 ? totalScores / uniqueUsers.length : 0;
        return {
            value: totalScores,
            label: `ETF Scores (Avg: ${uniqueUsers.length > 0 ? avgPerUser.toFixed(1) : 'N/A'}/user)`,
        };
    }
    // ETF Backtests
    async getETFBacktests(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const successful = await this.etfBacktestRepo.countBacktestsByStatus('Success', filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const failed = await this.etfBacktestRepo.countBacktestsByStatus('Failed', filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const total = successful + failed;
        return {
            value: successful,
            label: `ETF Backtests (Avg: ${total > 0 ? (successful / total).toFixed(1) : 0}/user)`,
        };
    }
    // Paper Portfolio
    async getPaperPortfolio(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            borkrageType: 'paper_trade',
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const portfolios = await this.portfolioRepo.aggregate([
            { $match: matchStage },
            { $count: 'count' },
        ]);
        const count = portfolios[0]?.count || 0;
        return { value: count, label: 'Paper Portfolio' };
    }
    // Live Real Portfolio - FIXED: checks stockDetails array
    async getLiveRealPortfolio(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const matchStage = {
            createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
            borkrageType: { $in: ['kite', 'zebu'] },
            isInvested: true,
            stockDetails: { $exists: true, $ne: [], $type: 'array' },
        };
        if (userIds.length > 0) {
            matchStage.userId = { $in: userIds };
        }
        const portfolios = await this.portfolioRepo.aggregate([
            { $match: matchStage },
            { $count: 'count' },
        ]);
        const count = portfolios[0]?.count || 0;
        return { value: count, label: 'Live Real Portfolio' };
    }
    async getBrokerConnected(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const brokers = await this.brokerRepo.getConnectedUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const filtered = new Set(brokers.map(b => b.userId));
        return { value: filtered.size, label: 'Broker Connected' };
    }
    async getIntradayScores(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        if (userIds.length === 0) {
            return {
                value: 0,
                label: 'Intraday Scores (Avg: N/A)',
            };
        }
        const totalScores = await this.intradayRepo.countScoresBetween(filters.dateRange.startDate, filters.dateRange.endDate, userIds);
        const uniqueUsers = userIds;
        const avgPerUser = uniqueUsers.length > 0 ? totalScores / uniqueUsers.length : 0;
        return {
            value: totalScores,
            label: `Intraday Scores (Avg: ${uniqueUsers.length > 0 ? avgPerUser.toFixed(1) : 'N/A'}/user)`,
        };
    }
    // Charts with filters applied
    async getDailyTrend(filters) {
        const data = await this.stockScoreRepo.getTrendData(filters.dateRange.startDate, filters.dateRange.endDate);
        return data.map((d) => ({
            date: d._id,
            value: d.count,
            label: d._id,
        }));
    }
    async getUserTypeDistribution(filters) {
        const types = ['Free', 'Webinar', 'Tribe'];
        const data = [];
        for (const type of types) {
            const userFilter = this.buildUserFilter({ ...filters, userType: type });
            const count = await this.userRepo.count(userFilter);
            data.push({
                date: type,
                value: count,
                label: type,
            });
        }
        return data;
    }
    async getStateDistribution(filters) {
        const userFilter = this.buildUserFilter(filters);
        const states = await this.userRepo.getDistinctStates();
        const data = [];
        for (const state of states) {
            if (state) {
                const stateFilter = { ...userFilter, state };
                const count = await this.userRepo.count(stateFilter);
                data.push({
                    date: state,
                    value: count,
                    label: state,
                });
            }
        }
        return data.sort((a, b) => b.value - a.value);
    }
    async getReferralDistribution(filters) {
        const userFilter = this.buildUserFilter(filters);
        const codes = await this.userRepo.getDistinctReferralCodes();
        const data = [];
        for (const code of codes) {
            if (code) {
                const codeFilter = { ...userFilter, referalCode: code };
                const count = await this.userRepo.count(codeFilter);
                data.push({
                    date: code,
                    value: count,
                    label: code,
                });
            }
        }
        return data.sort((a, b) => b.value - a.value).slice(0, 15);
    }
    // Get users for drill-down
    async getLivePortfolioUsers(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const livePortfolios = await this.portfolioRepo.aggregate([
            {
                $match: {
                    createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
                    borkrageType: { $in: ['kite', 'zebu'] },
                    isInvested: true,
                    stockDetails: { $exists: true, $ne: [], $type: 'array' },
                },
            },
            {
                $group: { _id: '$userId' },
            },
        ]);
        const portfolioUserIds = livePortfolios.map(p => p._id).filter(id => userIds.includes(id));
        const users = [];
        for (const userId of portfolioUserIds) {
            const user = await this.userRepo.getUserById(userId);
            if (user)
                users.push(user);
        }
        return users;
    }
    async getPaperPortfolioUsers(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const paperPortfolios = await this.portfolioRepo.aggregate([
            {
                $match: {
                    createdAt: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
                    borkrageType: 'paper_trade',
                },
            },
            {
                $group: { _id: '$userId' },
            },
        ]);
        const paperUserIds = paperPortfolios.map(p => p._id).filter(id => userIds.includes(id));
        const users = [];
        for (const userId of paperUserIds) {
            const user = await this.userRepo.getUserById(userId);
            if (user)
                users.push(user);
        }
        return users;
    }
    async getStockScoreUsers(filters) {
        const userIds = await this.getFilteredUserIds(filters);
        const scoreUsers = await this.stockScoreRepo.getUniqueUsersBetween(filters.dateRange.startDate, filters.dateRange.endDate);
        const filtered = scoreUsers.filter(id => userIds.includes(id));
        const users = [];
        for (const userId of filtered) {
            const user = await this.userRepo.getUserById(userId);
            if (user)
                users.push(user);
        }
        return users;
    }
}
exports.AnalyticsService = AnalyticsService;
//# sourceMappingURL=AnalyticsService.js.map