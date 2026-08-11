import { FilterOptions } from '../types';
export declare class PortfolioAnalyticsService {
    private portfolioRepo;
    private userRepo;
    getPortfolioMetrics(filters: FilterOptions): Promise<any>;
    getPortfolioTrend(filters: FilterOptions): Promise<any[]>;
    getPortfolioTypeBreakdown(filters: FilterOptions): Promise<any[]>;
    getTopInvestors(filters: FilterOptions, limit?: number, offset?: number): Promise<any>;
    getUserPortfolios(userId: string, filters: FilterOptions): Promise<any[]>;
    private getFilteredUserIds;
}
//# sourceMappingURL=PortfolioAnalyticsService.d.ts.map