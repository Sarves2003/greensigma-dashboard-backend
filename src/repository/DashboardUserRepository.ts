import { BaseRepository } from './BaseRepository';
import { DashboardUser } from '../types';
import { Filter, ObjectId } from 'mongodb';

export class DashboardUserRepository extends BaseRepository<DashboardUser> {
  protected collectionName = 'DASHBOARD_USERS' as const;

  async getByEmail(email: string): Promise<DashboardUser | null> {
    return this.findOne({ email } as Filter<DashboardUser>);
  }

  async getById(id: string): Promise<DashboardUser | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.findOne({ _id: new ObjectId(id) } as any);
  }

  async listAll(): Promise<DashboardUser[]> {
    return this.findMany({} as Filter<DashboardUser>, { sort: { createdAt: -1 } });
  }

  async createUser(user: DashboardUser): Promise<string> {
    return this.insertOne(user);
  }

  async updateUser(id: string, update: Partial<DashboardUser>): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.updateOne({ _id: new ObjectId(id) } as any, { $set: update } as any);
  }

  async deleteUser(id: string): Promise<number> {
    if (!ObjectId.isValid(id)) return 0;
    return this.deleteOne({ _id: new ObjectId(id) } as any);
  }

  async touchLastLogin(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await this.updateOne({ _id: new ObjectId(id) } as any, { $set: { lastLoginAt: new Date() } } as any);
  }

  async countAll(): Promise<number> {
    return this.count({} as Filter<DashboardUser>);
  }
}
