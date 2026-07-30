import { Router, Request, Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';
import { FilterOptions } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';
import { APIResponse } from '../types';

const router = Router();
const analyticsService = new AnalyticsService();

function buildFilterOptions(req: Request): FilterOptions {
  const period = req.query.period as string || 'today';
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

router.get('/kpis', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);

    const [
      newUsers,
      activeUsers,
      successfulLogins,
      failedLogins,
      loginSuccessRate,
      stockScores,
      stockBacktests,
      etfScores,
      etfBacktests,
      paperPortfolio,
      liveRealPortfolio,
      brokerConnected,
      intradayScores,
    ] = await Promise.all([
      analyticsService.getNewUsers(filters),
      analyticsService.getActiveUsers(filters),
      analyticsService.getSuccessfulLogins(filters),
      analyticsService.getFailedLogins(filters),
      analyticsService.getLoginSuccessRate(filters),
      analyticsService.getStockScores(filters),
      analyticsService.getStockBacktests(filters),
      analyticsService.getETFScores(filters),
      analyticsService.getETFBacktests(filters),
      analyticsService.getPaperPortfolio(filters),
      analyticsService.getLiveRealPortfolio(filters),
      analyticsService.getBrokerConnected(filters),
      analyticsService.getIntradayScores(filters),
    ]);

    const response: APIResponse<typeof newUsers[]> = {
      success: true,
      data: [
        newUsers,
        activeUsers,
        successfulLogins,
        failedLogins,
        loginSuccessRate,
        stockScores,
        stockBacktests,
        etfScores,
        etfBacktests,
        paperPortfolio,
        liveRealPortfolio,
        brokerConnected,
        intradayScores,
      ],
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPIs',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/daily-trend', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const trend = await analyticsService.getDailyTrend(filters);

    const response: APIResponse<typeof trend> = {
      success: true,
      data: trend,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching daily trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily trend',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/user-type-distribution', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const distribution = await analyticsService.getUserTypeDistribution(filters);

    const response: APIResponse<typeof distribution> = {
      success: true,
      data: distribution,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching user type distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user type distribution',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/state-distribution', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const distribution = await analyticsService.getStateDistribution(filters);

    const response: APIResponse<typeof distribution> = {
      success: true,
      data: distribution,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching state distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch state distribution',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/referral-distribution', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const distribution = await analyticsService.getReferralDistribution(filters);

    const response: APIResponse<typeof distribution> = {
      success: true,
      data: distribution,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching referral distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch referral distribution',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Drill-down endpoints for user lists
router.get('/live-portfolio-users', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const users = await analyticsService.getLivePortfolioUsers(filters);

    const response: APIResponse<typeof users> = {
      success: true,
      data: users,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching live portfolio users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live portfolio users',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/paper-portfolio-users', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const users = await analyticsService.getPaperPortfolioUsers(filters);

    const response: APIResponse<typeof users> = {
      success: true,
      data: users,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching paper portfolio users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch paper portfolio users',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/stock-score-users', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const users = await analyticsService.getStockScoreUsers(filters);

    const response: APIResponse<typeof users> = {
      success: true,
      data: users,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching stock score users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock score users',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
