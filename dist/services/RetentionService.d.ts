import { FilterOptions } from '../types';
export declare class RetentionService {
    private userRepo;
    private loginRepo;
    private stockScoreRepo;
    private backtestRepo;
    private etfScoreRepo;
    private etfBacktestRepo;
    private intradayRepo;
    private brokerRepo;
    private portfolioRepo;
    getCohortRetention(filters: FilterOptions, granularity: 'monthly' | 'quarterly' | 'yearly'): Promise<any>;
    private generatePeriodKeys;
    private getCohortKey;
    private parseCohortKey;
    private addPeriods;
    getKPIComparison(filters: FilterOptions): Promise<any>;
    private getActiveUsersForPeriod;
}
//# sourceMappingURL=RetentionService.d.ts.map