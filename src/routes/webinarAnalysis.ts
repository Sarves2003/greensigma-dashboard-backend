import { Router, Request, Response } from 'express';
import multer from 'multer';
import { WebinarAnalysisService } from '../services/WebinarAnalysisService';
import { APIResponse } from '../types';

const router = Router();
const service = new WebinarAnalysisService();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

function resolvePage(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
  return { page, pageSize };
}

function resolveThreshold(req: Request): number {
  const t = parseFloat(req.query.attendedThresholdMin as string);
  return isNaN(t) || t < 0 ? 10 : t;
}

function resolveSort(req: Request): { sortBy?: string; sortDir: 'asc' | 'desc' } {
  const sortBy = typeof req.query.sortBy === 'string' && req.query.sortBy ? req.query.sortBy : undefined;
  const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortDir };
}

router.post('/upload', upload.fields([{ name: 'participantsFile', maxCount: 1 }, { name: 'chatFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const participantsFile = files?.['participantsFile']?.[0];
    const chatFile = files?.['chatFile']?.[0];
    if (!participantsFile || !chatFile) {
      res.status(400).json({ success: false, error: 'Both the participants CSV and the chat .txt file are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const summary = await service.uploadWebinar(participantsFile.buffer, chatFile.buffer);
    res.json({ success: true, data: summary, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error uploading webinar data:', error);
    res.status(500).json({ success: false, error: 'Failed to parse/save the uploaded webinar files', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    const data = await service.listWebinars();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error listing webinars:', error);
    res.status(500).json({ success: false, error: 'Failed to list uploaded webinars', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/report/:id', async (req: Request, res: Response) => {
  try {
    const data = await service.getReport(req.params.id, resolveThreshold(req));
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error building webinar report:', error);
    res.status(500).json({ success: false, error: 'Failed to build the webinar report', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/main/:id', async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = resolvePage(req);
    const { sortBy, sortDir } = resolveSort(req);
    const data = await service.getMainTable(req.params.id, resolveThreshold(req), page, pageSize, sortBy, sortDir);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching main table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch the registrant table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/not-joined/:id', async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = resolvePage(req);
    const { sortBy, sortDir } = resolveSort(req);
    const data = await service.getNotJoinedTable(req.params.id, resolveThreshold(req), page, pageSize, sortBy, sortDir);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching not-joined table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch the not-joined table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/main/:id/download', async (req: Request, res: Response) => {
  try {
    const { sortBy, sortDir } = resolveSort(req);
    const csv = await service.downloadMainCsv(req.params.id, resolveThreshold(req), sortBy, sortDir);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="main-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading main CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to generate the CSV', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/not-joined/:id/download', async (req: Request, res: Response) => {
  try {
    const { sortBy, sortDir } = resolveSort(req);
    const csv = await service.downloadNotJoinedCsv(req.params.id, resolveThreshold(req), sortBy, sortDir);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="not-joined-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading not-joined CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to generate the CSV', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/not-registered/:id', async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = resolvePage(req);
    const { sortBy, sortDir } = resolveSort(req);
    const data = await service.getNotRegisteredTable(req.params.id, page, pageSize, sortBy, sortDir);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching not-registered table:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch the not-registered table', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/not-registered/:id/download', async (req: Request, res: Response) => {
  try {
    const { sortBy, sortDir } = resolveSort(req);
    const csv = await service.downloadNotRegisteredCsv(req.params.id, sortBy, sortDir);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="not-registered-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading not-registered CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to generate the CSV', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/keyword/:id', async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = resolvePage(req);
    const { sortBy, sortDir } = resolveSort(req);
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : '';
    const data = await service.getKeywordMatches(req.params.id, keyword, page, pageSize, sortBy, sortDir);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching keyword matches:', error);
    res.status(500).json({ success: false, error: 'Failed to search chat messages', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/keyword/:id/download', async (req: Request, res: Response) => {
  try {
    const { sortBy, sortDir } = resolveSort(req);
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : '';
    const csv = await service.downloadKeywordCsv(req.params.id, keyword, sortBy, sortDir);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="keyword-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading keyword CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to generate the CSV', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/attendee/:id/:email', async (req: Request, res: Response) => {
  try {
    const data = await service.getAttendeeDetail(req.params.id, req.params.email);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching attendee detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attendee detail', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
