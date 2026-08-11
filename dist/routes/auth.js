"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthService_1 = require("../services/AuthService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const authService = new AuthService_1.AuthService();
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            res.status(400).json({ success: false, error: 'Email and password are required', timestamp: new Date().toISOString() });
            return;
        }
        const result = await authService.login(email, password);
        if (!result) {
            res.status(401).json({ success: false, error: 'Invalid email or password', timestamp: new Date().toISOString() });
            return;
        }
        res.json({
            success: true,
            data: { token: result.token, user: result.user, permissions: result.permissions },
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed', timestamp: new Date().toISOString() });
    }
});
router.get('/me', auth_1.requireAuth, async (req, res) => {
    res.json({
        success: true,
        data: { user: (0, AuthService_1.toSafeUser)(req.authUser), permissions: req.authPermissions },
        timestamp: new Date().toISOString(),
    });
});
router.post('/change-password', auth_1.requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            res.status(400).json({ success: false, error: 'Current and new password are required', timestamp: new Date().toISOString() });
            return;
        }
        if (newPassword.length < 8) {
            res.status(400).json({ success: false, error: 'New password must be at least 8 characters', timestamp: new Date().toISOString() });
            return;
        }
        const ok = await authService.changePassword(req.authUser._idStr, currentPassword, newPassword);
        if (!ok) {
            res.status(400).json({ success: false, error: 'Current password is incorrect', timestamp: new Date().toISOString() });
            return;
        }
        res.json({ success: true, data: { changed: true }, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Failed to change password', timestamp: new Date().toISOString() });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map