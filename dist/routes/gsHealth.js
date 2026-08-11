"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const GoogleSheetsService_1 = require("../services/GoogleSheetsService");
const router = (0, express_1.Router)();
const sheetsService = new GoogleSheetsService_1.GoogleSheetsService();
function selectRows(allRows, req) {
    const preset = req.query.preset; // 'thisMonth' | 'lastMonth' | 'last2' | 'last3'
    const startMonth = req.query.startMonth; // 'YYYY-MM'
    const endMonth = req.query.endMonth; // 'YYYY-MM'
    if (startMonth && endMonth) {
        return allRows.filter(r => r.monthKey >= startMonth && r.monthKey <= endMonth);
    }
    switch (preset) {
        case 'thisMonth': return allRows.slice(-1);
        case 'lastMonth': return allRows.slice(-2, -1);
        case 'last2': return allRows.slice(-2);
        case 'last3': return allRows.slice(-3);
        default: return allRows.slice(-3);
    }
}
function average(values) {
    if (values.length === 0)
        return 0;
    return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}
function sum(values) {
    return parseFloat(values.reduce((a, b) => a + b, 0).toFixed(2));
}
function quarterKeyOf(row) {
    return `${row.year}-Q${Math.floor((row.month - 1) / 3) + 1}`;
}
function quarterLabel(qKey) {
    const [y, q] = qKey.split('-Q');
    return `Q${q} ${y}`;
}
function prevQuarterKey(qKey) {
    const [yStr, qStr] = qKey.split('-Q');
    let y = parseInt(yStr, 10);
    let q = parseInt(qStr, 10) - 1;
    if (q < 1) {
        q = 4;
        y -= 1;
    }
    return `${y}-Q${q}`;
}
// Anchored to the LATEST row actually present in the sheet — not real calendar "today",
// since the sheet is manually updated and may lag behind the current date.
function buildMetricBreakdown(allRows, extract, quarterAgg) {
    const latest = allRows[allRows.length - 1];
    const previous = allRows.length >= 2 ? allRows[allRows.length - 2] : null;
    const currentQKey = quarterKeyOf(latest);
    const lastQKey = prevQuarterKey(currentQKey);
    const currentQuarterRows = allRows.filter((r) => quarterKeyOf(r) === currentQKey);
    const lastQuarterRows = allRows.filter((r) => quarterKeyOf(r) === lastQKey);
    const agg = (rows) => {
        if (rows.length === 0)
            return null;
        return quarterAgg === 'avg' ? average(rows.map(extract)) : sum(rows.map(extract));
    };
    return {
        currentMonth: { label: latest.monthLabel, value: parseFloat(extract(latest).toFixed(2)) },
        lastMonth: previous
            ? { label: previous.monthLabel, value: parseFloat(extract(previous).toFixed(2)) }
            : { label: null, value: null },
        currentQuarter: { label: quarterLabel(currentQKey), value: agg(currentQuarterRows) },
        lastQuarter: { label: quarterLabel(lastQKey), value: agg(lastQuarterRows) },
    };
}
// Also anchored to the latest row's year, not real calendar "today".
function buildYearBreakdown(allRows, extract, lowerIsBetter) {
    const currentYear = allRows[allRows.length - 1].year;
    const previousYear = currentYear - 1;
    const currentYearRows = allRows.filter((r) => r.year === currentYear);
    const previousYearRows = allRows.filter((r) => r.year === previousYear);
    const avgPerMonth = (rows, yearLabel) => rows.length === 0 ? { label: null, value: null } : { label: String(yearLabel), value: average(rows.map(extract)) };
    const total = (rows, yearLabel) => rows.length === 0 ? { label: null, value: null } : { label: String(yearLabel), value: sum(rows.map(extract)) };
    const best = (rows) => {
        if (rows.length === 0)
            return { label: null, value: null };
        let bestRow = rows[0];
        for (const r of rows) {
            const isBetter = lowerIsBetter ? extract(r) < extract(bestRow) : extract(r) > extract(bestRow);
            if (isBetter)
                bestRow = r;
        }
        return { label: bestRow.monthLabel, value: parseFloat(extract(bestRow).toFixed(2)) };
    };
    return {
        currentYearAvgPerMonth: avgPerMonth(currentYearRows, currentYear),
        previousYearAvgPerMonth: avgPerMonth(previousYearRows, previousYear),
        currentYearTotal: total(currentYearRows, currentYear),
        previousYearTotal: total(previousYearRows, previousYear),
        currentYearBest: best(currentYearRows),
        previousYearBest: best(previousYearRows),
    };
}
router.get('/key-metrics', async (req, res) => {
    try {
        const allRows = await sheetsService.getMonthlyData();
        if (allRows.length === 0) {
            res.json({ success: true, data: null, timestamp: new Date().toISOString() });
            return;
        }
        const buildCategory = (extract, quarterAgg, lowerIsBetter) => ({
            ...buildMetricBreakdown(allRows, extract, quarterAgg),
            ...buildYearBreakdown(allRows, extract, lowerIsBetter),
        });
        const data = {
            revenue: buildCategory((r) => r.netRevenue, 'sum', false),
            cac: buildCategory((r) => r.cac, 'avg', true),
            paidUsers: buildCategory((r) => r.paidUsers, 'sum', false),
            adsSpent: buildCategory((r) => r.adsSpent, 'sum', true),
            leads: buildCategory((r) => r.registeredCount, 'sum', false),
            cpp: buildCategory((r) => r.cpp, 'avg', true),
        };
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching GS Health key metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch GS Health key metrics',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/summary', async (req, res) => {
    try {
        const allRows = await sheetsService.getMonthlyData();
        const rows = selectRows(allRows, req);
        if (rows.length === 0) {
            res.json({
                success: true,
                data: { cards: {}, charts: {}, table: [] },
                timestamp: new Date().toISOString(),
            });
            return;
        }
        // Cards: simple monthly average across selected range, plus totals
        const cards = {
            totalNetRevenue: sum(rows.map(r => r.netRevenue)),
            avgCac: average(rows.map(r => r.cac)),
            avgPaidUsers: average(rows.map(r => r.paidUsers)),
            totalAdsSpent: sum(rows.map(r => r.adsSpent)),
            avgCpp: average(rows.map(r => r.cpp)),
            totalLeads: sum(rows.map(r => r.registeredCount)),
            avgLeads: average(rows.map(r => r.registeredCount)),
        };
        // Charts: pre-shaped series, chronological order (oldest -> newest)
        const labels = rows.map(r => r.monthLabel);
        let cumulativeNetRevenue = 0;
        const cumulativeNetRevenueSeries = rows.map(r => {
            cumulativeNetRevenue += r.netRevenue;
            return cumulativeNetRevenue;
        });
        const charts = {
            labels,
            cac: rows.map(r => r.cac),
            cacRatio: rows.map(r => r.cacRatio),
            netRevenueMonthly: rows.map(r => r.netRevenue),
            netRevenueCumulative: cumulativeNetRevenueSeries,
            cpp: rows.map(r => r.cpp),
            netRoas: rows.map(r => r.netRoas),
        };
        // Table: newest first for readability
        const table = [...rows].reverse();
        res.json({
            success: true,
            data: { cards, charts, table },
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error fetching GS Health data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch GS Health data',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=gsHealth.js.map