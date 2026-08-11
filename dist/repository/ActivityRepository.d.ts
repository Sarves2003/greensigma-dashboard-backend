import { BaseRepository } from './BaseRepository';
import { StockScore, BacktestResult, ETFScore, ETFBacktest, IntradayScore } from '../types';
export declare class StockScoreRepository extends BaseRepository<StockScore> {
    protected collectionName: "STOCK_SCORES";
    getScoresByUserId(userId: string): Promise<StockScore[]>;
    getScoresBetween(startDate: Date, endDate: Date): Promise<StockScore[]>;
    countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: string;
        count: number;
        uniqueUserCount: number;
    }[]>;
    getTopUsers(startDate: Date, endDate: Date, limit?: number): Promise<{
        _id: string;
        count: number;
    }[]>;
}
export declare class BacktestRepository extends BaseRepository<BacktestResult> {
    protected collectionName: "BACKTEST_RESULTS";
    getBacktestsByUserId(userId: string): Promise<BacktestResult[]>;
    getBacktestsBetween(startDate: Date, endDate: Date): Promise<BacktestResult[]>;
    countBacktestsByStatus(status: string, startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: {
            date: string;
            status: string;
        };
        count: number;
    }[]>;
    getTopUsers(startDate: Date, endDate: Date, limit?: number): Promise<{
        _id: string;
        count: number;
        successCount: number;
    }[]>;
}
export declare class ETFScoreRepository extends BaseRepository<ETFScore> {
    protected collectionName: "ETF_SCORES";
    getScoresBetween(startDate: Date, endDate: Date): Promise<ETFScore[]>;
    countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: string;
        count: number;
        uniqueUserCount: number;
    }[]>;
}
export declare class ETFBacktestRepository extends BaseRepository<ETFBacktest> {
    protected collectionName: "ETF_BACKTEST";
    getBacktestsBetween(startDate: Date, endDate: Date): Promise<ETFBacktest[]>;
    countBacktestsByStatus(status: string, startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: {
            date: string;
            status: string;
        };
        count: number;
    }[]>;
}
export declare class IntradayScoreRepository extends BaseRepository<IntradayScore> {
    protected collectionName: "INTRADAY_SCORES";
    getScoresBetween(startDate: Date, endDate: Date): Promise<IntradayScore[]>;
    countScoresBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<number>;
    getUniqueUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<string[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: string;
        count: number;
        uniqueUserCount: number;
    }[]>;
}
//# sourceMappingURL=ActivityRepository.d.ts.map