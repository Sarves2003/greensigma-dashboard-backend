import { BaseRepository } from './BaseRepository';
import { User } from '../types';
import { Filter, ObjectId } from 'mongodb';

export class UserRepository extends BaseRepository<User> {
  protected collectionName = 'USERS' as const;

  async getUserById(userId: string): Promise<User | null> {
    return this.findOne({ _id: userId } as Filter<User>);
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    const objectIds = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (objectIds.length === 0) return [];
    return this.findMany({ _id: { $in: objectIds } } as any);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.findOne({ email } as Filter<User>);
  }

  async getUserByMobile(mobile: string): Promise<User | null> {
    return this.findOne({ mobile } as Filter<User>);
  }

  async getUserByWhatsApp(whatsappNumber: string): Promise<User | null> {
    return this.findOne({ whatsappNumber } as Filter<User>);
  }

  async getUsersByType(type: string): Promise<User[]> {
    return this.findMany({ type } as Filter<User>);
  }

  async getUsersByState(state: string): Promise<User[]> {
    return this.findMany({ state } as Filter<User>);
  }

  async getUsersByDistrict(district: string): Promise<User[]> {
    return this.findMany({ district } as Filter<User>);
  }

  async getUsersByReferralCode(referalCode: string): Promise<User[]> {
    return this.findMany({ referalCode } as Filter<User>);
  }

  async getUsersCreatedBetween(startDate: Date, endDate: Date): Promise<User[]> {
    return this.findMany({
      createdOn: { $gte: startDate, $lt: endDate },
    } as Filter<User>);
  }

  async countUsersByType(type: string): Promise<number> {
    return this.count({ type } as Filter<User>);
  }

  async countTotalUsers(): Promise<number> {
    return this.count({} as Filter<User>);
  }

  async getDistinctStates(): Promise<string[]> {
    const collection = this.getCollection();
    const states = await collection.distinct('state', {});
    return states.filter((s): s is string => typeof s === 'string' && s !== null);
  }

  async getDistinctDistricts(): Promise<string[]> {
    const collection = this.getCollection();
    const districts = await collection.distinct('district', {});
    return districts.filter((d): d is string => typeof d === 'string' && d !== null);
  }

  async getDistinctReferralCodes(): Promise<string[]> {
    const collection = this.getCollection();
    const codes = await collection.distinct('referalCode', {});
    return codes.filter((c): c is string => typeof c === 'string' && c !== null);
  }

  async searchUsers(query: string): Promise<User[]> {
    const searchFilter = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { mobile: { $regex: query, $options: 'i' } },
        { whatsappNumber: { $regex: query, $options: 'i' } },
      ],
    } as Filter<User>;

    return this.findMany(searchFilter, { limit: 20 });
  }

  async getUsersWithPagination(
    filter: Filter<User>,
    page: number,
    pageSize: number
  ): Promise<{ users: User[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const users = await this.findMany(filter, { skip, limit: pageSize, sort: { createdOn: -1 } });
    const total = await this.count(filter);
    return { users, total };
  }
}
