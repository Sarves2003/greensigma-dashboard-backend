import { BaseRepository } from './BaseRepository';
import { RealizedReturnsDoc } from '../types';
export interface RebalanceStats {
    rebalanceCount: number;
    stocksTraded: number;
}
export declare class RealizedReturnsRepository extends BaseRepository<RealizedReturnsDoc> {
    protected collectionName: "REALIZED_RETURNS";
    getRebalanceStatsByPortfolioIds(portfolioIds: string[]): Promise<Map<string, RebalanceStats>>;
}
//# sourceMappingURL=RealizedReturnsRepository.d.ts.map