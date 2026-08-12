"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const OverviewV2Service_1 = require("../services/OverviewV2Service");
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
const service = new OverviewV2Service_1.OverviewV2Service();
function buildFilterOptions(req) {
    const period = req.query.period || 'today';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    let dateRange;
    if (startDate && endDate) {
        dateRange = (0, dateUtils_1.getCustomDateRange)(startDate, endDate);
    }
    else {
        const result = (0, dateUtils_1.getDateRange)(period);
        dateRange = { startDate: result.startDate, endDate: result.endDate };
    }
    return {
        dateRange,
        userType: req.query.userType,
        referralCode: req.query.referralCode,
        state: req.query.state,
        district: req.query.district,
    };
}
function parseLedger(req) {
    const raw = (req.query.ledger || '').split(',').map(s => s.trim()).filter(Boolean);
    const valid = raw.filter(s => OverviewV2Service_1.LEDGER_SOURCES.includes(s));
    return valid.length > 0 ? valid : ['login'];
}
// Generates a list of "YYYY-MM" keys, most recent N calendar months (including current), or a custom range
function resolveMonthKeys(req) {
    const startMonth = req.query.startMonth;
    const endMonth = req.query.endMonth;
    const now = new Date();
    if (startMonth && endMonth) {
        const keys = [];
        let [sy, sm] = startMonth.split('-').map(Number);
        const [ey, em] = endMonth.split('-').map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
            keys.push(`${sy}-${String(sm).padStart(2, '0')}`);
            sm++;
            if (sm > 12) {
                sm = 1;
                sy++;
            }
            if (keys.length > 36)
                break; // safety cap
        }
        return keys;
    }
    const months = parseInt(req.query.months || '1', 10);
    const keys = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
}
router.get('/key-metrics', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const data = await service.getKeyMetrics(filters);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching key metrics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch key metrics', timestamp: new Date().toISOString() });
    }
});
router.get('/feature-usage', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const data = await service.getFeatureUsage(filters);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching feature usage:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch feature usage', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/signups-monthly', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const data = await service.getSignupsMonthly(filters);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching signups monthly:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch signups monthly', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/ledger-cohort', async (req, res) => {
    try {
        const filters = buildFilterOptions(req);
        const ledger = parseLedger(req);
        const data = await service.getLedgerUsageByCohort(filters, ledger);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching ledger cohort usage:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch ledger cohort usage', timestamp: new Date().toISOString() });
    }
});
// The following 3 endpoints IGNORE all global filters by design
router.get('/plot/activation-rate', async (req, res) => {
    try {
        const monthKeys = resolveMonthKeys(req);
        const type = req.query.type || 'real';
        const dayWindow = parseInt(req.query.dayWindow || '30', 10) || 30;
        const data = await service.getActivationRate(monthKeys, type, dayWindow);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching activation rate:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch activation rate', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/live-capital-rate', async (req, res) => {
    try {
        const monthKeys = resolveMonthKeys(req);
        const data = await service.getLiveCapitalRate(monthKeys);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching live capital rate:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch live capital rate', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/active-user-flow', async (req, res) => {
    try {
        const userType = req.query.userType || 'all';
        const dayWindow = parseInt(req.query.dayWindow || '30', 10) || 30;
        const data = await service.getActiveUserFlow(userType, dayWindow);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching active user flow:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch active user flow', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/active-user-flow-monthly', async (req, res) => {
    try {
        const userType = req.query.userType || 'all';
        const period = req.query.period || 'thisMonth';
        const data = await service.getActiveUserFlowByPeriod(userType, period);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching active user flow by period:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch active user flow by period', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/engagement-distribution', async (req, res) => {
    try {
        const userType = req.query.userType || 'all';
        const period = req.query.period || 'thisMonth';
        const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
        const data = await service.getEngagementDistribution(userType, period, startDate, endDate);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching engagement distribution:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch engagement distribution', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/active-user-breakdown', async (req, res) => {
    try {
        const userType = req.query.userType || 'all';
        const granularity = req.query.granularity || 'daily';
        const now = new Date();
        const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startDate = req.query.startDate ? new Date(req.query.startDate) : defaultStart;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : defaultEnd;
        const data = await service.getActiveUserBreakdown(userType, granularity, startDate, endDate);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching active user breakdown:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch active user breakdown', timestamp: new Date().toISOString() });
    }
});
router.get('/plot/monthly-active-paid', async (req, res) => {
    try {
        const ledger = parseLedger(req);
        const data = await service.getMonthlyActivePaid(ledger);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching monthly active paid users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch monthly active paid users', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=overviewV2.js.map