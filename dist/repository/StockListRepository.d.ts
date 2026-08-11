import { BaseRepository } from './BaseRepository';
import { StockListItem } from '../types';
export declare class StockListRepository extends BaseRepository<StockListItem> {
    protected collectionName: "STOCK_LISTS";
    getLastPriceMap(tradingsymbols: string[]): Promise<Map<string, number>>;
}
//# sourceMappingURL=StockListRepository.d.ts.map