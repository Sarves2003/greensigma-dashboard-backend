export interface HoldingPnl {
    tradingsymbol: string;
    exchange: string;
    quantity: number;
    entryPrice: number;
    lastPrice: number;
    investedValue: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
}
export interface PortfolioPnl {
    portfolioId: string;
    userId: string;
    portfolioName: string;
    createdAt?: Date;
    updatedAt?: Date;
    fromBacktest: boolean;
    investedValue: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
    rebalanceCount: number;
    stocksTraded: number;
    holdings: HoldingPnl[];
}
export declare class UnrealizedPnlService {
    private portfolioRepository;
    private stockListRepository;
    private realizedReturnsRepository;
    getLivePortfoliosPnl(): Promise<PortfolioPnl[]>;
    private computePortfolioPnl;
}
//# sourceMappingURL=UnrealizedPnlService.d.ts.map