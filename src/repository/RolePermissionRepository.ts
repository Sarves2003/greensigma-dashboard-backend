import { BaseRepository } from './BaseRepository';
import { RolePermissionDoc } from '../types';
import { Filter } from 'mongodb';
import { Role } from '../config/permissions';

export class RolePermissionRepository extends BaseRepository<RolePermissionDoc> {
  protected collectionName = 'DASHBOARD_ROLE_PERMISSIONS' as const;

  async getByRole(role: Role): Promise<RolePermissionDoc | null> {
    return this.findOne({ role } as Filter<RolePermissionDoc>);
  }

  async getAll(): Promise<RolePermissionDoc[]> {
    return this.findMany({} as Filter<RolePermissionDoc>);
  }

  async setPermissions(role: Role, permissions: string[]): Promise<void> {
    const collection = this.getCollection();
    await collection.updateOne(
      { role } as Filter<RolePermissionDoc>,
      { $set: { role, permissions, updatedAt: new Date() } } as any,
      { upsert: true }
    );
  }
}
