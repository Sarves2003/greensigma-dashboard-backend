"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const EmandateTrackerService_1 = require("../services/EmandateTrackerService");
const router = (0, express_1.Router)();
const service = new EmandateTrackerService_1.EmandateTrackerService();
router.get('/table', async (req, res) => {
    try {
        const date = req.query.date;
        if (!date) {
            res.status(400).json({ success: false, error: 'date is required', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.getEmandateTable(date);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching emandate table:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch emandate table', timestamp: new Date().toISOString() });
    }
});
router.get('/overview', async (req, res) => {
    try {
        const datesParam = req.query.dates;
        const dateKeys = (datesParam || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (dateKeys.length === 0) {
            res.status(400).json({ success: false, error: 'dates is required', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.getOverview(dateKeys);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching emandate overview:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch emandate overview', timestamp: new Date().toISOString() });
    }
});
router.post('/remark', async (req, res) => {
    try {
        const { phone, batchDate, remark } = req.body || {};
        if (!phone || !batchDate) {
            res.status(400).json({ success: false, error: 'phone and batchDate are required', timestamp: new Date().toISOString() });
            return;
        }
        await service.saveRemark(phone, batchDate, remark || '');
        res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error saving emandate remark:', error);
        res.status(500).json({ success: false, error: 'Failed to save remark', timestamp: new Date().toISOString() });
    }
});
router.post('/status-override', async (req, res) => {
    try {
        const { phone, batchDate, status } = req.body || {};
        if (!phone || !batchDate) {
            res.status(400).json({ success: false, error: 'phone and batchDate are required', timestamp: new Date().toISOString() });
            return;
        }
        await service.savePaymentStatusOverride(phone, batchDate, status === null || status === undefined ? null : status);
        res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error saving payment status override:', error);
        res.status(500).json({ success: false, error: 'Failed to save status override', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=emandateTracker.js.map