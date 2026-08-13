import { Router, Request, Response } from 'express';
import { UsageAnalysisService } from '../services/UsageAnalysisService';
import { APIResponse } from '../types';

const router = Router();
const service = new UsageAnalysisService();

router.get('/main', async (req: Request, res: Response) => {
  try {
    let endDate: Date | undefined;
    if (req.query.endDate) {
      endDate = new Date(req.query.endDate as string);
      endDate.setHours(23, 59, 59, 999);
    }

    const filters = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate,
      type: req.query.type as string | undefined,
      referalCode: req.query.referalCode as string | undefined,
      search: req.query.search as string | undefined,
    };
    const data = await service.getMainTab(filters);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching usage analysis main tab:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch usage analysis data', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/demo-calls', async (req: Request, res: Response) => {
  try {
    const data = await service.getDemoCallTab();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching demo call bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch demo call bookings', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/assessments', async (req: Request, res: Response) => {
  try {
    const data = await service.getAssessmentTab();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching assessment bookings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assessment bookings', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
