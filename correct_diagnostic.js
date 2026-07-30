const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

// TODAY in IST = 2026-07-27
const TODAY_UTC_START = new Date('2026-07-27T00:00:00.000Z');
const TODAY_UTC_END = new Date('2026-07-28T00:00:00.000Z');

async function getMetrics(db, userType) {
  let userIds = [];

  // Get user IDs for this type
  if (userType !== 'ALL') {
    const users = await db.collection('userdetail').find({ type: userType }).toArray();
    userIds = users.map(u => u._id.toString());
  } else {
    const users = await db.collection('userdetail').find({}).toArray();
    userIds = users.map(u => u._id.toString());
  }

  const metrics = {};

  // 1. NEW USERS
  if (userType === 'ALL') {
    metrics['New Users'] = await db.collection('userdetail').countDocuments({
      createdOn: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
    });
  } else {
    metrics['New Users'] = await db.collection('userdetail').countDocuments({
      type: userType,
      createdOn: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
    });
  }

  // 2. ACTIVE USERS
  const activeUsers = await db.collection('loginlogs').aggregate([
    {
      $match: {
        userId: { $in: userIds },
        loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        status: 'SUCCESS'
      }
    },
    { $group: { _id: '$userId' } }
  ]).toArray();
  metrics['Active Users'] = activeUsers.length;

  // 3. SUCCESSFUL LOGINS
  metrics['Successful Logins'] = await db.collection('loginlogs').countDocuments({
    userId: { $in: userIds },
    loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    status: 'SUCCESS'
  });

  // 4. FAILED LOGINS
  metrics['Failed Logins'] = await db.collection('loginlogs').countDocuments({
    userId: { $in: userIds },
    loginTime: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    status: 'FAILURE'
  });

  // 5. LOGIN SUCCESS %
  const total = metrics['Successful Logins'] + metrics['Failed Logins'];
  metrics['Login Success %'] = total > 0 ? ((metrics['Successful Logins'] / total) * 100).toFixed(2) : '0';

  // 6. STOCK SCORES
  metrics['Stock Scores'] = await db.collection('liveScoring_User_Tracking').countDocuments({
    userId: { $in: userIds },
    savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
  });

  // 7. STOCK BACKTESTS
  metrics['Stock Backtests'] = await db.collection('backtest_Result').countDocuments({
    userId: { $in: userIds },
    savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    status: 'Success'
  });

  // 8. ETF SCORES
  metrics['ETF Scores'] = await db.collection('etf_liveScoring_User_Tracking').countDocuments({
    userId: { $in: userIds },
    requestedAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
  });

  // 9. ETF BACKTESTS
  metrics['ETF Backtests'] = await db.collection('ETF_Backtest_Result').countDocuments({
    userId: { $in: userIds },
    savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    status: 'Success'
  });

  // 10. PAPER PORTFOLIO
  metrics['Paper Portfolio'] = await db.collection('portfolio_details').countDocuments({
    userId: { $in: userIds },
    createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    borkrageType: 'paper_trade'
  });

  // 11. LIVE REAL PORTFOLIO
  metrics['Live Real Portfolio'] = await db.collection('portfolio_details').countDocuments({
    userId: { $in: userIds },
    createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
    borkrageType: { $in: ['kite', 'zebu'] },
    isInvested: true,
    stockDetails: { $exists: true, $ne: [], $type: 'array' }
  });

  // 12. BROKER CONNECTED (from portfolio_details, not borkrage_details - userId mismatch)
  const brokerPortfolios = await db.collection('portfolio_details').aggregate([
    {
      $match: {
        userId: { $in: userIds },
        createdAt: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END },
        borkrageType: { $in: ['kite', 'zebu'] }
      }
    },
    { $group: { _id: '$userId' } }
  ]).toArray();
  metrics['Broker Connected'] = brokerPortfolios.length;

  // 13. INTRADAY SCORES
  metrics['Intraday Scores'] = await db.collection('intraday_User_Tracking').countDocuments({
    userId: { $in: userIds },
    savedDate: { $gte: TODAY_UTC_START, $lt: TODAY_UTC_END }
  });

  return metrics;
}

async function run() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('Generating correct diagnostic...\n');

    const metricsAll = await getMetrics(db, 'ALL');
    const metricsTribe = await getMetrics(db, 'Tribe');
    const metricsWebinar = await getMetrics(db, 'Webinar');
    const metricsFree = await getMetrics(db, 'Free');

    console.log('| Metric | ALL | Tribe | Webinar | Free | Dashboard |');
    console.log('|--------|-----|-------|---------|------|-----------|');

    const keys = [
      'New Users',
      'Active Users',
      'Successful Logins',
      'Failed Logins',
      'Login Success %',
      'Stock Scores',
      'Stock Backtests',
      'ETF Scores',
      'ETF Backtests',
      'Paper Portfolio',
      'Live Real Portfolio',
      'Broker Connected',
      'Intraday Scores'
    ];

    const dashboard = {
      'New Users': 15,
      'Active Users': 0,
      'Successful Logins': 186,
      'Failed Logins': 27,
      'Login Success %': '87.32',
      'Stock Scores': 621,
      'Stock Backtests': 311,
      'ETF Scores': 18,
      'ETF Backtests': 33,
      'Paper Portfolio': 18,
      'Live Real Portfolio': 6,
      'Broker Connected': 0,
      'Intraday Scores': 87
    };

    keys.forEach(key => {
      const all = metricsAll[key];
      const tribe = metricsTribe[key];
      const webinar = metricsWebinar[key];
      const free = metricsFree[key];
      const dash = dashboard[key];
      console.log(`| ${key.padEnd(22)} | ${String(all).padEnd(3)} | ${String(tribe).padEnd(5)} | ${String(webinar).padEnd(7)} | ${String(free).padEnd(4)} | ${String(dash).padEnd(9)} |`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

run();
