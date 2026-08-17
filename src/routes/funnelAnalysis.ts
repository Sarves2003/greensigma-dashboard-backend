import { Router, Request, Response } from 'express';
import { FunnelAnalysisService } from '../services/FunnelAnalysisService';
import { APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';
import { requirePermission, requireAnyPermission } from '../middleware/auth';
import locationUploadRoutes from './locationUpload';

const router = Router();
const service = new FunnelAnalysisService();

// Everything except /webinar-dates is exclusive to this tab, so it's gated on tab:funnel-analysis
// specifically. /webinar-dates is shared with 7 Day Activation and Emandate (both reuse the same
// webinar_batch_dates collection), so it accepts any one of the three tab permissions instead —
// otherwise a role with only Emandate/Activation access and no Funnel Analysis access would 403
// on the date list itself. Server.ts mounts this whole router with just requireAuth (no blanket
// permission) so these per-route checks are what actually enforce access here.
router.use((req, res, next) => {
  if (req.path.startsWith('/webinar-dates')) return next();
  return requirePermission('tab:funnel-analysis')(req as any, res, next);
});

// Nested here (not a separate top-level app.use mount) so it inherits the tab:funnel-analysis
// check applied just above, without touching server.ts at all.
router.use('/location-upload', locationUploadRoutes);

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

router.get('/segment3/batch-detail', async (req: Request, res: Response) => {
  try {
    const datesParam = req.query.dates as string | undefined;
    const requestedKeys = datesParam ? datesParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const strictChennai = req.query.strictChennai === 'true';
    const data = await service.getWebinarBatchDetail(requestedKeys, strictChennai);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching webinar batch detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webinar batch detail', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

const webinarDatesAccess = requireAnyPermission('tab:funnel-analysis', 'tab:activation-tracker', 'tab:emandate-tracker');

router.get('/webinar-dates', webinarDatesAccess, async (req: Request, res: Response) => {
  try {
    const dates = await service.getBatchDates();
    res.json({ success: true, data: dates, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching webinar batch dates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webinar batch dates', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/webinar-dates', webinarDatesAccess, async (req: Request, res: Response) => {
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

router.delete('/webinar-dates/:id', webinarDatesAccess, async (req: Request, res: Response) => {
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
