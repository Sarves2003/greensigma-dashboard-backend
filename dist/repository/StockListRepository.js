"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockListRepository = void 0;
const BaseRepository_1 = require("./BaseRepository");
class StockListRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(...arguments);
        this.collectionName = 'STOCK_LISTS';
    }
    async getLastPriceMap(tradingsymbols) {
        if (tradingsymbols.length === 0) {
            return new Map();
        }
        const items = await this.findMany({
            tradingsymbol: { $in: tradingsymbols },
        });
        const priceMap = new Map();
        for (const item of items) {
            priceMap.set(item.tradingsymbol, item.last_price);
        }
        return priceMap;
    }
}
exports.StockListRepository = StockListRepository;
//# sourceMappingURL=StockListRepository.js.map