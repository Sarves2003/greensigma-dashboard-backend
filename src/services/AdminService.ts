import bcrypt from 'bcryptjs';
import { DashboardUserRepository } from '../repository/DashboardUserRepository';
import { RolePermissionRepository } from '../repository/RolePermissionRepository';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, ROLE_LABELS, Role, isValidPermissionKey } from '../config/permissions';
import { DashboardUser } from '../types';
import { AuthService, SafeUser, toSafeUser } from './AuthService';

export interface DashboardUserView extends SafeUser {
  permissionOverrides?: { grant?: string[]; revoke?: string[] };
  effectivePermissions: string[];
  createdAt: Date;
  lastLoginAt?: Date;
}

export class AdminService {
  private userRepo = new DashboardUserRepository();
  private roleRepo = new RolePermissionRepository();
  private authService = new AuthService();

  private async toView(user: DashboardUser): Promise<DashboardUserView> {
    const effectivePermissions = await this.authService.getEffectivePermissions(user);
    return {
      ...toSafeUser(user),
      permissionOverrides: user.permissionOverrides,
      effectivePermissions,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async listUsers(): Promise<DashboardUserView[]> {
    const users = await this.userRepo.listAll();
    return Promise.all(users.map((user) => this.toView(user)));
  }

  async createUser(input: { name: string; email: string; password: string; role: Role }): Promise<DashboardUserView> {
    const email = input.email.toLowerCase().trim();
    if (!ROLES.includes(input.role)) throw new Error('Invalid role');
    if (!input.password || input.password.length < 8) throw new Error('Password must be at least 8 characters');

    const existing = await this.userRepo.getByEmail(email);
    if (existing) throw new Error('A user with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const doc: DashboardUser = {
      name: input.name.trim(),
      email,
      passwordHash,
      role: input.role,
      active: true,
      createdAt: new Date(),
    };
    const id = await this.userRepo.createUser(doc);
    const created = await this.userRepo.getById(id);
    return this.toView(created!);
  }

  async updateUser(
    id: string,
    updates: { name?: string; role?: Role; active?: boolean; permissionOverrides?: { grant?: string[]; revoke?: string[] } }
  ): Promise<DashboardUserView> {
    const user = await this.userRepo.getById(id);
    if (!user) throw new Error('User not found');

    if (updates.role && !ROLES.includes(updates.role)) throw new Error('Invalid role');
    if (updates.permissionOverrides) {
      const keys = [...(updates.permissionOverrides.grant ?? []), ...(updates.permissionOverrides.revoke ?? [])];
      for (const key of keys) {
        if (!isValidPermissionKey(key)) throw new Error(`Unknown permission key: ${key}`);
      }
    }
    if (updates.role === undefined && user.role === 'owner' && updates.active === false) {
      const users = await this.userRepo.listAll();
      const ownerCount = users.filter((u) => u.role === 'owner' && u.active).length;
      if (ownerCount <= 1) throw new Error('Cannot deactivate the last remaining Owner account');
    }

    const set: Partial<DashboardUser> = { updatedAt: new Date() };
    if (updates.name !== undefined) set.name = updates.name.trim();
    if (updates.role !== undefined) set.role = updates.role;
    if (updates.active !== undefined) set.active = updates.active;
    if (updates.permissionOverrides !== undefined) set.permissionOverrides = updates.permissionOverrides;

    await this.userRepo.updateUser(id, set);
    const updated = await this.userRepo.getById(id);
    return this.toView(updated!);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepo.getById(id);
    if (!user) throw new Error('User not found');
    if (user.role === 'owner') {
      const users = await this.userRepo.listAll();
      const ownerCount = users.filter((u) => u.role === 'owner' && u.active).length;
      if (ownerCount <= 1) throw new Error('Cannot delete the last remaining Owner account');
    }
    await this.userRepo.deleteUser(id);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) throw new Error('Password must be at least 8 characters');
    const user = await this.userRepo.getById(id);
    if (!user) throw new Error('User not found');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.updateUser(id, { passwordHash, updatedAt: new Date() });
  }

  getPermissionRegistry() {
    return { permissions: PERMISSIONS, roles: ROLES, roleLabels: ROLE_LABELS };
  }

  async listRolePermissions(): Promise<Record<Role, string[]>> {
    const result = {} as Record<Role, string[]>;
    for (const role of ROLES) {
      const doc = await this.roleRepo.getByRole(role);
      result[role] = doc?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role];
    }
    return result;
  }

  async setRolePermissions(role: Role, permissions: string[]): Promise<void> {
    if (!ROLES.includes(role)) throw new Error('Invalid role');
    for (const key of permissions) {
      if (!isValidPermissionKey(key)) throw new Error(`Unknown permission key: ${key}`);
    }
    await this.roleRepo.setPermissions(role, permissions);
  }
}
