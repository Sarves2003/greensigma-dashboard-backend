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
router.get('/user-detail/:userId', async (req, res) => {
    try {
        const data = await service.getUserDetail(req.params.userId);
        if (!data) {
            res.status(404).json({ success: false, error: 'User not found', timestamp: new Date().toISOString() });
            return;
        }
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching user detail:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user detail', timestamp: new Date().toISOString() });
    }
});
router.patch('/user-status/:userId', async (req, res) => {
    try {
        const { status } = req.body || {};
        if (status !== null && !UsageAnalysisService_1.LEAD_STATUS_OPTIONS.includes(status)) {
            res.status(400).json({ success: false, error: 'Invalid status value', timestamp: new Date().toISOString() });
            return;
        }
        await service.setUserStatus(req.params.userId, status);
        res.json({ success: true, data: { updated: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, error: 'Failed to update status', timestamp: new Date().toISOString() });
    }
});
router.get('/user-notes/:userId', async (req, res) => {
    try {
        const data = await service.getUserNotes(req.params.userId);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching user notes:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notes', timestamp: new Date().toISOString() });
    }
});
router.post('/user-notes/:userId', async (req, res) => {
    try {
        const text = (req.body?.text || '').trim();
        if (!text) {
            res.status(400).json({ success: false, error: 'Note text is required', timestamp: new Date().toISOString() });
            return;
        }
        const byName = req.authUser?.name || 'Unknown';
        const data = await service.addUserNote(req.params.userId, text, byName);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error adding user note:', error);
        res.status(500).json({ success: false, error: 'Failed to add note', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=usageAnalysis.js.map