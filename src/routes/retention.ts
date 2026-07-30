import { Router, Request, Response } from 'express';
import { RetentionService } from '../services/RetentionService';
import { FilterOptions, APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';

const router = Router();
const retentionService = new RetentionService();

function buildFilterOptions(req: Request): FilterOptions {
  const period = req.query.period as string || 'last3months';
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  let dateRange: { startDate: Date; endDate: Date };
  if (startDate && endDate) {
    dateRange = getCustomDateRange(startDate, endDate);
  } else {
    const result = getDateRange(period);
    dateRange = {
      startDate: result.startDate,
      endDate: result.endDate,
    };
  }

  return {
    dateRange: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    userType: req.query.userType as string,
    referralCode: req.query.referralCode as string,
    state: req.query.state as string,
    district: req.query.district as string,
  };
}

// Get cohort retention heatmap
router.get('/cohort', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const granularity = (req.query.granularity as string) || 'monthly';

    const cohortData = await retentionService.getCohortRetention(
      filters,
      granularity as 'monthly' | 'quarterly' | 'yearly'
    );

    const response: APIResponse<any> = {
      success: true,
      data: cohortData,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching cohort retention:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cohort retention',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Get KPI comparison
router.get('/kpi-comparison', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);

    const kpiData = await retentionService.getKPIComparison(filters);

    const response: APIResponse<any> = {
      success: true,
      data: kpiData,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching KPI comparison:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPI comparison',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
