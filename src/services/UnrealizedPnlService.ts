import { PortfolioRepository } from '../repository/BrokerRepository';
import { StockListRepository } from '../repository/StockListRepository';
import { RealizedReturnsRepository, RebalanceStats } from '../repository/RealizedReturnsRepository';
import { UserRepository } from '../repository/UserRepository';
import { StockHolding } from '../types';

// The strategy's one confirmed defensive asset — the buy leg of every regime-triggered sell
// (regimeAction 'full' or 'half') lands here. SKYGOLD was deliberately excluded: real data shows
// it also gets bought via ordinary, non-regime-tagged BUY rebalances (an actual momentum pick
// sometimes, not only a defensive one), so treating it as "gold" would overcount.
const DEFENSIVE_ASSET_SYMBOL = 'GOLDBEES';

export type RegimeStatus = 'full_gold' | 'half_gold' | null;

// Classifies a portfolio's CURRENT holdings snapshot — not its rebalance intent, since sell/buy legs
// can partially fail at the broker (confirmed in real data: orderStatus 'FAILED' entries sit
// alongside 'OPENED' ones in the same regime-sell batch), so actual holdings are the source of truth.
function classifyRegimeStatus(stockDetails: any[] | undefined): RegimeStatus {
  const holdings: string[] = (stockDetails || []).map((h: any) => h.tradingsymbol).filter(Boolean);
  if (holdings.length === 0 || !holdings.includes(DEFENSIVE_ASSET_SYMBOL)) return null;
  return holdings.length === 1 ? 'full_gold' : 'half_gold';
}

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
  borkrageType: string;
  createdAt?: Date;
  updatedAt?: Date;
  fromBacktest: boolean;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  rebalanceCount: number;
  stocksTraded: number;
  rebalanceDates: string[];
  regimeStatus: RegimeStatus; // non-null when this portfolio's CURRENT holdings show it sitting in the strategy's defensive gold position (full or half) — see classifyRegimeStatus
  holdings: HoldingPnl[];
  // investmentCapital is the ORIGINAL amount the client put in — it is never incremented when a
  // SIP happens (confirmed against real data: a portfolio can have investmentCapital smaller than
  // a single one of its own SIP top-ups). null when the field was never saved for this portfolio
  // (older/manual portfolios) — the frontend falls back to `investedValue` as the AUM base for
  // those, since `investedValue` already organically includes any SIP-driven share purchases.
  investmentCapital: number | null;
  freeCash: number;
  lockedFreeCash: number;
  sipEvents: SipEvent[];
  joinedDate: string | null;
}

export class UnrealizedPnlService {
  private portfolioRepository = new PortfolioRepository();
  private stockListRepository = new StockListRepository();
  private realizedReturnsRepository = new RealizedReturnsRepository();
  private userRepository = new UserRepository();

  async getLivePortfoliosPnl(): Promise<PortfolioPnl[]> {
    const portfolios = await this.portfolioRepository.getLiveRealPortfoliosWithHoldings();

    const allSymbols = new Set<string>();
    const userIds = new Set<string>();
    for (const portfolio of portfolios as any[]) {
      for (const holding of portfolio.stockDetails || []) {
        if (holding.tradingsymbol) {
          allSymbols.add(holding.tradingsymbol);
        }
      }
      if (portfolio.userId) userIds.add(portfolio.userId);
    }

    const portfolioIds = portfolios.map((p: any) => p._id?.toString()).filter(Boolean);

    const [lastPriceMap, rebalanceStatsMap, users] = await Promise.all([
      this.stockListRepository.getLastPriceMap([...allSymbols]),
      this.realizedReturnsRepository.getRebalanceStatsByPortfolioIds(portfolioIds),
      this.userRepository.getUsersByIds([...userIds]),
    ]);

    const joinedDateByUserId = new Map<string, string>();
    for (const u of users as any[]) {
      if (u._id && u.createdOn) joinedDateByUserId.set(u._id.toString(), new Date(u.createdOn).toISOString());
    }

    return portfolios.map((portfolio: any) =>
      this.computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap, joinedDateByUserId)
    );
  }

  private computePortfolioPnl(
    portfolio: any,
    lastPriceMap: Map<string, number>,
    rebalanceStatsMap: Map<string, RebalanceStats>,
    joinedDateByUserId: Map<string, string>
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

    const sipEvents: SipEvent[] = (portfolio.rebalanceHistory || [])
      .filter((h: any) => h.sipApplied && h.sipAmount)
      .map((h: any) => ({ date: new Date(h.date).toISOString(), amount: h.sipAmount }));

    const rawCapital = portfolio.investmentCapital;
    const investmentCapital = rawCapital !== undefined && rawCapital !== null && !isNaN(Number(rawCapital))
      ? Number(rawCapital)
      : null;

    return {
      portfolioId,
      userId: portfolio.userId,
      portfolioName: portfolio.portfolioName || 'Unnamed',
      borkrageType: portfolio.borkrageType || '',
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      fromBacktest: !!portfolio.fromBacktest,
      investedValue,
      currentValue,
      pnl,
      pnlPercent: investedValue !== 0 ? (pnl / investedValue) * 100 : 0,
      rebalanceCount: rebalanceStats?.rebalanceCount || 0,
      stocksTraded: rebalanceStats?.stocksTraded || 0,
      rebalanceDates: rebalanceStats?.dates || [],
      regimeStatus: classifyRegimeStatus(portfolio.stockDetails),
      holdings,
      investmentCapital,
      freeCash: portfolio.freeCash || 0,
      lockedFreeCash: portfolio.lockedFreeCash || 0,
      sipEvents,
      joinedDate: joinedDateByUserId.get(portfolio.userId) || null,
    };
  }
}
