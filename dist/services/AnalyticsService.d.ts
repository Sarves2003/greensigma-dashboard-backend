import { FilterOptions, KPIResponse, ChartDataPoint, User } from '../types';
export declare class AnalyticsService {
    private userRepo;
    private loginRepo;
    private stockScoreRepo;
    private backtestRepo;
    private etfScoreRepo;
    private etfBacktestRepo;
    private intradayRepo;
    private brokerRepo;
    private portfolioRepo;
    private buildUserFilter;
    private getFilteredUserIds;
    getNewUsers(filters: FilterOptions): Promise<KPIResponse>;
    getActiveUsers(filters: FilterOptions): Promise<KPIResponse>;
    getSuccessfulLogins(filters: FilterOptions): Promise<KPIResponse>;
    getFailedLogins(filters: FilterOptions): Promise<KPIResponse>;
    getLoginSuccessRate(filters: FilterOptions): Promise<KPIResponse>;
    getStockScores(filters: FilterOptions): Promise<KPIResponse>;
    getStockBacktests(filters: FilterOptions): Promise<KPIResponse>;
    getETFScores(filters: FilterOptions): Promise<KPIResponse>;
    getETFBacktests(filters: FilterOptions): Promise<KPIResponse>;
    getPaperPortfolio(filters: FilterOptions): Promise<KPIResponse>;
    getLiveRealPortfolio(filters: FilterOptions): Promise<KPIResponse>;
    getBrokerConnected(filters: FilterOptions): Promise<KPIResponse>;
    getIntradayScores(filters: FilterOptions): Promise<KPIResponse>;
    getDailyTrend(filters: FilterOptions): Promise<ChartDataPoint[]>;
    getUserTypeDistribution(filters: FilterOptions): Promise<ChartDataPoint[]>;
    getStateDistribution(filters: FilterOptions): Promise<ChartDataPoint[]>;
    getReferralDistribution(filters: FilterOptions): Promise<ChartDataPoint[]>;
    getLivePortfolioUsers(filters: FilterOptions): Promise<User[]>;
    getPaperPortfolioUsers(filters: FilterOptions): Promise<User[]>;
    getStockScoreUsers(filters: FilterOptions): Promise<User[]>;
}
//# sourceMappingURL=AnalyticsService.d.ts.map