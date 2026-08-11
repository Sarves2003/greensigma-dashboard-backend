import { Role } from '../config/permissions';
import { SafeUser } from './AuthService';
export interface DashboardUserView extends SafeUser {
    permissionOverrides?: {
        grant?: string[];
        revoke?: string[];
    };
    effectivePermissions: string[];
    createdAt: Date;
    lastLoginAt?: Date;
}
export declare class AdminService {
    private userRepo;
    private roleRepo;
    private authService;
    private toView;
    listUsers(): Promise<DashboardUserView[]>;
    createUser(input: {
        name: string;
        email: string;
        password: string;
        role: Role;
    }): Promise<DashboardUserView>;
    updateUser(id: string, updates: {
        name?: string;
        role?: Role;
        active?: boolean;
        permissionOverrides?: {
            grant?: string[];
            revoke?: string[];
        };
    }): Promise<DashboardUserView>;
    deleteUser(id: string): Promise<void>;
    resetPassword(id: string, newPassword: string): Promise<void>;
    getPermissionRegistry(): {
        permissions: import("../config/permissions").PermissionDef[];
        roles: readonly ["owner", "super_admin", "manager", "product_manager", "sales_team"];
        roleLabels: Record<"owner" | "super_admin" | "manager" | "product_manager" | "sales_team", string>;
    };
    listRolePermissions(): Promise<Record<Role, string[]>>;
    setRolePermissions(role: Role, permissions: string[]): Promise<void>;
}
//# sourceMappingURL=AdminService.d.ts.map