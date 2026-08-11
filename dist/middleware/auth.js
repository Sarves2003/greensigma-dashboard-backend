"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requirePermission = requirePermission;
exports.requireRole = requireRole;
const AuthService_1 = require("../services/AuthService");
const permissions_1 = require("../config/permissions");
const authService = new AuthService_1.AuthService();
// Verifies the bearer JWT, loads the dashboard user, and attaches their effective
// permission set to the request. Every route below /api except /api/auth and
// /api/health should sit behind this.
async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ success: false, error: 'Not authenticated', timestamp: new Date().toISOString() });
        return;
    }
    const payload = authService.verifyToken(token);
    if (!payload) {
        res.status(401).json({ success: false, error: 'Invalid or expired session', timestamp: new Date().toISOString() });
        return;
    }
    const user = await authService.getUserById(payload.sub);
    if (!user || !user.active) {
        res.status(401).json({ success: false, error: 'Account not found or disabled', timestamp: new Date().toISOString() });
        return;
    }
    req.authUser = { ...user, _idStr: String(user._id) };
    req.authPermissions = await authService.getEffectivePermissions(user);
    next();
}
// Gates a route behind a specific tab/card permission key. Requires requireAuth
// to have already run on the same request.
function requirePermission(key) {
    if (!(0, permissions_1.isValidPermissionKey)(key)) {
        throw new Error(`Unknown permission key passed to requirePermission: ${key}`);
    }
    return (req, res, next) => {
        if (!req.authPermissions?.includes(key)) {
            res.status(403).json({ success: false, error: 'You do not have access to this section', timestamp: new Date().toISOString() });
            return;
        }
        next();
    };
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.authUser || !roles.includes(req.authUser.role)) {
            res.status(403).json({ success: false, error: 'Insufficient role for this action', timestamp: new Date().toISOString() });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map