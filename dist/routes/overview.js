"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AnalyticsService_1 = require("../services/AnalyticsService");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const analyticsService = new AnalyticsService_1.AnalyticsService();
function buildFilterOptions(req) {
    const period = req.query.period || 'today';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    let dateRange;
    if (startDate && endDate) {
        dateRange = (0, dateUtils_1.getCustomDateRange)(startDate, endDate);
    }
    else {
        const result = (0, dateUtils_1.getDateRange)(period);
        dateRange = {
            startDate: result.startDate,
            endDate: result.endDate,
        };
    }
    return {
        dateRange: {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
        },
        userType: req.query.userType,
        referralCode: req.query.referralCode,
        state: req.query.state,
        district: req.query.district,
    };
}
router.get('/kpis', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const [newUsers, activeUsers, successfulLogins, failedLogins, loginSuccessRate, stockScores, stockBacktests, etfScores, etfBacktests, paperPortfolio, liveRealPortfolio, brokerConnected, intradayScores,] = await Promise.all([
            analyticsService.getNewUsers(filters),
            analyticsService.getActiveUsers(filters),
            analyticsService.getSuccessfulLogins(filters),
            analyticsService.getFailedLogins(filters),
            analyticsService.getLoginSuccessRate(filters),
            analyticsService.getStockScores(filters),
            analyticsService.getStockBacktests(filters),
            analyticsService.getETFScores(filters),
            analyticsService.getETFBacktests(filters),
            analyticsService.getPaperPortfolio(filters),
            analyticsService.getLiveRealPortfolio(filters),
            analyticsService.getBrokerConnected(filters),
            analyticsService.getIntradayScores(filters),
        ]);
        const response = {
            success: true,
            data: [
                newUsers,
                activeUsers,
                successfulLogins,
                failedLogins,
                loginSuccessRate,
                stockScores,
                stockBacktests,
                etfScores,
                etfBacktests,
                paperPortfolio,
                liveRealPortfolio,
                brokerConnected,
                intradayScores,
            ],
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching KPIs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch KPIs',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/daily-trend', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const trend = await analyticsService.getDailyTrend(filters);
        const response = {
            success: true,
            data: trend,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching daily trend:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch daily trend',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/user-type-distribution', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const distribution = await analyticsService.getUserTypeDistribution(filters);
        const response = {
            success: true,
            data: distribution,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching user type distribution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user type distribution',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/state-distribution', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const distribution = await analyticsService.getStateDistribution(filters);
        const response = {
            success: true,
            data: distribution,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching state distribution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch state distribution',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/referral-distribution', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const distribution = await analyticsService.getReferralDistribution(filters);
        const response = {
            success: true,
            data: distribution,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching referral distribution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch referral distribution',
            timestamp: new Date().toISOString(),
        });
    }
});
// Drill-down endpoints for user lists
router.get('/live-portfolio-users', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const users = await analyticsService.getLivePortfolioUsers(filters);
        const response = {
            success: true,
            data: users,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching live portfolio users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch live portfolio users',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/paper-portfolio-users', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const users = await analyticsService.getPaperPortfolioUsers(filters);
        const response = {
            success: true,
            data: users,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching paper portfolio users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch paper portfolio users',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/stock-score-users', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const users = await analyticsService.getStockScoreUsers(filters);
        const response = {
            success: true,
            data: users,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching stock score users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stock score users',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=overview.js.map