import { BaseRepository } from './BaseRepository';
import { BrokerDetails, Portfolio } from '../types';
import { Filter } from 'mongodb';

export class BrokerRepository extends BaseRepository<BrokerDetails> {
  protected collectionName = 'BROKER_DETAILS' as const;

  async getBrokerByUserId(userId: string): Promise<BrokerDetails | null> {
    return this.findOne({ userId } as Filter<BrokerDetails>);
  }

  async getBrokersByType(brokerType: string): Promise<BrokerDetails[]> {
    return this.findMany({ borkrageType: brokerType } as Filter<BrokerDetails>);
  }

  async countBrokersByType(brokerType: string): Promise<number> {
    return this.count({ borkrageType: brokerType } as Filter<BrokerDetails>);
  }

  async getConnectedUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<BrokerDetails[]> {
    const filter: any = {
      createdAt: { $gte: startDate, $lt: endDate },
    };
    if (userIds && userIds.length > 0) {
      filter.userId = { $in: userIds };
    }
    return this.findMany(filter as Filter<BrokerDetails>);
  }

  async getRealBrokers(): Promise<BrokerDetails[]> {
    return this.findMany({
      borkrageType: { $in: ['kite', 'zebu'] },
      apiKey: { $exists: true },
    } as any);
  }

  async getPaperTradingUsers(): Promise<BrokerDetails[]> {
    return this.findMany({ borkrageType: 'paper_trade' } as Filter<BrokerDetails>);
  }

  async getLatestAuthorizationsBetween(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          accessTokenIssuedAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $sort: { accessTokenIssuedAt: -1 },
      },
    ];

    return this.aggregate<BrokerDetails>(pipeline);
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            type: '$borkrageType',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.date': 1 },
      },
    ];

    return this.aggregate<{
      _id: { date: string; type: string };
      count: number;
    }>(pipeline);
  }
}

export class PortfolioRepository extends BaseRepository<Portfolio> {
  protected collectionName = 'PORTFOLIO' as const;

  async getPortfolioByUserId(userId: string): Promise<Portfolio | null> {
    return this.findOne({ userId } as Filter<Portfolio>);
  }

  async getPortfoliosBetween(startDate: Date, endDate: Date): Promise<Portfolio[]> {
    return this.findMany({
      createdAt: { $gte: startDate, $lt: endDate },
    } as Filter<Portfolio>);
  }

  async countPortfoliosByStatus(isInvested: boolean, startDate: Date, endDate: Date): Promise<number> {
    return this.count({
      createdAt: { $gte: startDate, $lt: endDate },
      isInvested,
    } as Filter<Portfolio>);
  }

  async countAutomatedPortfolios(startDate: Date, endDate: Date): Promise<number> {
    return this.count({
      createdAt: { $gte: startDate, $lt: endDate },
      fromBacktest: true,
    } as Filter<Portfolio>);
  }

  async countManualPortfolios(startDate: Date, endDate: Date): Promise<number> {
    return this.count({
      createdAt: { $gte: startDate, $lt: endDate },
      $or: [{ fromBacktest: { $exists: false } }, { fromBacktest: false }],
    } as Filter<Portfolio>);
  }

  async getLiveRealPortfolios(): Promise<Portfolio[]> {
    return this.findMany({
      isInvested: true,
      borkrageType: { $in: ['kite', 'zebu'] },
    } as Filter<Portfolio>);
  }

  async getLiveRealPortfoliosWithHoldings(): Promise<Portfolio[]> {
    return this.findMany({
      isInvested: true,
      borkrageType: { $in: ['kite', 'zebu'] },
      stockDetails: { $exists: true, $ne: [], $type: 'array' },
    } as any);
  }

  async getPaperPortfolios(): Promise<Portfolio[]> {
    return this.findMany({
      borkrageType: 'paper_trade',
    } as Filter<Portfolio>);
  }

  async getTotalInvestmentCapital(startDate: Date, endDate: Date): Promise<number> {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          investmentCapital: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$investmentCapital' },
        },
      },
    ];

    const result = await this.aggregate<{ _id: null; total: number }>(pipeline);
    return result[0]?.total || 0;
  }

  async getTrendData(startDate: Date, endDate: Date) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            status: { $cond: ['$isInvested', 'Live', 'Draft'] },
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

  async getAverageInvestmentCapital(startDate: Date, endDate: Date): Promise<number> {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          investmentCapital: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          average: { $avg: '$investmentCapital' },
        },
      },
    ];

    const result = await this.aggregate<{ _id: null; average: number }>(pipeline);
    return result[0]?.average || 0;
  }
}
