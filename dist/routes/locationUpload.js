"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const LocationUploadService_1 = require("../services/LocationUploadService");
const router = (0, express_1.Router)();
const service = new LocationUploadService_1.LocationUploadService();
// Memory storage only — files are parsed in-process and never written to disk. A generous-but-bounded
// size limit guards against someone accidentally uploading something huge.
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.post('/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: 'No file uploaded', timestamp: new Date().toISOString() });
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
        });
    }
    catch (error) {
        console.error('Error previewing location upload:', error);
        res.status(500).json({ success: false, error: 'Failed to parse file — check it is a valid CSV/Excel file', timestamp: new Date().toISOString() });
    }
});
router.post('/commit', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: 'No file uploaded', timestamp: new Date().toISOString() });
            return;
        }
        const nameCol = parseInt(req.body.nameCol, 10);
        const mobileCol = parseInt(req.body.mobileCol, 10);
        const emailCol = parseInt(req.body.emailCol, 10);
        const locationCol = parseInt(req.body.locationCol, 10);
        if ([mobileCol, emailCol, locationCol].some((v) => isNaN(v))) {
            res.status(400).json({ success: false, error: 'Mobile, Email, and Location column mappings are required', timestamp: new Date().toISOString() });
            return;
        }
        const parsed = await service.parseFile(req.file.buffer, req.file.originalname);
        const result = await service.saveMapped(parsed, {
            name: isNaN(nameCol) ? -1 : nameCol,
            mobile: mobileCol,
            email: emailCol,
            location: locationCol,
        });
        res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error committing location upload:', error);
        res.status(500).json({ success: false, error: 'Failed to save uploaded location data', timestamp: new Date().toISOString() });
    }
});
router.get('/status', async (req, res) => {
    try {
        const count = await service.getUploadCount();
        res.json({ success: true, data: { count }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching location upload status:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch upload status', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=locationUpload.js.map