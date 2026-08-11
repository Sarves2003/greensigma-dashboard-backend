import { BaseRepository } from './BaseRepository';
import { BrokerDetails, Portfolio } from '../types';
export declare class BrokerRepository extends BaseRepository<BrokerDetails> {
    protected collectionName: "BROKER_DETAILS";
    getBrokerByUserId(userId: string): Promise<BrokerDetails | null>;
    getBrokersByType(brokerType: string): Promise<BrokerDetails[]>;
    countBrokersByType(brokerType: string): Promise<number>;
    getConnectedUsersBetween(startDate: Date, endDate: Date, userIds?: string[]): Promise<BrokerDetails[]>;
    getRealBrokers(): Promise<BrokerDetails[]>;
    getPaperTradingUsers(): Promise<BrokerDetails[]>;
    getLatestAuthorizationsBetween(startDate: Date, endDate: Date): Promise<BrokerDetails[]>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: {
            date: string;
            type: string;
        };
        count: number;
    }[]>;
}
export declare class PortfolioRepository extends BaseRepository<Portfolio> {
    protected collectionName: "PORTFOLIO";
    getPortfolioByUserId(userId: string): Promise<Portfolio | null>;
    getPortfoliosBetween(startDate: Date, endDate: Date): Promise<Portfolio[]>;
    countPortfoliosByStatus(isInvested: boolean, startDate: Date, endDate: Date): Promise<number>;
    countAutomatedPortfolios(startDate: Date, endDate: Date): Promise<number>;
    countManualPortfolios(startDate: Date, endDate: Date): Promise<number>;
    getLiveRealPortfolios(): Promise<Portfolio[]>;
    getLiveRealPortfoliosWithHoldings(): Promise<Portfolio[]>;
    getPaperPortfolios(): Promise<Portfolio[]>;
    getTotalInvestmentCapital(startDate: Date, endDate: Date): Promise<number>;
    getTrendData(startDate: Date, endDate: Date): Promise<{
        _id: {
            date: string;
            status: string;
        };
        count: number;
    }[]>;
    getAverageInvestmentCapital(startDate: Date, endDate: Date): Promise<number>;
}
//# sourceMappingURL=BrokerRepository.d.ts.map