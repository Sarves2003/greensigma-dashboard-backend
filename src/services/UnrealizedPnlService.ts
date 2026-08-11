import { PortfolioRepository } from '../repository/BrokerRepository';
import { StockListRepository } from '../repository/StockListRepository';
import { RealizedReturnsRepository, RebalanceStats } from '../repository/RealizedReturnsRepository';
import { StockHolding } from '../types';

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

export class UnrealizedPnlService {
  private portfolioRepository = new PortfolioRepository();
  private stockListRepository = new StockListRepository();
  private realizedReturnsRepository = new RealizedReturnsRepository();

  async getLivePortfoliosPnl(): Promise<PortfolioPnl[]> {
    const portfolios = await this.portfolioRepository.getLiveRealPortfoliosWithHoldings();

    const allSymbols = new Set<string>();
    for (const portfolio of portfolios) {
      for (const holding of portfolio.stockDetails || []) {
        if (holding.tradingsymbol) {
          allSymbols.add(holding.tradingsymbol);
        }
      }
    }

    const portfolioIds = portfolios.map((p: any) => p._id?.toString()).filter(Boolean);

    const [lastPriceMap, rebalanceStatsMap] = await Promise.all([
      this.stockListRepository.getLastPriceMap([...allSymbols]),
      this.realizedReturnsRepository.getRebalanceStatsByPortfolioIds(portfolioIds),
    ]);

    return portfolios.map((portfolio: any) =>
      this.computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap)
    );
  }

  private computePortfolioPnl(
    portfolio: any,
    lastPriceMap: Map<string, number>,
    rebalanceStatsMap: Map<string, RebalanceStats>
  ): PortfolioPnl {
    const holdings: HoldingPnl[] = (portfolio.stockDetails as StockHolding[]).map((stock) => {
      const quantity = stock.quantity || 0;
      const entryPrice = stock.price || 0;
      const lastPrice = lastPriceMap.get(stock.tradingsymbol) ?? entryPrice;
      const investedValue = quantity * entryPrice;
      const currentValue = quantity * lastPrice;
      const pnl = currentValue - investedValue;

      return {
        tradingsymbol: stock.tradingsymbol,
        exchange: stock.exchange,
        quantity,
        entryPrice,
        lastPrice,
        investedValue,
        currentValue,
        pnl,
        pnlPercent: investedValue !== 0 ? (pnl / investedValue) * 100 : 0,
      };
    });

    const investedValue = holdings.reduce((sum, h) => sum + h.investedValue, 0);
    const currentValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const pnl = currentValue - investedValue;
    const portfolioId = portfolio._id?.toString() || '';
    const rebalanceStats = rebalanceStatsMap.get(portfolioId);

    return {
      portfolioId,
      userId: portfolio.userId,
      portfolioName: portfolio.portfolioName || 'Unnamed',
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      fromBacktest: !!portfolio.fromBacktest,
      investedValue,
      currentValue,
      pnl,
      pnlPercent: investedValue !== 0 ? (pnl / investedValue) * 100 : 0,
      rebalanceCount: rebalanceStats?.rebalanceCount || 0,
      stocksTraded: rebalanceStats?.stocksTraded || 0,
      holdings,
    };
  }
}
