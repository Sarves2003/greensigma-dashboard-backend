import { BaseRepository } from './BaseRepository';
import { DashboardUser } from '../types';
export declare class DashboardUserRepository extends BaseRepository<DashboardUser> {
    protected collectionName: "DASHBOARD_USERS";
    getByEmail(email: string): Promise<DashboardUser | null>;
    getById(id: string): Promise<DashboardUser | null>;
    listAll(): Promise<DashboardUser[]>;
    createUser(user: DashboardUser): Promise<string>;
    updateUser(id: string, update: Partial<DashboardUser>): Promise<number>;
    deleteUser(id: string): Promise<number>;
    touchLastLogin(id: string): Promise<void>;
    countAll(): Promise<number>;
}
//# sourceMappingURL=DashboardUserRepository.d.ts.map