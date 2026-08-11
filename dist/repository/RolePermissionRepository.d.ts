import { BaseRepository } from './BaseRepository';
import { RolePermissionDoc } from '../types';
import { Role } from '../config/permissions';
export declare class RolePermissionRepository extends BaseRepository<RolePermissionDoc> {
    protected collectionName: "DASHBOARD_ROLE_PERMISSIONS";
    getByRole(role: Role): Promise<RolePermissionDoc | null>;
    getAll(): Promise<RolePermissionDoc[]>;
    setPermissions(role: Role, permissions: string[]): Promise<void>;
}
//# sourceMappingURL=RolePermissionRepository.d.ts.map