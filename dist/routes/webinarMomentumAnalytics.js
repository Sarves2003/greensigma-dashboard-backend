"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const WebinarMomentumAnalyticsService_1 = require("../services/WebinarMomentumAnalyticsService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const service = new WebinarMomentumAnalyticsService_1.WebinarMomentumAnalyticsService();
router.use((0, auth_1.requirePermission)('card:webinar-analysis:analytics'));
router.get('/report', async (req, res) => {
    try {
        const data = await service.getReport();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error building webinar momentum analytics report:', error);
        res.status(500).json({ success: false, error: 'Failed to build the analytics report', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=webinarMomentumAnalytics.js.map