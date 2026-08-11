import { Router, Request, Response } from 'express';
import { UnrealizedPnlService } from '../services/UnrealizedPnlService';
import { APIResponse } from '../types';

const router = Router();
const unrealizedPnlService = new UnrealizedPnlService();

router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await unrealizedPnlService.getLivePortfoliosPnl();

    const response: APIResponse<any> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching unrealized P&L:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unrealized P&L',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
