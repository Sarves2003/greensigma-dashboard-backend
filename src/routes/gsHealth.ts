import { Router, Request, Response } from 'express';
import { GoogleSheetsService, GsHealthRow } from '../services/GoogleSheetsService';
import { APIResponse } from '../types';

const router = Router();
const sheetsService = new GoogleSheetsService();

function selectRows(allRows: GsHealthRow[], req: Request): GsHealthRow[] {
  const months = req.query.months as string; // '2' | '3'
  const startMonth = req.query.startMonth as string; // 'YYYY-MM'
  const endMonth = req.query.endMonth as string; // 'YYYY-MM'

  if (startMonth && endMonth) {
    return allRows.filter(r => r.monthKey >= startMonth && r.monthKey <= endMonth);
  }

  const n = months ? parseInt(months, 10) : 3;
  return allRows.slice(-n);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function sum(values: number[]): number {
  return parseFloat(values.reduce((a, b) => a + b, 0).toFixed(2));
}

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const allRows = await sheetsService.getMonthlyData();
    const rows = selectRows(allRows, req);

    if (rows.length === 0) {
      res.json({
        success: true,
        data: { cards: {}, charts: {}, table: [] },
        timestamp: new Date().toISOString(),
      } as APIResponse<any>);
      return;
    }

    // Cards: simple monthly average across selected range, plus totals
    const cards = {
      totalGrossRevenue: sum(rows.map(r => r.totalRevenue)),
      totalNetRevenue: sum(rows.map(r => r.netRevenue)),
      avgCacRatio: average(rows.map(r => r.cacRatio)),
      avgNetRevenue: average(rows.map(r => r.netRevenue)),
      avgCpp: average(rows.map(r => r.cpp)),
      avgPaidUsers: average(rows.map(r => r.paidUsers)),
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
    } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching GS Health data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GS Health data',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
