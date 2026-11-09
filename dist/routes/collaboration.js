"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CollaborationService_1 = require("../services/CollaborationService");
const router = (0, express_1.Router)();
const service = new CollaborationService_1.CollaborationService();
router.get('/fields/:listType', async (req, res) => {
    try {
        const { listType } = req.params;
        if (!service.isValidListType(listType)) {
            res.status(400).json({ success: false, error: 'Invalid listType', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.getFields(listType);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching collaboration fields:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch fields', timestamp: new Date().toISOString() });
    }
});
router.post('/fields/:listType', async (req, res) => {
    try {
        const { listType } = req.params;
        if (!service.isValidListType(listType)) {
            res.status(400).json({ success: false, error: 'Invalid listType', timestamp: new Date().toISOString() });
            return;
        }
        const { label, type, options, required } = req.body || {};
        if (!label || !type || !service.isValidFieldType(type)) {
            res.status(400).json({ success: false, error: 'label and a valid type are required', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.createField(listType, { label, type, options, required });
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error creating collaboration field:', error);
        res.status(500).json({ success: false, error: 'Failed to create field', timestamp: new Date().toISOString() });
    }
});
router.put('/fields/:listType/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body || {};
        if (!Array.isArray(orderedIds)) {
            res.status(400).json({ success: false, error: 'orderedIds array is required', timestamp: new Date().toISOString() });
            return;
        }
        await service.reorderFields(orderedIds);
        res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error reordering collaboration fields:', error);
        res.status(500).json({ success: false, error: 'Failed to reorder fields', timestamp: new Date().toISOString() });
    }
});
router.put('/fields/:listType/:fieldId', async (req, res) => {
    try {
        const { fieldId } = req.params;
        const { label, options, required } = req.body || {};
        await service.updateField(fieldId, { label, options, required });
        res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error updating collaboration field:', error);
        res.status(500).json({ success: false, error: 'Failed to update field', timestamp: new Date().toISOString() });
    }
});
router.delete('/fields/:listType/:fieldId', async (req, res) => {
    try {
        await service.deleteField(req.params.fieldId);
        res.json({ success: true, data: { deleted: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error deleting collaboration field:', error);
        res.status(500).json({ success: false, error: 'Failed to delete field', timestamp: new Date().toISOString() });
    }
});
router.get('/records/:stage', async (req, res) => {
    try {
        const { stage } = req.params;
        if (!service.isValidStage(stage)) {
            res.status(400).json({ success: false, error: 'Invalid stage', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.listRecords(stage);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error fetching collaboration records:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch records', timestamp: new Date().toISOString() });
    }
});
router.post('/records/:stage', async (req, res) => {
    try {
        const { stage } = req.params;
        if (!service.isValidStage(stage)) {
            res.status(400).json({ success: false, error: 'Invalid stage', timestamp: new Date().toISOString() });
            return;
        }
        const data = await service.createRecord(stage, (req.body || {}).values || {}, req.authUser?.name);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error creating collaboration record:', error);
        res.status(500).json({ success: false, error: 'Failed to create record', timestamp: new Date().toISOString() });
    }
});
router.put('/records/:recordId', async (req, res) => {
    try {
        const { values } = req.body || {};
        if (!values || typeof values !== 'object') {
            res.status(400).json({ success: false, error: 'values object is required', timestamp: new Date().toISOString() });
            return;
        }
        await service.updateRecordValues(req.params.recordId, values, req.authUser?.name);
        res.json({ success: true, data: { saved: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error updating collaboration record:', error);
        res.status(500).json({ success: false, error: 'Failed to update record', timestamp: new Date().toISOString() });
    }
});
router.delete('/records/:recordId', async (req, res) => {
    try {
        await service.deleteRecord(req.params.recordId);
        res.json({ success: true, data: { deleted: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error deleting collaboration record:', error);
        res.status(500).json({ success: false, error: 'Failed to delete record', timestamp: new Date().toISOString() });
    }
});
router.post('/records/:recordId/promote', async (req, res) => {
    try {
        const data = await service.promoteRecord(req.params.recordId);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error promoting collaboration record:', error);
        res.status(500).json({ success: false, error: 'Failed to promote record', timestamp: new Date().toISOString() });
    }
});
router.post('/records/:recordId/demote', async (req, res) => {
    try {
        const data = await service.demoteRecord(req.params.recordId);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error demoting collaboration record:', error);
        res.status(500).json({ success: false, error: 'Failed to demote record', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=collaboration.js.map