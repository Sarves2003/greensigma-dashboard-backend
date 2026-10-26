import { Router, Request, Response } from 'express';
import { WebinarMomentumAnalyticsService } from '../services/WebinarMomentumAnalyticsService';
import { requirePermission } from '../middleware/auth';
import { APIResponse } from '../types';

const router = Router();
const service = new WebinarMomentumAnalyticsService();

router.use(requirePermission('card:webinar-analysis:analytics'));

router.get('/report', async (req: Request, res: Response) => {
  try {
    const data = await service.getReport();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error building webinar momentum analytics report:', error);
    res.status(500).json({ success: false, error: 'Failed to build the analytics report', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
