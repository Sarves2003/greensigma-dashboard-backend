"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PortfolioAnalyticsService_1 = require("../services/PortfolioAnalyticsService");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const portfolioService = new PortfolioAnalyticsService_1.PortfolioAnalyticsService();
function buildFilterOptions(req) {
    const period = req.query.period || 'today';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const brokerTypesStr = req.query.brokerTypes;
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
    const brokerTypes = brokerTypesStr ? brokerTypesStr.split(',') : ['kite', 'zebu'];
    return {
        dateRange: {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
        },
        userType: req.query.userType,
        referralCode: req.query.referralCode,
        state: req.query.state,
        district: req.query.district,
        brokerTypes,
    };
}
// Get portfolio metrics
router.get('/metrics', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const metrics = await portfolioService.getPortfolioMetrics(filters);
        const response = {
            success: true,
            data: metrics,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching portfolio metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch portfolio metrics',
            timestamp: new Date().toISOString(),
        });
    }
});
// Get portfolio trend
router.get('/trend', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const trend = await portfolioService.getPortfolioTrend(filters);
        const response = {
            success: true,
            data: trend,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching portfolio trend:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch portfolio trend',
            timestamp: new Date().toISOString(),
        });
    }
});
// Get portfolio type breakdown
router.get('/breakdown', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const breakdown = await portfolioService.getPortfolioTypeBreakdown(filters);
        const response = {
            success: true,
            data: breakdown,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching portfolio breakdown:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch portfolio breakdown',
            timestamp: new Date().toISOString(),
        });
    }
});
// Get top investors with pagination
router.get('/top-investors', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        const topInvestors = await portfolioService.getTopInvestors(filters, limit, offset);
        const response = {
            success: true,
            data: topInvestors,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching top investors:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top investors',
            timestamp: new Date().toISOString(),
        });
    }
});
// Get user portfolios
router.get('/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const filters = buildFilterOptions(req);
        const portfolios = await portfolioService.getUserPortfolios(userId, filters);
        const response = {
            success: true,
            data: portfolios,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching user portfolios:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user portfolios',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=portfolio.js.map