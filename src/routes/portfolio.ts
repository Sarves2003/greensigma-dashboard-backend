import { Router, Request, Response } from 'express';
import { PortfolioAnalyticsService } from '../services/PortfolioAnalyticsService';
import { FilterOptions, APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';

const router = Router();
const portfolioService = new PortfolioAnalyticsService();

function buildFilterOptions(req: Request): FilterOptions {
  const period = req.query.period as string || 'today';
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const brokerTypesStr = req.query.brokerTypes as string;

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

  const brokerTypes = brokerTypesStr ? brokerTypesStr.split(',') : ['kite', 'zebu'];

  return {
    dateRange: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    userType: req.query.userType as string,
    referralCode: req.query.referralCode as string,
    state: req.query.state as string,
    district: req.query.district as string,
    brokerTypes,
  };
}

// Get portfolio metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);

    const metrics = await portfolioService.getPortfolioMetrics(filters);

    const response: APIResponse<any> = {
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching portfolio metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio metrics',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Get portfolio trend
router.get('/trend', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);

    const trend = await portfolioService.getPortfolioTrend(filters);

    const response: APIResponse<any> = {
      success: true,
      data: trend,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching portfolio trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio trend',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Get portfolio type breakdown
router.get('/breakdown', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);

    const breakdown = await portfolioService.getPortfolioTypeBreakdown(filters);

    const response: APIResponse<any> = {
      success: true,
      data: breakdown,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching portfolio breakdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio breakdown',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Get top investors with pagination
router.get('/top-investors', async (req: Request, res: Response) => {
  try {
    const filters = buildFilterOptions(req);
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const topInvestors = await portfolioService.getTopInvestors(filters, limit, offset);

    const response: APIResponse<any> = {
      success: true,
      data: topInvestors,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching top investors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top investors',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

// Get user portfolios
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const filters = buildFilterOptions(req);

    const portfolios = await portfolioService.getUserPortfolios(userId, filters);

    const response: APIResponse<any> = {
      success: true,
      data: portfolios,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching user portfolios:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user portfolios',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
