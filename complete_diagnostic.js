const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';
const TODAY_START = new Date('2026-07-27T00:00:00.000Z');
const TODAY_END = new Date('2026-07-28T00:00:00.000Z');

async function runDiagnostic() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    COMPLETE DASHBOARD METRICS DIAGNOSTIC                       ║');
    console.log('║                        Date: 2026-07-27 (TODAY)                                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    // Get all user types
    const userTypes = ['Free', 'Webinar', 'Tribe'];

    for (const filter of ['ALL', ...userTypes]) {
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

      // 1. NEW USERS
      let newUsersCount = await db.collection('userdetail').countDocuments({
        ...userFilter,
        createdOn: { $gte: TODAY_START, $lt: TODAY_END }
      });
      console.log(`1. NEW USERS: ${newUsersCount}`);

      // 2. ACTIVE USERS (from loginlogs after cutoff)
      let activeUsersCount = 0;
      if (userIds.length > 0) {
        const uniqueLogins = await db.collection('loginlogs').aggregate([
          {
            $match: {
              userId: { $in: userIds },
              loginTime: { $gte: TODAY_START, $lt: TODAY_END },
              status: 'SUCCESS'
            }
          },
          { $group: { _id: '$userId' } }
        ]).toArray();
        activeUsersCount = uniqueLogins.length;
      }
      console.log(`2. ACTIVE USERS: ${activeUsersCount}`);

      // 3. SUCCESSFUL LOGINS
      let successfulLoginsCount = 0;
      if (userIds.length > 0) {
        successfulLoginsCount = await db.collection('loginlogs').countDocuments({
          userId: { $in: userIds },
          loginTime: { $gte: TODAY_START, $lt: TODAY_END },
          status: 'SUCCESS'
        });
      }
      console.log(`3. SUCCESSFUL LOGINS: ${successfulLoginsCount}`);

      // 4. FAILED LOGINS
      let failedLoginsCount = 0;
      if (userIds.length > 0) {
        failedLoginsCount = await db.collection('loginlogs').countDocuments({
          userId: { $in: userIds },
          loginTime: { $gte: TODAY_START, $lt: TODAY_END },
          status: 'FAILURE'
        });
      }
      console.log(`4. FAILED LOGINS: ${failedLoginsCount}`);

      // 5. LOGIN SUCCESS %
      const totalLogins = successfulLoginsCount + failedLoginsCount;
      const loginSuccessRate = totalLogins > 0 ? ((successfulLoginsCount / totalLogins) * 100).toFixed(2) : 0;
      console.log(`5. LOGIN SUCCESS %: ${loginSuccessRate}`);

      // 6. STOCK SCORES
      let stockScoresCount = 0;
      if (userIds.length > 0) {
        stockScoresCount = await db.collection('stockscore').countDocuments({
          userId: { $in: userIds },
          requestedAt: { $gte: TODAY_START, $lt: TODAY_END }
        });
      }
      console.log(`6. STOCK SCORES: ${stockScoresCount}`);

      // 7. STOCK BACKTESTS
      let stockBacktestsCount = 0;
      if (userIds.length > 0) {
        stockBacktestsCount = await db.collection('backtest').countDocuments({
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_START, $lt: TODAY_END },
          status: 'Success'
        });
      }
      console.log(`7. STOCK BACKTESTS: ${stockBacktestsCount}`);

      // 8. ETF SCORES
      let etfScoresCount = 0;
      if (userIds.length > 0) {
        etfScoresCount = await db.collection('etfscore').countDocuments({
          userId: { $in: userIds },
          requestedAt: { $gte: TODAY_START, $lt: TODAY_END }
        });
      }
      console.log(`8. ETF SCORES: ${etfScoresCount}`);

      // 9. ETF BACKTESTS
      let etfBacktestsCount = 0;
      if (userIds.length > 0) {
        etfBacktestsCount = await db.collection('backtest').countDocuments({
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_START, $lt: TODAY_END },
          assetType: 'ETF',
          status: 'Success'
        });
      }
      console.log(`9. ETF BACKTESTS: ${etfBacktestsCount}`);

      // 10. PAPER PORTFOLIO
      let paperPortfolioCount = 0;
      if (userIds.length > 0) {
        paperPortfolioCount = await db.collection('portfolio_details').countDocuments({
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_START, $lt: TODAY_END },
          borkrageType: 'paper_trade'
        });
      }
      console.log(`10. PAPER PORTFOLIO: ${paperPortfolioCount}`);

      // 11. LIVE REAL PORTFOLIO
      let liveRealPortfolioCount = 0;
      if (userIds.length > 0) {
        liveRealPortfolioCount = await db.collection('portfolio_details').countDocuments({
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_START, $lt: TODAY_END },
          borkrageType: { $in: ['kite', 'zebu'] },
          isInvested: true,
          stockDetails: { $exists: true, $ne: [], $type: 'array' }
        });
      }
      console.log(`11. LIVE REAL PORTFOLIO: ${liveRealPortfolioCount}`);

      // 12. BROKER CONNECTED
      let brokerConnectedCount = 0;
      if (userIds.length > 0) {
        const brokers = await db.collection('borkrage_details').find({
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_START, $lt: TODAY_END }
        }).toArray();
        brokerConnectedCount = new Set(brokers.map(b => b.userId)).size;
      }
      console.log(`12. BROKER CONNECTED: ${brokerConnectedCount}`);

      // 13. INTRADAY SCORES
      let intradayScoresCount = 0;
      if (userIds.length > 0) {
        intradayScoresCount = await db.collection('intraday_User_Tracking').countDocuments({
          userId: { $in: userIds },
          savedDate: { $gte: TODAY_START, $lt: TODAY_END }
        });
      }
      console.log(`13. INTRADAY SCORES: ${intradayScoresCount}`);
    }

    console.log(`\n\n${'═'.repeat(80)}`);
    console.log('DASHBOARD SHOWS (Screenshot):');
    console.log(`${'═'.repeat(80)}\n`);
    console.log(`Filter: ALL`);
    console.log(`New Users: 15`);
    console.log(`Active Users: 0`);
    console.log(`Successful Logins: 186`);
    console.log(`Failed Logins: 27`);
    console.log(`Login Success %: 87.32`);
    console.log(`Stock Scores: 621`);
    console.log(`Stock Backtests: 311`);
    console.log(`ETF Scores: 18`);
    console.log(`ETF Backtests: 33`);
    console.log(`Paper Portfolio: 18`);
    console.log(`Live Real Portfolio: 6`);
    console.log(`Broker Connected: 0`);
    console.log(`Intraday Scores: 88`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

runDiagnostic();
