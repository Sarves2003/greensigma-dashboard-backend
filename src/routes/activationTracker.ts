import { Router, Request, Response } from 'express';
import { ActivationTrackerService } from '../services/ActivationTrackerService';
import { APIResponse } from '../types';

const router = Router();
const service = new ActivationTrackerService();

router.get('/table', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    if (!date) {
      res.status(400).json({ success: false, error: 'date is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    const data = await service.getActivationTable(date);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching activation table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activation table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/remark', async (req: Request, res: Response) => {
  try {
    const { phone, batchDate, remark } = req.body || {};
    if (!phone || !batchDate) {
      res.status(400).json({ success: false, error: 'phone and batchDate are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    await service.saveRemark(phone, batchDate, remark || '');
    res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error saving activation remark:', error);
    res.status(500).json({ success: false, error: 'Failed to save remark', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/day-override', async (req: Request, res: Response) => {
  try {
    const { phone, batchDate, day, completed } = req.body || {};
    if (!phone || !batchDate || day === undefined || day === null) {
      res.status(400).json({ success: false, error: 'phone, batchDate, and day are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    await service.saveDayOverride(phone, batchDate, Number(day), completed === null || completed === undefined ? null : !!completed);
    res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error saving day override:', error);
    res.status(500).json({ success: false, error: 'Failed to save day override', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
