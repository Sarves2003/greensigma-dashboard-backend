"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UsageAnalysisService_1 = require("../services/UsageAnalysisService");
const router = (0, express_1.Router)();
const service = new UsageAnalysisService_1.UsageAnalysisService();
router.get('/main', async (req, res) => {
    try {
        let endDate;
        if (req.query.endDate) {
            endDate = new Date(req.query.endDate);
            endDate.setHours(23, 59, 59, 999);
        }
        const filters = {
            startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
            endDate,
            type: req.query.type,
            referalCode: req.query.referalCode,
            search: req.query.search,
        };
        const data = await service.getMainTab(filters);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching usage analysis main tab:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch usage analysis data', timestamp: new Date().toISOString() });
    }
});
router.get('/demo-calls', async (req, res) => {
    try {
        const data = await service.getDemoCallTab();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching demo call bookings:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch demo call bookings', timestamp: new Date().toISOString() });
    }
});
router.get('/assessments', async (req, res) => {
    try {
        const data = await service.getAssessmentTab();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching assessment bookings:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch assessment bookings', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=usageAnalysis.js.map