"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnrealizedPnlService = void 0;
const BrokerRepository_1 = require("../repository/BrokerRepository");
const StockListRepository_1 = require("../repository/StockListRepository");
const RealizedReturnsRepository_1 = require("../repository/RealizedReturnsRepository");
class UnrealizedPnlService {
    constructor() {
        this.portfolioRepository = new BrokerRepository_1.PortfolioRepository();
        this.stockListRepository = new StockListRepository_1.StockListRepository();
        this.realizedReturnsRepository = new RealizedReturnsRepository_1.RealizedReturnsRepository();
    }
    async getLivePortfoliosPnl() {
        const portfolios = await this.portfolioRepository.getLiveRealPortfoliosWithHoldings();
        const allSymbols = new Set();
        for (const portfolio of portfolios) {
            for (const holding of portfolio.stockDetails || []) {
                if (holding.tradingsymbol) {
                    allSymbols.add(holding.tradingsymbol);
                }
            }
        }
        const portfolioIds = portfolios.map((p) => p._id?.toString()).filter(Boolean);
        const [lastPriceMap, rebalanceStatsMap] = await Promise.all([
            this.stockListRepository.getLastPriceMap([...allSymbols]),
            this.realizedReturnsRepository.getRebalanceStatsByPortfolioIds(portfolioIds),
        ]);
        return portfolios.map((portfolio) => this.computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap));
    }
    computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap) {
        const holdings = portfolio.stockDetails.map((stock) => {
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
exports.UnrealizedPnlService = UnrealizedPnlService;
//# sourceMappingURL=UnrealizedPnlService.js.map