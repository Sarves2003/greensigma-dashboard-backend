import { BaseRepository } from './BaseRepository';
import { StockListItem } from '../types';

export class StockListRepository extends BaseRepository<StockListItem> {
  protected collectionName = 'STOCK_LISTS' as const;

  async getLastPriceMap(tradingsymbols: string[]): Promise<Map<string, number>> {
    if (tradingsymbols.length === 0) {
      return new Map();
    }

    const items = await this.findMany({
      tradingsymbol: { $in: tradingsymbols },
    } as any);

    const priceMap = new Map<string, number>();
    for (const item of items) {
      priceMap.set(item.tradingsymbol, item.last_price);
    }
    return priceMap;
  }
}
