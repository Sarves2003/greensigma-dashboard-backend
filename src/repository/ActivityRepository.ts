import { BaseRepository } from './BaseRepository';
import { StockScore, BacktestResult, ETFScore, ETFBacktest, IntradayScore } from '../types';
import { Filter } from 'mongodb';

export class StockScoreRepository extends BaseRepository<StockScore> {
  protected collectionName = 'STOCK_SCORES' as const;

  async getScoresByUserId(userId: string): Promise<StockScore[]> {
    return this.findMany({ userId } as Filter<StockScore>, { sort: { savedDate: -1 } });
  }

  async getScoresBetween(startDate: Date, endDate: Date): Promise<StockScore[]> {
    return this.findMany({
      savedDate: { $gte: startDate, $lt: endDate },
    } as Filter<StockScore>);
  }

  async countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.count(filter as Filter<StockScore>);
  }

  async getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return collection.distinct('userId', filter);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    return this.aggregate<{
      _id: string;
      count: number;
      uniqueUserCount: number;
    }>(pipeline);
  }

  async getTopUsers(startDate: Date, endDate: Date, limit: number = 10) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: limit,
      },
    ];

    return this.aggregate<{ _id: string; count: number }>(pipeline);
  }
}

export class BacktestRepository extends BaseRepository<BacktestResult> {
  protected collectionName = 'BACKTEST_RESULTS' as const;

  async getBacktestsByUserId(userId: string): Promise<BacktestResult[]> {
    return this.findMany({ userId } as Filter<BacktestResult>, { sort: { savedDate: -1 } });
  }

  async getBacktestsBetween(startDate: Date, endDate: Date): Promise<BacktestResult[]> {
    return this.findMany({
      savedDate: { $gte: startDate, $lt: endDate },
    } as Filter<BacktestResult>);
  }

  async countBacktestsByStatus(status: string, startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
      status,
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.count(filter as Filter<BacktestResult>);
  }

  async getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return collection.distinct('userId', filter);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
            },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.date': 1 },
      },
    ];

    return this.aggregate<{
      _id: { date: string; status: string };
      count: number;
    }>(pipeline);
  }

  async getTopUsers(startDate: Date, endDate: Date, limit: number = 10) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Success'] }, 1, 0] },
          },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: limit,
      },
    ];

    return this.aggregate<{
      _id: string;
      count: number;
      successCount: number;
    }>(pipeline);
  }
}

export class ETFScoreRepository extends BaseRepository<ETFScore> {
  protected collectionName = 'ETF_SCORES' as const;

  async getScoresBetween(startDate: Date, endDate: Date): Promise<ETFScore[]> {
    return this.findMany({
      requestedAt: { $gte: startDate, $lt: endDate },
    } as Filter<ETFScore>);
  }

  async countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      requestedAt: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.count(filter as Filter<ETFScore>);
  }

  async getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      requestedAt: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return collection.distinct('userId', filter);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          requestedAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$requestedAt' },
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    return this.aggregate<{
      _id: string;
      count: number;
      uniqueUserCount: number;
    }>(pipeline);
  }
}

export class ETFBacktestRepository extends BaseRepository<ETFBacktest> {
  protected collectionName = 'ETF_BACKTEST' as const;

  async getBacktestsBetween(startDate: Date, endDate: Date): Promise<ETFBacktest[]> {
    return this.findMany({
      savedDate: { $gte: startDate, $lt: endDate },
    } as Filter<ETFBacktest>);
  }

  async countBacktestsByStatus(status: string, startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
      status,
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.count(filter as Filter<ETFBacktest>);
  }

  async getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return collection.distinct('userId', filter);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
            },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.date': 1 },
      },
    ];

    return this.aggregate<{
      _id: { date: string; status: string };
      count: number;
    }>(pipeline);
  }
}

export class IntradayScoreRepository extends BaseRepository<IntradayScore> {
  protected collectionName = 'INTRADAY_SCORES' as const;

  async getScoresBetween(startDate: Date, endDate: Date): Promise<IntradayScore[]> {
    return this.findMany({
      savedDate: { $gte: startDate, $lt: endDate },
    } as Filter<IntradayScore>);
  }

  async countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number> {
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.count(filter as Filter<IntradayScore>);
  }

  async getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]> {
    const collection = this.getCollection();
    const filter: any = {
      savedDate: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return collection.distinct('userId', filter);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          savedDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$savedDate' },
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    return this.aggregate<{
      _id: string;
      count: number;
      uniqueUserCount: number;
    }>(pipeline);
  }
}
