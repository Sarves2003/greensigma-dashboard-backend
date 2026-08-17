"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const FunnelAnalysisService_1 = require("../services/FunnelAnalysisService");
const dateUtils_1 = require("../utils/dateUtils");
const auth_1 = require("../middleware/auth");
const locationUpload_1 = __importDefault(require("./locationUpload"));
const router = (0, express_1.Router)();
const service = new FunnelAnalysisService_1.FunnelAnalysisService();
// Everything except /webinar-dates is exclusive to this tab, so it's gated on tab:funnel-analysis
// specifically. /webinar-dates is shared with 7 Day Activation and Emandate (both reuse the same
// webinar_batch_dates collection), so it accepts any one of the three tab permissions instead —
// otherwise a role with only Emandate/Activation access and no Funnel Analysis access would 403
// on the date list itself. Server.ts mounts this whole router with just requireAuth (no blanket
// permission) so these per-route checks are what actually enforce access here.
router.use((req, res, next) => {
    if (req.path.startsWith('/webinar-dates'))
        return next();
    return (0, auth_1.requirePermission)('tab:funnel-analysis')(req, res, next);
});
// Nested here (not a separate top-level app.use mount) so it inherits the tab:funnel-analysis
// check applied just above, without touching server.ts at all.
router.use('/location-upload', locationUpload_1.default);
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
router.get('/segment3/batch-detail', async (req, res) => {
    try {
        const datesParam = req.query.dates;
        const requestedKeys = datesParam ? datesParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
        const strictChennai = req.query.strictChennai === 'true';
        const data = await service.getWebinarBatchDetail(requestedKeys, strictChennai);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching webinar batch detail:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch webinar batch detail', timestamp: new Date().toISOString() });
    }
});
const webinarDatesAccess = (0, auth_1.requireAnyPermission)('tab:funnel-analysis', 'tab:activation-tracker', 'tab:emandate-tracker');
router.get('/webinar-dates', webinarDatesAccess, async (req, res) => {
    try {
        const dates = await service.getBatchDates();
        res.json({ success: true, data: dates, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching webinar batch dates:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch webinar batch dates', timestamp: new Date().toISOString() });
    }
});
router.post('/webinar-dates', webinarDatesAccess, async (req, res) => {
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
router.delete('/webinar-dates/:id', webinarDatesAccess, async (req, res) => {
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