import { BaseRepository } from './BaseRepository';
import { User } from '../types';
import { Filter } from 'mongodb';
export declare class UserRepository extends BaseRepository<User> {
    protected collectionName: "USERS";
    getUserById(userId: string): Promise<User | null>;
    getUsersByIds(userIds: string[]): Promise<User[]>;
    getUserByEmail(email: string): Promise<User | null>;
    getUserByMobile(mobile: string): Promise<User | null>;
    getUserByWhatsApp(whatsappNumber: string): Promise<User | null>;
    getUsersByType(type: string): Promise<User[]>;
    getUsersByState(state: string): Promise<User[]>;
    getUsersByDistrict(district: string): Promise<User[]>;
    getUsersByReferralCode(referalCode: string): Promise<User[]>;
    getUsersCreatedBetween(startDate: Date, endDate: Date): Promise<User[]>;
    countUsersByType(type: string): Promise<number>;
    countTotalUsers(): Promise<number>;
    getDistinctStates(): Promise<string[]>;
    getDistinctDistricts(): Promise<string[]>;
    getDistinctReferralCodes(): Promise<string[]>;
    searchUsers(query: string): Promise<User[]>;
    getUsersWithPagination(filter: Filter<User>, page: number, pageSize: number): Promise<{
        users: User[];
        total: number;
    }>;
}
//# sourceMappingURL=UserRepository.d.ts.map