"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealizedReturnsRepository = void 0;
const mongodb_1 = require("mongodb");
const BaseRepository_1 = require("./BaseRepository");
class RealizedReturnsRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'REALIZED_RETURNS';
    }
    async getRebalanceStatsByPortfolioIds(portfolioIds) {
        const objectIds = portfolioIds.filter((id) => mongodb_1.ObjectId.isValid(id)).map((id) => new mongodb_1.ObjectId(id));
        const statsMap = new Map();
        if (objectIds.length === 0) {
            return statsMap;
        }
        const docs = await this.findMany({ portfolioId: { $in: objectIds } });
        for (const doc of docs) {
            const entries = doc.realizedReturns || [];
            const uniqueDates = new Set(entries
                .filter((entry) => entry?.timestamp)
                .map((entry) => new Date(entry.timestamp).toISOString().slice(0, 10)));
            statsMap.set(doc.portfolioId.toString(), {
                rebalanceCount: uniqueDates.size,
                stocksTraded: entries.length,
            });
        }
        return statsMap;
    }
}
exports.RealizedReturnsRepository = RealizedReturnsRepository;
//# sourceMappingURL=RealizedReturnsRepository.js.map