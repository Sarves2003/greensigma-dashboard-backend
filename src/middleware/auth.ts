import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { DashboardUser } from '../types';
import { isValidPermissionKey, Role } from '../config/permissions';

const authService = new AuthService();

export interface AuthedRequest extends Request {
  authUser?: DashboardUser & { _idStr: string };
  authPermissions?: string[];
}

// Verifies the bearer JWT, loads the dashboard user, and attaches their effective
// permission set to the request. Every route below /api except /api/auth and
// /api/health should sit behind this.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
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
export function requirePermission(key: string) {
  if (!isValidPermissionKey(key)) {
    throw new Error(`Unknown permission key passed to requirePermission: ${key}`);
  }
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authPermissions?.includes(key)) {
      res.status(403).json({ success: false, error: 'You do not have access to this section', timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}

// Gates a route behind any one of several tab/card permission keys — for endpoints shared by
// multiple tabs (e.g. webinar batch dates, used by Funnel Analysis, 7 Day Activation, and
// Emandate), where requiring a single specific tab would wrongly lock out a role that only has
// one of the other tabs.
export function requireAnyPermission(...keys: string[]) {
  keys.forEach((key) => {
    if (!isValidPermissionKey(key)) {
      throw new Error(`Unknown permission key passed to requireAnyPermission: ${key}`);
    }
  });
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!keys.some((key) => req.authPermissions?.includes(key))) {
      res.status(403).json({ success: false, error: 'You do not have access to this section', timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ success: false, error: 'Insufficient role for this action', timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}
