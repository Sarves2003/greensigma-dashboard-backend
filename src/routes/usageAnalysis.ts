import { Router, Request, Response } from 'express';
import { UsageAnalysisService, LEAD_STATUS_OPTIONS } from '../services/UsageAnalysisService';
import { APIResponse } from '../types';
import { AuthedRequest } from '../middleware/auth';

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

router.get('/user-detail/:userId', async (req: Request, res: Response) => {
  try {
    const data = await service.getUserDetail(req.params.userId);
    if (!data) {
      res.status(404).json({ success: false, error: 'User not found', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching user detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user detail', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.patch('/user-status/:userId', async (req: AuthedRequest, res: Response) => {
  try {
    const { status } = req.body || {};
    if (status !== null && !LEAD_STATUS_OPTIONS.includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status value', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    await service.setUserStatus(req.params.userId, status);
    res.json({ success: true, data: { updated: true }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/user-notes/:userId', async (req: AuthedRequest, res: Response) => {
  try {
    const data = await service.getUserNotes(req.params.userId);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching user notes:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notes', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/user-notes/:userId', async (req: AuthedRequest, res: Response) => {
  try {
    const text = (req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ success: false, error: 'Note text is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    const byName = req.authUser?.name || 'Unknown';
    const data = await service.addUserNote(req.params.userId, text, byName);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error adding user note:', error);
    res.status(500).json({ success: false, error: 'Failed to add note', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
