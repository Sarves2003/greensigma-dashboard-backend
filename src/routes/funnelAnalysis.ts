import { Router, Request, Response } from 'express';
import { FunnelAnalysisService } from '../services/FunnelAnalysisService';
import { APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';

const router = Router();
const service = new FunnelAnalysisService();

router.get('/segment1', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'thisMonth';
    const startDateStr = req.query.startDate as string;
    const endDateStr = req.query.endDate as string;

    const { startDate, endDate } =
      startDateStr && endDateStr ? getCustomDateRange(startDateStr, endDateStr) : getDateRange(period);

    const data = await service.getSegment1(startDate, endDate);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching funnel segment 1:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 1', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/segment2', async (req: Request, res: Response) => {
  try {
    const data = await service.getSegment2();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching funnel segment 2:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 2', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/segment3', async (req: Request, res: Response) => {
  try {
    const data = await service.getSegment3();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching funnel segment 3:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch funnel segment 3', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/webinar-dates', async (req: Request, res: Response) => {
  try {
    const dates = await service.getBatchDates();
    res.json({ success: true, data: dates, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching webinar batch dates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webinar batch dates', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/webinar-dates', async (req: Request, res: Response) => {
  try {
    const dateStr = req.body?.date as string;
    if (!dateStr) {
      res.status(400).json({ success: false, error: 'date is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    await service.addBatchDate(dateStr);
    const dates = await service.getBatchDates();
    res.json({ success: true, data: dates, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error adding webinar batch date:', error);
    res.status(500).json({ success: false, error: 'Failed to add webinar batch date', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.delete('/webinar-dates/:id', async (req: Request, res: Response) => {
  try {
    await service.removeBatchDate(req.params.id);
    const dates = await service.getBatchDates();
    res.json({ success: true, data: dates, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error removing webinar batch date:', error);
    res.status(500).json({ success: false, error: 'Failed to remove webinar batch date', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
