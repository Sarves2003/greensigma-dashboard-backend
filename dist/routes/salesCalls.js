"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ZohoCrmService_1 = require("../services/ZohoCrmService");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const zohoCrmService = new ZohoCrmService_1.ZohoCrmService();
function resolveRange(req) {
    const startDateParam = req.query.startDate;
    const endDateParam = req.query.endDate;
    const period = req.query.period || 'thisMonth';
    return startDateParam && endDateParam ? (0, dateUtils_1.getCustomDateRange)(startDateParam, endDateParam) : (0, dateUtils_1.getDateRange)(period);
}
function resolveAgents(req) {
    const raw = req.query.agents;
    if (!raw)
        return undefined;
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
}
function resolvePage(req) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    return { page, pageSize };
}
router.get('/filters', async (_req, res) => {
    try {
        const data = await zohoCrmService.getFilterOptions();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho filter options:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch filter options',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/calls-overview', async (req, res) => {
    try {
        const { startDate, endDate } = resolveRange(req);
        const agents = resolveAgents(req);
        const leadSource = req.query.leadSource;
        const data = await zohoCrmService.getCallsOverview(startDate, endDate, agents, leadSource);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho calls overview:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch calls overview',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/leads-overview', async (req, res) => {
    try {
        const { startDate, endDate } = resolveRange(req);
        const agents = resolveAgents(req);
        const leadSource = req.query.leadSource;
        const data = await zohoCrmService.getLeadsOverview(startDate, endDate, agents, leadSource);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho leads overview:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch leads overview',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/call-records', async (req, res) => {
    try {
        const { startDate, endDate } = resolveRange(req);
        const agents = resolveAgents(req);
        const leadSource = req.query.leadSource;
        const { page, pageSize } = resolvePage(req);
        const data = await zohoCrmService.getCallRecords(startDate, endDate, agents, leadSource, page, pageSize);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho call records:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch call records',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/lead-records', async (req, res) => {
    try {
        const { startDate, endDate } = resolveRange(req);
        const agents = resolveAgents(req);
        const leadSource = req.query.leadSource;
        const { page, pageSize } = resolvePage(req);
        const data = await zohoCrmService.getLeadRecords(startDate, endDate, agents, leadSource, page, pageSize);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho lead records:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch lead records',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/lead-history', async (req, res) => {
    try {
        const leadId = req.query.leadId;
        if (!leadId) {
            res.status(400).json({ success: false, error: 'leadId is required', timestamp: new Date().toISOString() });
            return;
        }
        const data = await zohoCrmService.getLeadHistory(leadId);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching Zoho lead history:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch lead history',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=salesCalls.js.map