"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const FunnelAnalysisService_1 = require("../services/FunnelAnalysisService");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const service = new FunnelAnalysisService_1.FunnelAnalysisService();
router.get('/segment1', async (req, res) => {
    try {
        const period = req.query.period || 'thisMonth';
        const startDateStr = req.query.startDate;
        const endDateStr = req.query.endDate;
        const { startDate, endDate } = startDateStr && endDateStr ? (0, dateUtils_1.getCustomDateRange)(startDateStr, endDateStr) : (0, dateUtils_1.getDateRange)(period);
        const data = await service.getSegment1(startDate, endDate);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching funnel segment 1:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 1', timestamp: new Date().toISOString() });
    }
});
router.get('/segment2', async (req, res) => {
    try {
        const data = await service.getSegment2();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching funnel segment 2:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 2', timestamp: new Date().toISOString() });
    }
});
router.get('/segment3', async (req, res) => {
    try {
        const data = await service.getSegment3();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching funnel segment 3:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 3', timestamp: new Date().toISOString() });
    }
});
router.get('/webinar-dates', async (req, res) => {
    try {
        const dates = await service.getBatchDates();
        res.json({ success: true, data: dates, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching webinar batch dates:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch webinar batch dates', timestamp: new Date().toISOString() });
    }
});
router.post('/webinar-dates', async (req, res) => {
    try {
        const dateStr = req.body?.date;
        if (!dateStr) {
            res.status(400).json({ success: false, error: 'date is required', timestamp: new Date().toISOString() });
            return;
        }
        await service.addBatchDate(dateStr);
        const dates = await service.getBatchDates();
        res.json({ success: true, data: dates, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error adding webinar batch date:', error);
        res.status(500).json({ success: false, error: 'Failed to add webinar batch date', timestamp: new Date().toISOString() });
    }
});
router.delete('/webinar-dates/:id', async (req, res) => {
    try {
        await service.removeBatchDate(req.params.id);
        const dates = await service.getBatchDates();
        res.json({ success: true, data: dates, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error removing webinar batch date:', error);
        res.status(500).json({ success: false, error: 'Failed to remove webinar batch date', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=funnelAnalysis.js.map