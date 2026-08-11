"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolePermissionRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
class RolePermissionRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'DASHBOARD_ROLE_PERMISSIONS';
    }
    async getByRole(role) {
        return this.findOne({ role });
    }
    async getAll() {
        return this.findMany({});
    }
    async setPermissions(role, permissions) {
        const collection = this.getCollection();
        await collection.updateOne({ role }, { $set: { role, permissions, updatedAt: new Date() } }, { upsert: true });
    }
}
exports.RolePermissionRepository = RolePermissionRepository;
//# sourceMappingURL=RolePermissionRepository.js.map