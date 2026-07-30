const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

// TODAY in IST
const TODAY_IST_START = new Date('2026-07-27T00:00:00+05:30');
const TODAY_IST_END = new Date('2026-07-28T00:00:00+05:30');

async function getMetricsForFilter(db, userIds, userType) {
  const metrics = {};

  try {
    // 1. NEW USERS
    if (userType === 'ALL') {
      metrics['New Users'] = await db.collection('userdetail').countDocuments({
        createdOn: { $gte: TODAY_IST_START, $lt: TODAY_IST_END }
      });
    } else {
      metrics['New Users'] = await db.collection('userdetail').countDocuments({
        type: userType,
        createdOn: { $gte: TODAY_IST_START, $lt: TODAY_IST_END }
      });
    }

    // 2. ACTIVE USERS
    const activeUsers = await db.collection('loginlogs').aggregate([
      {
        $match: {
          userId: { $in: userIds },
          loginTime: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
          status: 'SUCCESS'
        }
      },
      { $group: { _id: '$userId' } }
    ]).toArray();
    metrics['Active Users'] = activeUsers.length;

    // 3. SUCCESSFUL LOGINS
    metrics['Successful Logins'] = await db.collection('loginlogs').countDocuments({
      userId: { $in: userIds },
      loginTime: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      status: 'SUCCESS'
    });

    // 4. FAILED LOGINS
    metrics['Failed Logins'] = await db.collection('loginlogs').countDocuments({
      userId: { $in: userIds },
      loginTime: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      status: 'FAILURE'
    });

    // 5. LOGIN SUCCESS %
    const total = metrics['Successful Logins'] + metrics['Failed Logins'];
    metrics['Login Success %'] = total > 0 ? ((metrics['Successful Logins'] / total) * 100).toFixed(2) : 0;

    // 6. STOCK SCORES (liveScoring_User_Tracking)
    metrics['Stock Scores'] = await db.collection('liveScoring_User_Tracking').countDocuments({
      userId: { $in: userIds },
      savedDate: { $gte: TODAY_IST_START, $lt: TODAY_IST_END }
    });

    // 7. STOCK BACKTESTS (backtest_Result)
    metrics['Stock Backtests'] = await db.collection('backtest_Result').countDocuments({
      userId: { $in: userIds },
      savedDate: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      status: 'Success'
    });

    // 8. ETF SCORES (etf_liveScoring_User_Tracking)
    metrics['ETF Scores'] = await db.collection('etf_liveScoring_User_Tracking').countDocuments({
      userId: { $in: userIds },
      requestedAt: { $gte: TODAY_IST_START, $lt: TODAY_IST_END }
    });

    // 9. ETF BACKTESTS (ETF_Backtest_Result)
    metrics['ETF Backtests'] = await db.collection('ETF_Backtest_Result').countDocuments({
      userId: { $in: userIds },
      savedDate: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      status: 'Success'
    });

    // 10. PAPER PORTFOLIO (portfolio_details)
    metrics['Paper Portfolio'] = await db.collection('portfolio_details').countDocuments({
      userId: { $in: userIds },
      createdAt: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      borkrageType: 'paper_trade'
    });

    // 11. LIVE REAL PORTFOLIO (portfolio_details)
    metrics['Live Real Portfolio'] = await db.collection('portfolio_details').countDocuments({
      userId: { $in: userIds },
      createdAt: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
      borkrageType: { $in: ['kite', 'zebu'] },
      isInvested: true,
      stockDetails: { $exists: true, $ne: [], $type: 'array' }
    });

    // 12. BROKER CONNECTED (borkrage_details)
    const brokerDocs = await db.collection('borkrage_details').aggregate([
      {
        $match: {
          userId: { $in: userIds },
          createdAt: { $gte: TODAY_IST_START, $lt: TODAY_IST_END },
          borkrageType: { $in: ['kite', 'zebu'] }
        }
      },
      { $group: { _id: '$userId' } }
    ]).toArray();
    metrics['Broker Connected'] = brokerDocs.length;

    // 13. INTRADAY SCORES (intraday_User_Tracking)
    metrics['Intraday Scores'] = await db.collection('intraday_User_Tracking').countDocuments({
      userId: { $in: userIds },
      savedDate: { $gte: TODAY_IST_START, $lt: TODAY_IST_END }
    });

  } catch (error) {
    console.error(`Error querying metrics for ${userType}:`, error.message);
  }

  return metrics;
}

async function comprehensiveDiagnostic() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('═'.repeat(100));
    console.log('COMPREHENSIVE DIAGNOSTIC - ALL METRICS FOR ALL USER TYPES');
    console.log('Date: 2026-07-27 (TODAY IST)');
    console.log('═'.repeat(100));
    console.log('\nQuerying all metrics...\n');

    // Get all users
    const allUsers = await db.collection('userdetail').find({}).toArray();
    const allUserIds = allUsers.map(u => u._id.toString());

    // Get users by type
    const tribeUsers = await db.collection('userdetail').find({ type: 'Tribe' }).toArray();
    const tribeUserIds = tribeUsers.map(u => u._id.toString());

    const freeUsers = await db.collection('userdetail').find({ type: 'Free' }).toArray();
    const freeUserIds = freeUsers.map(u => u._id.toString());

    const webinarUsers = await db.collection('userdetail').find({ type: 'Webinar' }).toArray();
    const webinarUserIds = webinarUsers.map(u => u._id.toString());

    console.log(`Total Users: ${allUsers.length}`);
    console.log(`Tribe Users: ${tribeUsers.length}`);
    console.log(`Free Users: ${freeUsers.length}`);
    console.log(`Webinar Users: ${webinarUsers.length}\n`);

    // Get metrics for each filter
    const metricsAll = await getMetricsForFilter(db, allUserIds, 'ALL');
    const metricsTribe = await getMetricsForFilter(db, tribeUserIds, 'Tribe');
    const metricsFree = await getMetricsForFilter(db, freeUserIds, 'Free');
    const metricsWebinar = await getMetricsForFilter(db, webinarUserIds, 'Webinar');

    // Output as markdown table
    console.log('═'.repeat(100));
    console.log('RESULTS TABLE');
    console.log('═'.repeat(100));
    console.log('\n| Metric | ALL Users | Tribe | Free | Webinar |');
    console.log('|--------|-----------|-------|------|---------|');

    const metricNames = [
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

    metricNames.forEach(metric => {
      const all = metricsAll[metric];
      const tribe = metricsTribe[metric];
      const free = metricsFree[metric];
      const webinar = metricsWebinar[metric];
      console.log(`| ${metric.padEnd(26)} | ${String(all).padEnd(9)} | ${String(tribe).padEnd(5)} | ${String(free).padEnd(4)} | ${String(webinar).padEnd(7)} |`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

comprehensiveDiagnostic();
