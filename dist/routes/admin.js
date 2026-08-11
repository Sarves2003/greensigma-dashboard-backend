"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AdminService_1 = require("../services/AdminService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const adminService = new AdminService_1.AdminService();
// Everything in this file is Owner-exclusive: the admin/permissions screen itself.
router.use(auth_1.requireAuth, (0, auth_1.requireRole)('owner'));
router.get('/permission-registry', (req, res) => {
    res.json({ success: true, data: adminService.getPermissionRegistry(), timestamp: new Date().toISOString() });
});
router.get('/users', async (req, res) => {
    try {
        const users = await adminService.listUsers();
        res.json({ success: true, data: users, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error listing dashboard users:', error);
        res.status(500).json({ success: false, error: 'Failed to load users', timestamp: new Date().toISOString() });
    }
});
router.post('/users', async (req, res) => {
    try {
        const { name, email, password, role } = req.body || {};
        if (!name || !email || !password || !role) {
            res.status(400).json({ success: false, error: 'name, email, password and role are required', timestamp: new Date().toISOString() });
            return;
        }
        const created = await adminService.createUser({ name, email, password, role });
        res.status(201).json({ success: true, data: created, timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message || 'Failed to create user', timestamp: new Date().toISOString() });
    }
});
router.put('/users/:id', async (req, res) => {
    try {
        const { name, role, active, permissionOverrides } = req.body || {};
        const updated = await adminService.updateUser(req.params.id, { name, role, active, permissionOverrides });
        res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message || 'Failed to update user', timestamp: new Date().toISOString() });
    }
});
router.delete('/users/:id', async (req, res) => {
    try {
        if (req.params.id === req.authUser._idStr) {
            res.status(400).json({ success: false, error: 'You cannot delete your own account', timestamp: new Date().toISOString() });
            return;
        }
        await adminService.deleteUser(req.params.id);
        res.json({ success: true, data: { deleted: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message || 'Failed to delete user', timestamp: new Date().toISOString() });
    }
});
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body || {};
        if (!newPassword) {
            res.status(400).json({ success: false, error: 'newPassword is required', timestamp: new Date().toISOString() });
            return;
        }
        await adminService.resetPassword(req.params.id, newPassword);
        res.json({ success: true, data: { reset: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message || 'Failed to reset password', timestamp: new Date().toISOString() });
    }
});
router.get('/role-permissions', async (req, res) => {
    try {
        const data = await adminService.listRolePermissions();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error listing role permissions:', error);
        res.status(500).json({ success: false, error: 'Failed to load role permissions', timestamp: new Date().toISOString() });
    }
});
router.put('/role-permissions/:role', async (req, res) => {
    try {
        const { permissions } = req.body || {};
        if (!Array.isArray(permissions)) {
            res.status(400).json({ success: false, error: 'permissions must be an array', timestamp: new Date().toISOString() });
            return;
        }
        await adminService.setRolePermissions(req.params.role, permissions);
        res.json({ success: true, data: { updated: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message || 'Failed to update role permissions', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map