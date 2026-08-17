import { Request, Response, NextFunction } from 'express';
import { DashboardUser } from '../types';
import { Role } from '../config/permissions';
export interface AuthedRequest extends Request {
    authUser?: DashboardUser & {
        _idStr: string;
    };
    authPermissions?: string[];
}
export declare function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requirePermission(key: string): (req: AuthedRequest, res: Response, next: NextFunction) => void;
export declare function requireAnyPermission(...keys: string[]): (req: AuthedRequest, res: Response, next: NextFunction) => void;
export declare function requireRole(...roles: Role[]): (req: AuthedRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map