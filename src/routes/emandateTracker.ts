import { Router, Request, Response } from 'express';
import { EmandateTrackerService } from '../services/EmandateTrackerService';
import { APIResponse } from '../types';

const router = Router();
const service = new EmandateTrackerService();

router.get('/table', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    if (!date) {
      res.status(400).json({ success: false, error: 'date is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    const data = await service.getEmandateTable(date);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching emandate table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch emandate table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const datesParam = req.query.dates as string;
    const dateKeys = (datesParam || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (dateKeys.length === 0) {
      res.status(400).json({ success: false, error: 'dates is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    const data = await service.getOverview(dateKeys);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching emandate overview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch emandate overview', timestamp: new Date().toISOString() } as APIResponse<null>);
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
    console.error('Error saving emandate remark:', error);
    res.status(500).json({ success: false, error: 'Failed to save remark', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/status-override', async (req: Request, res: Response) => {
  try {
    const { phone, batchDate, status } = req.body || {};
    if (!phone || !batchDate) {
      res.status(400).json({ success: false, error: 'phone and batchDate are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    await service.savePaymentStatusOverride(phone, batchDate, status === null || status === undefined ? null : status);
    res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error saving payment status override:', error);
    res.status(500).json({ success: false, error: 'Failed to save status override', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
