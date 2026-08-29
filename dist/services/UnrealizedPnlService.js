"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnrealizedPnlService = void 0;
const BrokerRepository_1 = require("../repository/BrokerRepository");
const StockListRepository_1 = require("../repository/StockListRepository");
const RealizedReturnsRepository_1 = require("../repository/RealizedReturnsRepository");
const UserRepository_1 = require("../repository/UserRepository");
class UnrealizedPnlService {
    constructor() {
        this.portfolioRepository = new BrokerRepository_1.PortfolioRepository();
        this.stockListRepository = new StockListRepository_1.StockListRepository();
        this.realizedReturnsRepository = new RealizedReturnsRepository_1.RealizedReturnsRepository();
        this.userRepository = new UserRepository_1.UserRepository();
    }
    async getLivePortfoliosPnl() {
        const portfolios = await this.portfolioRepository.getLiveRealPortfoliosWithHoldings();
        const allSymbols = new Set();
        const userIds = new Set();
        for (const portfolio of portfolios) {
            for (const holding of portfolio.stockDetails || []) {
                if (holding.tradingsymbol) {
                    allSymbols.add(holding.tradingsymbol);
                }
            }
            if (portfolio.userId)
                userIds.add(portfolio.userId);
        }
        const portfolioIds = portfolios.map((p) => p._id?.toString()).filter(Boolean);
        const [lastPriceMap, rebalanceStatsMap, users] = await Promise.all([
            this.stockListRepository.getLastPriceMap([...allSymbols]),
            this.realizedReturnsRepository.getRebalanceStatsByPortfolioIds(portfolioIds),
            this.userRepository.getUsersByIds([...userIds]),
        ]);
        const joinedDateByUserId = new Map();
        for (const u of users) {
            if (u._id && u.createdOn)
                joinedDateByUserId.set(u._id.toString(), new Date(u.createdOn).toISOString());
        }
        return portfolios.map((portfolio) => this.computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap, joinedDateByUserId));
    }
    computePortfolioPnl(portfolio, lastPriceMap, rebalanceStatsMap, joinedDateByUserId) {
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
        const sipEvents = (portfolio.rebalanceHistory || [])
            .filter((h) => h.sipApplied && h.sipAmount)
            .map((h) => ({ date: new Date(h.date).toISOString(), amount: h.sipAmount }));
        const rawCapital = portfolio.investmentCapital;
        const investmentCapital = rawCapital !== undefined && rawCapital !== null && !isNaN(Number(rawCapital))
            ? Number(rawCapital)
            : null;
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
            investmentCapital,
            freeCash: portfolio.freeCash || 0,
            lockedFreeCash: portfolio.lockedFreeCash || 0,
            sipEvents,
            joinedDate: joinedDateByUserId.get(portfolio.userId) || null,
        };
    }
}
exports.UnrealizedPnlService = UnrealizedPnlService;
//# sourceMappingURL=UnrealizedPnlService.js.map