import { Router, Request, Response } from 'express';
import multer from 'multer';
import { LocationUploadService } from '../services/LocationUploadService';
import { APIResponse } from '../types';

const router = Router();
const service = new LocationUploadService();

// Memory storage only — files are parsed in-process and never written to disk. A generous-but-bounded
// size limit guards against someone accidentally uploading something huge.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const parsed = await service.parseFile(req.file.buffer, req.file.originalname);
    res.json({
      success: true,
      data: {
        headers: parsed.headers,
        previewRows: parsed.rows.slice(0, 5),
        totalRows: parsed.rows.length,
      },
      timestamp: new Date().toISOString(),
    } as APIResponse<any>);
  } catch (error) {
    console.error('Error previewing location upload:', error);
    res.status(500).json({ success: false, error: 'Failed to parse file — check it is a valid CSV/Excel file', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.post('/commit', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const nameCol = parseInt(req.body.nameCol, 10);
    const mobileCol = parseInt(req.body.mobileCol, 10);
    const emailCol = parseInt(req.body.emailCol, 10);
    const locationCol = parseInt(req.body.locationCol, 10);

    if ([mobileCol, emailCol, locationCol].some((v) => isNaN(v))) {
      res.status(400).json({ success: false, error: 'Mobile, Email, and Location column mappings are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const parsed = await service.parseFile(req.file.buffer, req.file.originalname);
    const result = await service.saveMapped(parsed, {
      name: isNaN(nameCol) ? -1 : nameCol,
      mobile: mobileCol,
      email: emailCol,
      location: locationCol,
    });

    res.json({ success: true, data: result, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error committing location upload:', error);
    res.status(500).json({ success: false, error: 'Failed to save uploaded location data', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const count = await service.getUploadCount();
    res.json({ success: true, data: { count }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching location upload status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch upload status', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
