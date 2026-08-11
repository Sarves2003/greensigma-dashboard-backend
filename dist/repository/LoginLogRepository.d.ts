import { BaseRepository } from './BaseRepository';
import { LoginLog } from '../types';
export declare class LoginLogRepository extends BaseRepository<LoginLog> {
    protected collectionName: "LOGIN_LOGS";
    getLoginsByUserId(userId: string): Promise<LoginLog[]>;
    getLoginsBetween(startDate: Date, endDate: Date): Promise<LoginLog[]>;
    getSuccessfulLogins(startDate: Date, endDate: Date): Promise<LoginLog[]>;
    getFailedLogins(startDate: Date, endDate: Date): Promise<LoginLog[]>;
    countSuccessfulLogins(startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    countFailedLogins(startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueLoginUsers(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getLoginsByChannel(channel: string, startDate: Date, endDate: Date): Promise<LoginLog[]>;
    getLastLoginByUser(userId: string): Promise<LoginLog | null>;
    getLoginTrendData(startDate: Date, endDate: Date): Promise<{
        _id: string;
        count: number;
    }[]>;
    getHourlyLoginTrend(startDate: Date, endDate: Date): Promise<{
        _id: number;
        count: number;
    }[]>;
}
//# sourceMappingURL=LoginLogRepository.d.ts.map