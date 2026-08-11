"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UnrealizedPnlService_1 = require("../services/UnrealizedPnlService");
const router = (0, express_1.Router)();
const unrealizedPnlService = new UnrealizedPnlService_1.UnrealizedPnlService();
router.get('/', async (req, res) => {
    try {
        const data = await unrealizedPnlService.getLivePortfoliosPnl();
        const response = {
            success: true,
            data,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching unrealized P&L:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch unrealized P&L',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=unrealizedPnl.js.map