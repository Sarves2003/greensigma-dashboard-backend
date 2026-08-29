"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database_1 = require("./config/database");
async function main() {
    await (0, database_1.connectDatabase)();
    const db = (0, database_1.getDatabase)();
    const automatedPortfolios = await db.collection('portfolio_details').find({
        isInvested: true,
        borkrageType: { $in: ['kite', 'zebu'] },
        stockDetails: { $exists: true, $ne: [], $type: 'array' },
        fromBacktest: true,
    }).toArray();
    const augStart = new Date('2026-08-01T00:00:00.000Z');
    const augEnd = new Date('2026-09-01T00:00:00.000Z');
    const createdInAug = automatedPortfolios.filter((p) => {
        const c = p.createdAt ? new Date(p.createdAt) : null;
        return c && c >= augStart && c < augEnd;
    });
    console.log('Count matching my Aug filter:', createdInAug.length);
    // Old method: qty * price, using live prices for current value (matching the dashboard exactly)
    const allSymbols = new Set();
    for (const p of createdInAug) {
        for (const h of p.stockDetails || [])
            if (h.tradingsymbol)
                allSymbols.add(h.tradingsymbol);
    }
    const stockDocs = await db.collection('Stock_Lists').find({ tradingsymbol: { $in: [...allSymbols] } }).toArray();
    const lastPriceMap = new Map();
    for (const s of stockDocs)
        lastPriceMap.set(s.tradingsymbol, s.last_price);
    let oldInvested = 0;
    let currentValue = 0;
    for (const p of createdInAug) {
        for (const h of p.stockDetails || []) {
            const qty = h.quantity || 0;
            const price = h.price || 0;
            oldInvested += qty * price;
            const lastPrice = lastPriceMap.get(h.tradingsymbol) ?? price;
            currentValue += qty * lastPrice;
        }
    }
    console.log('\nMy computed OLD-method Total Invested (qty*price) for these 97:', oldInvested.toFixed(2));
    console.log('Dashboard shows: 16193014');
    console.log('Match?', Math.abs(oldInvested - 16193014) < 1000 ? 'YES (close enough)' : 'NO - mismatch, investigate selection');
    console.log('\nMy computed Total Current Value for these 97:', currentValue.toFixed(2));
    console.log('Dashboard shows: 16342010');
    // Now the investmentCapital + SIP breakdown, with per-portfolio detail so we can see the shape
    let investmentCapitalSum = 0;
    let sipInAugSum = 0;
    const rows = [];
    for (const p of createdInAug) {
        const cap = Number(p.investmentCapital) || 0;
        investmentCapitalSum += cap;
        let portfolioSip = 0;
        for (const h of p.rebalanceHistory || []) {
            if (!h.sipApplied)
                continue;
            const d = h.date ? new Date(h.date) : null;
            if (d && d >= augStart && d < augEnd) {
                portfolioSip += h.sipAmount || 0;
                sipInAugSum += h.sipAmount || 0;
            }
        }
        const holdingsInvested = (p.stockDetails || []).reduce((s, h) => s + (h.quantity || 0) * (h.price || 0), 0);
        rows.push({
            name: p.portfolioName,
            investmentCapital: cap,
            sip: portfolioSip,
            capitalPlusSip: cap + portfolioSip,
            holdingsInvested: parseFloat(holdingsInvested.toFixed(2)),
            diff: parseFloat((cap + portfolioSip - holdingsInvested).toFixed(2)),
            freeCash: p.freeCash || 0,
        });
    }
    console.log('\nSum investmentCapital:', investmentCapitalSum.toFixed(2));
    console.log('Sum Aug-dated SIP:', sipInAugSum.toFixed(2));
    console.log('Total (investmentCapital + SIP):', (investmentCapitalSum + sipInAugSum).toFixed(2));
    console.log('vs old-method holdings-based invested:', oldInvested.toFixed(2));
    console.log('Gap:', (investmentCapitalSum + sipInAugSum - oldInvested).toFixed(2));
    // Show the biggest per-portfolio gaps to explain where the difference comes from
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log('\nTop 10 portfolios by |capitalPlusSip - holdingsInvested|:');
    console.log(JSON.stringify(rows.slice(0, 10), null, 2));
    const totalFreeCash = rows.reduce((s, r) => s + r.freeCash, 0);
    console.log('\nTotal freeCash sitting idle across these 97:', totalFreeCash.toFixed(2));
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=_cross_check.js.map