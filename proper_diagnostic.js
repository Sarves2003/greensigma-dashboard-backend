const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

// TODAY in IST = 2026-07-27 00:00:00 IST to 2026-07-27 23:59:59 IST
// Which in UTC = 2026-07-26 18:30:00 UTC to 2026-07-27 18:29:59 UTC
const TODAY_IST_START = new Date('2026-07-27T00:00:00+05:30');  // IST
const TODAY_IST_END = new Date('2026-07-28T00:00:00+05:30');    // IST (next day start)

// Convert to UTC for querying
const TODAY_UTC_START = new Date(TODAY_IST_START.toISOString());
const TODAY_UTC_END = new Date(TODAY_IST_END.toISOString());

console.log(`IST Range: ${TODAY_IST_START} to ${TODAY_IST_END}`);
console.log(`UTC Range: ${TODAY_UTC_START} to ${TODAY_UTC_END}\n`);

async function properDiagnostic() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CORRECTED METRICS DIAGNOSTIC                               ║');
    console.log('║                        Date: 2026-07-27 (TODAY IST)                           ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    const userTypes = ['ALL', 'Free', 'Webinar', 'Tribe'];

    for (const filter of userTypes) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`FILTER: ${filter}`);
      console.log(`${'═'.repeat(80)}\n`);

      let userFilter = {};
      let userIds = [];

      if (filter !== 'ALL') {
        userFilter = { type: filter };
        const users = await db.collection('userdetail').find(userFilter).toArray();
        userIds = users.map(u => u._id.toString());
        console.log(`Total ${filter} users: ${users.length}\n`);
      } else {
        const users = await db.collection('userdetail').find({}).toArray();
        userIds = users.map(u => u._id.toString());
        console.log(`Total users in system: ${users.length}\n`);
      }

      if (userIds.length === 0 && filter !== 'ALL') {
        console.log(`No users for filter ${filter}\n`);
        continue;
      }

      // 1. NEW USERS
      let newUsersCount = await db.collection('userdetail').countDocuments({
        ...userFilter,
        createdOn: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
      });
      console.log(`1. NEW USERS: ${newUsersCount}`);

      // 2. ACTIVE USERS
      let activeUsersCount = 0;
      const activeUserDocs = await db.collection('loginlogs').aggregate([
        {
          $match: {
            userId: { $in: userIds },
            loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
            status: 'SUCCESS'
          }
        },
        { $group: { _id: '$userId' } }
      ]).toArray();
      activeUsersCount = activeUserDocs.length;
      console.log(`2. ACTIVE USERS: ${activeUsersCount}`);

      // 3. SUCCESSFUL LOGINS
      let successfulLoginsCount = await db.collection('loginlogs').countDocuments({
        userId: { $in: userIds },
        loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        status: 'SUCCESS'
      });
      console.log(`3. SUCCESSFUL LOGINS: ${successfulLoginsCount}`);

      // 4. FAILED LOGINS
      let failedLoginsCount = await db.collection('loginlogs').countDocuments({
        userId: { $in: userIds },
        loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        status: 'FAILURE'
      });
      console.log(`4. FAILED LOGINS: ${failedLoginsCount}`);

      // 5. LOGIN SUCCESS %
      const totalLogins = successfulLoginsCount + failedLoginsCount;
      const loginSuccessRate = totalLogins > 0 ? ((successfulLoginsCount / totalLogins) * 100).toFixed(2) : 0;
      console.log(`5. LOGIN SUCCESS %: ${loginSuccessRate}%`);

      // 6. STOCK SCORES (from liveScoring_User_Tracking)
      let stockScoresCount = await db.collection('liveScoring_User_Tracking').countDocuments({
        userId: { $in: userIds },
        savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
      });
      console.log(`6. STOCK SCORES: ${stockScoresCount}`);

      // 7. STOCK BACKTESTS (from backtest_Result)
      let stockBacktestsCount = await db.collection('backtest_Result').countDocuments({
        userId: { $in: userIds },
        createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        assetType: 'Stock',
        status: 'Success'
      });
      console.log(`7. STOCK BACKTESTS: ${stockBacktestsCount}`);

      // 8. ETF SCORES (from etf_liveScoring_User_Tracking)
      let etfScoresCount = await db.collection('etf_liveScoring_User_Tracking').countDocuments({
        userId: { $in: userIds },
        savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
      });
      console.log(`8. ETF SCORES: ${etfScoresCount}`);

      // 9. ETF BACKTESTS (from backtest_Result)
      let etfBacktestsCount = await db.collection('backtest_Result').countDocuments({
        userId: { $in: userIds },
        createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        assetType: 'ETF',
        status: 'Success'
      });
      console.log(`9. ETF BACKTESTS: ${etfBacktestsCount}`);

      // 10. PAPER PORTFOLIO
      let paperPortfolioCount = await db.collection('portfolio_details').countDocuments({
        userId: { $in: userIds },
        createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        borkrageType: 'paper_trade'
      });
      console.log(`10. PAPER PORTFOLIO: ${paperPortfolioCount}`);

      // 11. LIVE REAL PORTFOLIO
      let liveRealPortfolioCount = await db.collection('portfolio_details').countDocuments({
        userId: { $in: userIds },
        createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        borkrageType: { $in: ['kite', 'zebu'] },
        isInvested: true,
        stockDetails: { $exists: true, $ne: [], $type: 'array' }
      });
      console.log(`11. LIVE REAL PORTFOLIO: ${liveRealPortfolioCount}`);

      // 12. BROKER CONNECTED
      let brokerConnectedCount = 0;
      const brokerDocs = await db.collection('portfolio_details').aggregate([
        {
          $match: {
            userId: { $in: userIds },
            createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
            borkrageType: { $in: ['kite', 'zebu'] }
          }
        },
        {
          $group: { _id: '$userId' }
        }
      ]).toArray();
      brokerConnectedCount = brokerDocs.length;
      console.log(`12. BROKER CONNECTED: ${brokerConnectedCount}`);

      // 13. INTRADAY SCORES
      let intradayScoresCount = await db.collection('intraday_User_Tracking').countDocuments({
        userId: { $in: userIds },
        savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
      });
      console.log(`13. INTRADAY SCORES: ${intradayScoresCount}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

properDiagnostic();
