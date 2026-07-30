import { BaseRepository } from './BaseRepository';
import { LoginLog } from '../types';
import { Filter, ObjectId } from 'mongodb';

export class LoginLogRepository extends BaseRepository<LoginLog> {
  protected collectionName = 'LOGIN_LOGS' as const;

  async getLoginsByUserId(userId: string): Promise<LoginLog[]> {
    return this.findMany({ userId } as Filter<LoginLog>, { sort: { loginTime: -1 } });
  }

  async getLoginsBetween(startDate: Date, endDate: Date): Promise<LoginLog[]> {
    return this.findMany({
      loginTime: { $gte: startDate, $lt: endDate },
    } as Filter<LoginLog>);
  }

  async getSuccessfulLogins(startDate: Date, endDate: Date): Promise<LoginLog[]> {
    return this.findMany({
      loginTime: { $gte: startDate, $lt: endDate },
      status: 'SUCCESS',
    } as Filter<LoginLog>);
  }

  async getFailedLogins(startDate: Date, endDate: Date): Promise<LoginLog[]> {
    return this.findMany({
      loginTime: { $gte: startDate, $lt: endDate },
      status: 'FAILURE',
    } as Filter<LoginLog>);
  }

  async countSuccessfulLogins(startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      loginTime: { $gte: startDate, $lt: endDate },
      status: 'SUCCESS',
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds.map(id => new ObjectId(id)) };
    }
    return this.count(filter as Filter<LoginLog>);
  }

  async countFailedLogins(startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      loginTime: { $gte: startDate, $lt: endDate },
      status: 'FAILURE',
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds.map(id => new ObjectId(id)) };
    }
    return this.count(filter as Filter<LoginLog>);
  }

  async getUniqueLoginUsers(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      loginTime: { $gte: startDate, $lt: endDate },
      status: 'SUCCESS',
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds.map(id => new ObjectId(id)) };
    }
    return collection.distinct('userId', filter);
  }

  async getLoginsByChannel(channel: string, startDate: Date, endDate: Date): Promise<LoginLog[]> {
    return this.findMany({
      loginTime: { $gte: startDate, $lt: endDate },
      channel,
    } as Filter<LoginLog>);
  }

  async getLastLoginByUser(userId: string): Promise<LoginLog | null> {
    return this.findOne({
      userId,
      status: 'SUCCESS',
    } as Filter<LoginLog>);
  }

  async getLoginTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          loginTime: { $gte: startDate, $lt: endDate },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$loginTime' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    return this.aggregate<{ _id: string; count: number }>(pipeline);
  }

  async getHourlyLoginTrend(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          loginTime: { $gte: startDate, $lt: endDate },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: { $hour: '$loginTime' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    return this.aggregate<{ _id: number; count: number }>(pipeline);
  }
}
