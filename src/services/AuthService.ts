import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DashboardUserRepository } from '../repository/DashboardUserRepository';
import { RolePermissionRepository } from '../repository/RolePermissionRepository';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, Role } from '../config/permissions';
import { DashboardUser } from '../types';

const JWT_EXPIRY = '12h';

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

export function toSafeUser(user: DashboardUser): SafeUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export class AuthService {
  private userRepo = new DashboardUserRepository();
  private roleRepo = new RolePermissionRepository();

  private get jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET environment variable is not set');
    return secret;
  }

  // Seeds default role -> permission mappings on first boot (idempotent, never
  // overwrites permissions an Owner has already customized), and creates the
  // very first Owner account from env vars if no dashboard users exist yet.
  async ensureSeeded(): Promise<void> {
    for (const role of ROLES) {
      const existing = await this.roleRepo.getByRole(role);
      if (!existing) {
        await this.roleRepo.setPermissions(role, DEFAULT_ROLE_PERMISSIONS[role]);
      }
    }

    const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
    const ownerPassword = process.env.INITIAL_OWNER_PASSWORD;
    if (ownerEmail && ownerPassword) {
      const existing = await this.userRepo.getByEmail(ownerEmail.toLowerCase().trim());
      if (!existing) {
        const passwordHash = await bcrypt.hash(ownerPassword, 10);
        await this.userRepo.createUser({
          name: 'Owner',
          email: ownerEmail.toLowerCase().trim(),
          passwordHash,
          role: 'owner',
          active: true,
          createdAt: new Date(),
        });
        console.log(`Seeded initial Owner account: ${ownerEmail.toLowerCase().trim()}`);
      }
    }
  }

  async login(email: string, password: string): Promise<{ token: string; user: SafeUser; permissions: string[] } | null> {
    const user = await this.userRepo.getByEmail(email.toLowerCase().trim());
    if (!user || !user.active) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    await this.userRepo.touchLastLogin(String(user._id));

    const token = jwt.sign(
      { sub: String(user._id), email: user.email, role: user.role } as AuthTokenPayload,
      this.jwtSecret,
      { expiresIn: JWT_EXPIRY }
    );

    const permissions = await this.getEffectivePermissions(user);
    return { token, user: toSafeUser(user), permissions };
  }

  verifyToken(token: string): AuthTokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
    } catch {
      return null;
    }
  }

  async getUserById(id: string): Promise<DashboardUser | null> {
    return this.userRepo.getById(id);
  }

  async getEffectivePermissions(user: DashboardUser): Promise<string[]> {
    const roleDoc = await this.roleRepo.getByRole(user.role);
    const base = new Set(roleDoc?.permissions ?? DEFAULT_ROLE_PERMISSIONS[user.role]);
    for (const key of user.permissionOverrides?.grant ?? []) base.add(key);
    for (const key of user.permissionOverrides?.revoke ?? []) base.delete(key);
    return Array.from(base);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepo.getById(userId);
    if (!user) return false;
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return false;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.updateUser(userId, { passwordHash, updatedAt: new Date() });
    return true;
  }
}
