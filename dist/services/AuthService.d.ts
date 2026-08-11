import { Role } from '../config/permissions';
import { DashboardUser } from '../types';
export interface AuthTokenPayload {
    sub: string;
    email: string;
    role: Role;
}
export interface SafeUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
}
export declare function toSafeUser(user: DashboardUser): SafeUser;
export declare class AuthService {
    private userRepo;
    private roleRepo;
    private get jwtSecret();
    ensureSeeded(): Promise<void>;
    login(email: string, password: string): Promise<{
        token: string;
        user: SafeUser;
        permissions: string[];
    } | null>;
    verifyToken(token: string): AuthTokenPayload | null;
    getUserById(id: string): Promise<DashboardUser | null>;
    getEffectivePermissions(user: DashboardUser): Promise<string[]>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean>;
}
//# sourceMappingURL=AuthService.d.ts.map