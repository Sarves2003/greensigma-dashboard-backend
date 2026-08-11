import { Router, Request, Response } from 'express';
import { AuthService, toSafeUser } from '../services/AuthService';
import { APIResponse } from '../types';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
const authService = new AuthService();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const result = await authService.login(email, password);
    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid email or password', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    res.json({
      success: true,
      data: { token: result.token, user: result.user, permissions: result.permissions },
      timestamp: new Date().toISOString(),
    } as APIResponse<any>);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  res.json({
    success: true,
    data: { user: toSafeUser(req.authUser!), permissions: req.authPermissions },
    timestamp: new Date().toISOString(),
  } as APIResponse<any>);
});

router.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Current and new password are required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const ok = await authService.changePassword(req.authUser!._idStr, currentPassword, newPassword);
    if (!ok) {
      res.status(400).json({ success: false, error: 'Current password is incorrect', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    res.json({ success: true, data: { changed: true }, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password', timestamp: new Date().toISOString() } as APIResponse<null>);
  }
});

export default router;
