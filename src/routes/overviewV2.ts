import { Router, Request, Response } from 'express';
import { OverviewV2Service, LEDGER_SOURCES, LedgerSource } from '../services/OverviewV2Service';
import { FilterOptions, APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';

const router = Router();
const service = new OverviewV2Service();

function buildFilterOptions(req: Request): FilterOptions {
  const period = req.query.period as string || 'today';
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  let dateRange: { startDate: Date; endDate: Date };
  if (startDate && endDate) {
    dateRange = getCustomDateRange(startDate, endDate);
  } else {
    const result = getDateRange(period);
    dateRange = { startDate: result.startDate, endDate: result.endDate };
  }

  return {
    dateRange,
    userType: req.query.userType as string,
    referralCode: req.query.referralCode as string,
    state: req.query.state as string,
    district: req.query.district as string,
  };
}

function parseLedger(req: Request): LedgerSource[] {
  const raw = (req.query.ledger as string || '').split(',').map(s => s.trim()).filter(Boolean);
  const valid = raw.filter(s => (LEDGER_SOURCES as readonly string[]).includes(s)) as LedgerSource[];
  return valid.length > 0 ? valid : ['login'];
}

// Generates a list of "YYYY-MM" keys, most recent N calendar months (including current), or a custom range
function resolveMonthKeys(req: Request): string[] {
  const startMonth = req.query.startMonth as string;
  const endMonth = req.query.endMonth as string;
  const now = new Date();

  if (startMonth && endMonth) {
    const keys: string[] = [];
    let [sy, sm] = startMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    while (sy < ey || (sy === ey && sm <= em)) {
      keys.push(`${sy}-${String(sm).padStart(2, '0')}`);
      sm++;
      if (sm > 12) { sm = 1; sy++; }
      if (keys.length > 36) break; // safety cap
    }
    return keys;
  }

  const months = parseInt((req.query.months as string) || '1', 10);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

router.get('/key-metrics', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const data = await service.getKeyMetrics(filters);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching key metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch key metrics', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/feature-usage', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const data = await service.getFeatureUsage(filters);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching feature usage:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch feature usage', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/signups-monthly', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const data = await service.getSignupsMonthly(filters);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching signups monthly:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signups monthly', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/ledger-cohort', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const ledger = parseLedger(req);
    const data = await service.getLedgerUsageByCohort(filters, ledger);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching ledger cohort usage:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ledger cohort usage', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

// The following 3 endpoints IGNORE all global filters by design
router.get('/plot/activation-rate', async (req: Request, res: Response) => {
  try {
    const monthKeys = resolveMonthKeys(req);
    const type = (req.query.type as 'real' | 'paper') || 'real';
    const dayWindow = parseInt((req.query.dayWindow as string) || '30', 10) || 30;
    const data = await service.getActivationRate(monthKeys, type, dayWindow);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching activation rate:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activation rate', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/live-capital-rate', async (req: Request, res: Response) => {
  try {
    const monthKeys = resolveMonthKeys(req);
    const data = await service.getLiveCapitalRate(monthKeys);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching live capital rate:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch live capital rate', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/active-user-flow', async (req: Request, res: Response) => {
  try {
    const userType = (req.query.userType as string) || 'all';
    const dayWindow = parseInt((req.query.dayWindow as string) || '30', 10) || 30;
    const data = await service.getActiveUserFlow(userType, dayWindow);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching active user flow:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active user flow', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/active-user-flow-monthly', async (req: Request, res: Response) => {
  try {
    const userType = (req.query.userType as string) || 'all';
    const period = (req.query.period as 'thisMonth' | 'lastMonth' | 'last3Months') || 'thisMonth';
    const data = await service.getActiveUserFlowByPeriod(userType, period);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching active user flow by period:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active user flow by period', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/engagement-distribution', async (req: Request, res: Response) => {
  try {
    const userType = (req.query.userType as string) || 'all';
    const period = (req.query.period as 'thisMonth' | 'lastMonth' | 'last3Months' | 'custom') || 'thisMonth';
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const data = await service.getEngagementDistribution(userType, period, startDate, endDate);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching engagement distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch engagement distribution', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/active-user-breakdown', async (req: Request, res: Response) => {
  try {
    const userType = (req.query.userType as string) || 'all';
    const granularity = (req.query.granularity as 'daily' | 'monthly' | 'quarterly' | 'daywise') || 'daily';

    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : defaultStart;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : defaultEnd;

    const data = await service.getActiveUserBreakdown(userType, granularity, startDate, endDate);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching active user breakdown:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active user breakdown', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/plot/monthly-active-paid', async (req: Request, res: Response) => {
  try {
    const ledger = parseLedger(req);
    const data = await service.getMonthlyActivePaid(ledger);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching monthly active paid users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly active paid users', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
