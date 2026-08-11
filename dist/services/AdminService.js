"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const DashboardUserRepository_1 = require("../repository/DashboardUserRepository");
const RolePermissionRepository_1 = require("../repository/RolePermissionRepository");
const permissions_1 = require("../config/permissions");
const AuthService_1 = require("./AuthService");
class AdminService {
    constructor() {
        this.userRepo = new DashboardUserRepository_1.DashboardUserRepository();
        this.roleRepo = new RolePermissionRepository_1.RolePermissionRepository();
        this.authService = new AuthService_1.AuthService();
    }
    async toView(user) {
        const effectivePermissions = await this.authService.getEffectivePermissions(user);
        return {
            ...(0, AuthService_1.toSafeUser)(user),
            permissionOverrides: user.permissionOverrides,
            effectivePermissions,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
        };
    }
    async listUsers() {
        const users = await this.userRepo.listAll();
        return Promise.all(users.map((user) => this.toView(user)));
    }
    async createUser(input) {
        const email = input.email.toLowerCase().trim();
        if (!permissions_1.ROLES.includes(input.role))
            throw new Error('Invalid role');
        if (!input.password || input.password.length < 8)
            throw new Error('Password must be at least 8 characters');
        const existing = await this.userRepo.getByEmail(email);
        if (existing)
            throw new Error('A user with this email already exists');
        const passwordHash = await bcryptjs_1.default.hash(input.password, 10);
        const doc = {
            name: input.name.trim(),
            email,
            passwordHash,
            role: input.role,
            active: true,
            createdAt: new Date(),
        };
        const id = await this.userRepo.createUser(doc);
        const created = await this.userRepo.getById(id);
        return this.toView(created);
    }
    async updateUser(id, updates) {
        const user = await this.userRepo.getById(id);
        if (!user)
            throw new Error('User not found');
        if (updates.role && !permissions_1.ROLES.includes(updates.role))
            throw new Error('Invalid role');
        if (updates.permissionOverrides) {
            const keys = [...(updates.permissionOverrides.grant ?? []), ...(updates.permissionOverrides.revoke ?? [])];
            for (const key of keys) {
                if (!(0, permissions_1.isValidPermissionKey)(key))
                    throw new Error(`Unknown permission key: ${key}`);
            }
        }
        if (updates.role === undefined && user.role === 'owner' && updates.active === false) {
            const users = await this.userRepo.listAll();
            const ownerCount = users.filter((u) => u.role === 'owner' && u.active).length;
            if (ownerCount <= 1)
                throw new Error('Cannot deactivate the last remaining Owner account');
        }
        const set = { updatedAt: new Date() };
        if (updates.name !== undefined)
            set.name = updates.name.trim();
        if (updates.role !== undefined)
            set.role = updates.role;
        if (updates.active !== undefined)
            set.active = updates.active;
        if (updates.permissionOverrides !== undefined)
            set.permissionOverrides = updates.permissionOverrides;
        await this.userRepo.updateUser(id, set);
        const updated = await this.userRepo.getById(id);
        return this.toView(updated);
    }
    async deleteUser(id) {
        const user = await this.userRepo.getById(id);
        if (!user)
            throw new Error('User not found');
        if (user.role === 'owner') {
            const users = await this.userRepo.listAll();
            const ownerCount = users.filter((u) => u.role === 'owner' && u.active).length;
            if (ownerCount <= 1)
                throw new Error('Cannot delete the last remaining Owner account');
        }
        await this.userRepo.deleteUser(id);
    }
    async resetPassword(id, newPassword) {
        if (!newPassword || newPassword.length < 8)
            throw new Error('Password must be at least 8 characters');
        const user = await this.userRepo.getById(id);
        if (!user)
            throw new Error('User not found');
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await this.userRepo.updateUser(id, { passwordHash, updatedAt: new Date() });
    }
    getPermissionRegistry() {
        return { permissions: permissions_1.PERMISSIONS, roles: permissions_1.ROLES, roleLabels: permissions_1.ROLE_LABELS };
    }
    async listRolePermissions() {
        const result = {};
        for (const role of permissions_1.ROLES) {
            const doc = await this.roleRepo.getByRole(role);
            result[role] = doc?.permissions ?? permissions_1.DEFAULT_ROLE_PERMISSIONS[role];
        }
        return result;
    }
    async setRolePermissions(role, permissions) {
        if (!permissions_1.ROLES.includes(role))
            throw new Error('Invalid role');
        for (const key of permissions) {
            if (!(0, permissions_1.isValidPermissionKey)(key))
                throw new Error(`Unknown permission key: ${key}`);
        }
        await this.roleRepo.setPermissions(role, permissions);
    }
}
exports.AdminService = AdminService;
//# sourceMappingURL=AdminService.js.map