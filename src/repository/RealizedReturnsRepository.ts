import { ObjectId } from 'mongodb';
import { BaseRepository } from './BaseRepository';
import { RealizedReturnsDoc } from '../types';

export interface RebalanceStats {
  rebalanceCount: number;
  stocksTraded: number;
  dates: string[]; // one ISO calendar-day string per unique rebalance day — lets callers count rebalances within an arbitrary date range client-side, the same way SIP events are period-scoped
}

export class RealizedReturnsRepository extends BaseRepository<RealizedReturnsDoc> {
  protected collectionName = 'REALIZED_RETURNS' as const;

  async getRebalanceStatsByPortfolioIds(portfolioIds: string[]): Promise<Map<string, RebalanceStats>> {
    const objectIds = portfolioIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const statsMap = new Map<string, RebalanceStats>();

    if (objectIds.length === 0) {
      return statsMap;
    }

    const docs = await this.findMany({ portfolioId: { $in: objectIds } } as any);

    for (const doc of docs as any[]) {
      const entries = doc.realizedReturns || [];
      const uniqueDates = new Set<string>(
        entries
          .filter((entry: any) => entry?.timestamp)
          .map((entry: any) => new Date(entry.timestamp).toISOString().slice(0, 10))
      );

      statsMap.set(doc.portfolioId.toString(), {
        rebalanceCount: uniqueDates.size,
        stocksTraded: entries.length,
        dates: [...uniqueDates],
      });
    }

    return statsMap;
  }
}
