import { ObjectId } from 'mongodb';
import { BaseRepository } from './BaseRepository';
import { RealizedReturnsDoc } from '../types';

export interface RebalanceStats {
  rebalanceCount: number;
  stocksTraded: number;
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
      const uniqueDates = new Set(
        entries
          .filter((entry: any) => entry?.timestamp)
          .map((entry: any) => new Date(entry.timestamp).toISOString().slice(0, 10))
      );

      statsMap.set(doc.portfolioId.toString(), {
        rebalanceCount: uniqueDates.size,
        stocksTraded: entries.length,
      });
    }

    return statsMap;
  }
}
