"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
exports.toSafeUser = toSafeUser;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const DashboardUserRepository_1 = require("../repository/DashboardUserRepository");
const RolePermissionRepository_1 = require("../repository/RolePermissionRepository");
const permissions_1 = require("../config/permissions");
const JWT_EXPIRY = '12h';
function toSafeUser(user) {
    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
    };
}
class AuthService {
    constructor() {
        this.userRepo = new DashboardUserRepository_1.DashboardUserRepository();
        this.roleRepo = new RolePermissionRepository_1.RolePermissionRepository();
    }
    get jwtSecret() {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new Error('JWT_SECRET environment variable is not set');
        return secret;
    }
    // Seeds default role -> permission mappings on first boot (idempotent, never
    // overwrites permissions an Owner has already customized), and creates the
    // very first Owner account from env vars if no dashboard users exist yet.
    async ensureSeeded() {
        for (const role of permissions_1.ROLES) {
            const existing = await this.roleRepo.getByRole(role);
            if (!existing) {
                await this.roleRepo.setPermissions(role, permissions_1.DEFAULT_ROLE_PERMISSIONS[role]);
            }
        }
        const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
        const ownerPassword = process.env.INITIAL_OWNER_PASSWORD;
        if (ownerEmail && ownerPassword) {
            const existing = await this.userRepo.getByEmail(ownerEmail.toLowerCase().trim());
            if (!existing) {
                const passwordHash = await bcryptjs_1.default.hash(ownerPassword, 10);
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
    async login(email, password) {
        const user = await this.userRepo.getByEmail(email.toLowerCase().trim());
        if (!user || !user.active)
            return null;
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid)
            return null;
        await this.userRepo.touchLastLogin(String(user._id));
        const token = jsonwebtoken_1.default.sign({ sub: String(user._id), email: user.email, role: user.role }, this.jwtSecret, { expiresIn: JWT_EXPIRY });
        const permissions = await this.getEffectivePermissions(user);
        return { token, user: toSafeUser(user), permissions };
    }
    verifyToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.jwtSecret);
        }
        catch {
            return null;
        }
    }
    async getUserById(id) {
        return this.userRepo.getById(id);
    }
    async getEffectivePermissions(user) {
        const roleDoc = await this.roleRepo.getByRole(user.role);
        const base = new Set(roleDoc?.permissions ?? permissions_1.DEFAULT_ROLE_PERMISSIONS[user.role]);
        for (const key of user.permissionOverrides?.grant ?? [])
            base.add(key);
        for (const key of user.permissionOverrides?.revoke ?? [])
            base.delete(key);
        return Array.from(base);
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.userRepo.getById(userId);
        if (!user)
            return false;
        const valid = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!valid)
            return false;
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await this.userRepo.updateUser(userId, { passwordHash, updatedAt: new Date() });
        return true;
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map