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
export interface SipEvent {
    date: string;
    amount: number;
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
    investmentCapital: number | null;
    freeCash: number;
    lockedFreeCash: number;
    sipEvents: SipEvent[];
    joinedDate: string | null;
}
export declare class UnrealizedPnlService {
    private portfolioRepository;
    private stockListRepository;
    private realizedReturnsRepository;
    private userRepository;
    getLivePortfoliosPnl(): Promise<PortfolioPnl[]>;
    private computePortfolioPnl;
}
//# sourceMappingURL=UnrealizedPnlService.d.ts.map