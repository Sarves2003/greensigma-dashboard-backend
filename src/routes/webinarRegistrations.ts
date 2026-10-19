import { Router, Request, Response } from 'express';
import { WebinarRegistrationsService, RegCategory } from '../services/WebinarRegistrationsService';
import { requirePermission } from '../middleware/auth';
import { APIResponse } from '../types';

const router = Router();
const service = new WebinarRegistrationsService();

// Payment/contact data — gated independently from the rest of Webinar Analysis so a role can be
// given Zoom attendance analytics without also getting this marketer-facing lead list, or vice versa.
router.use(requirePermission('card:webinar-analysis:registrations'));

function resolvePage(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
  return { page, pageSize };
}

function resolveSort(req: Request): { sortBy?: string; sortDir: 'asc' | 'desc' } {
  const sortBy = typeof req.query.sortBy === 'string' && req.query.sortBy ? req.query.sortBy : undefined;
  const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortDir };
}

function resolveSearch(req: Request): string | undefined {
  return typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search : undefined;
}

function resolveCategory(req: Request): RegCategory {
  return req.query.category === 'failed' || req.query.category === 'notpaid' || req.query.category === 'all' ? req.query.category : 'success';
}

function resolveFormat(req: Request): 'raw' | 'aisensy' {
  return req.query.format === 'aisensy' ? 'aisensy' : 'raw';
}

function resolveTag(req: Request): string {
  return typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
}

router.get('/list', async (req: Request, res: Response) => {
  try {
    const data = await service.listWebinars();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error listing webinar registrations:', error);
    res.status(500).json({ success: false, error: 'Failed to list webinars', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/summary/:webinarId', async (req: Request, res: Response) => {
  try {
    const data = await service.getSummary(req.params.webinarId);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error building webinar registrations summary:', error);
    res.status(500).json({ success: false, error: 'Failed to build summary', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/table/:webinarId', async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = resolvePage(req);
    const { sortBy, sortDir } = resolveSort(req);
    const data = await service.getTable(req.params.webinarId, resolveCategory(req), page, pageSize, sortBy, sortDir, resolveSearch(req));
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching webinar registrations table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/table/:webinarId/download', async (req: Request, res: Response) => {
  try {
    const { sortBy, sortDir } = resolveSort(req);
    const category = resolveCategory(req);
    const csv = await service.downloadCsv(req.params.webinarId, category, sortBy, sortDir, resolveSearch(req), resolveFormat(req), resolveTag(req));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="webinar-registrations-${category}-${req.params.webinarId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading webinar registrations CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to generate the CSV', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
