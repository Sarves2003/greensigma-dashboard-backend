"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const RetentionService_1 = require("../services/RetentionService");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const retentionService = new RetentionService_1.RetentionService();
function buildFilterOptions(req) {
    const period = req.query.period || 'last3months';
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
// Get cohort retention heatmap
router.get('/cohort', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const granularity = req.query.granularity || 'monthly';
        const cohortData = await retentionService.getCohortRetention(filters, granularity);
        const response = {
            success: true,
            data: cohortData,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching cohort retention:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cohort retention',
            timestamp: new Date().toISOString(),
        });
    }
});
// Get KPI comparison
router.get('/kpi-comparison', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const kpiData = await retentionService.getKPIComparison(filters);
        const response = {
            success: true,
            data: kpiData,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching KPI comparison:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch KPI comparison',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=retention.js.map