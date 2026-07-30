const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

// IST dates
const TODAY_START = new Date('2026-07-27T00:00:00+05:30');
const TODAY_END = new Date('2026-07-28T00:00:00+05:30');

async function fastDiagnostic() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                   FAST DIAGNOSTIC - ALL USERS ONLY                            ║');
    console.log('║                        Date: 2026-07-27 IST                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    const allUsers = await db.collection('userdetail').find({}).toArray();
    const userIds = allUsers.map(u => u._id.toString());

    console.log(`Total users: ${userIds.length}\n`);
    console.log('Querying metrics...\n');

    const metrics = {};

    // 1. NEW USERS
    metrics['New Users'] = await db.collection('userdetail').countDocuments({
      createdOn: { $gte: TODAY_START, $lt: TODAY_END }
    });

    // 2. ACTIVE USERS
    const activeUsers = await db.collection('loginlogs').aggregate([
      {
        $match: {
          loginTime: { $gte: TODAY_START, $lt: TODAY_END },
          status: 'SUCCESS'
        }
      },
      { $group: { _id: '$userId' } }
    ]).toArray();
    metrics['Active Users'] = activeUsers.length;

    // 3. SUCCESSFUL LOGINS
    metrics['Successful Logins'] = await db.collection('loginlogs').countDocuments({
      loginTime: { $gte: TODAY_START, $lt: TODAY_END },
      status: 'SUCCESS'
    });

    // 4. FAILED LOGINS
    metrics['Failed Logins'] = await db.collection('loginlogs').countDocuments({
      loginTime: { $gte: TODAY_START, $lt: TODAY_END },
      status: 'FAILURE'
    });

    // 5. LOGIN SUCCESS %
    const total = metrics['Successful Logins'] + metrics['Failed Logins'];
    metrics['Login Success %'] = total > 0 ? ((metrics['Successful Logins'] / total) * 100).toFixed(2) + '%' : '0%';

    // 6. STOCK SCORES
    metrics['Stock Scores'] = await db.collection('liveScoring_User_Tracking').countDocuments({
      savedDate: { $gte: TODAY_START, $lt: TODAY_END }
    });

    // 7. STOCK BACKTESTS
    metrics['Stock Backtests'] = await db.collection('backtest_Result').countDocuments({
      createdAt: { $gte: TODAY_START, $lt: TODAY_END },
      assetType: 'Stock',
      status: 'Success'
    });

    // 8. ETF SCORES
    metrics['ETF Scores'] = await db.collection('etf_liveScoring_User_Tracking').countDocuments({
      savedDate: { $gte: TODAY_START, $lt: TODAY_END }
    });

    // 9. ETF BACKTESTS
    metrics['ETF Backtests'] = await db.collection('backtest_Result').countDocuments({
      createdAt: { $gte: TODAY_START, $lt: TODAY_END },
      assetType: 'ETF',
      status: 'Success'
    });

    // 10. PAPER PORTFOLIO
    metrics['Paper Portfolio'] = await db.collection('portfolio_details').countDocuments({
      createdAt: { $gte: TODAY_START, $lt: TODAY_END },
      borkrageType: 'paper_trade'
    });

    // 11. LIVE REAL PORTFOLIO
    metrics['Live Real Portfolio'] = await db.collection('portfolio_details').countDocuments({
      createdAt: { $gte: TODAY_START, $lt: TODAY_END },
      borkrageType: { $in: ['kite', 'zebu'] },
      isInvested: true,
      stockDetails: { $exists: true, $ne: [], $type: 'array' }
    });

    // 12. BROKER CONNECTED
    const brokers = await db.collection('portfolio_details').aggregate([
      {
        $match: {
          createdAt: { $gte: TODAY_START, $lt: TODAY_END },
          borkrageType: { $in: ['kite', 'zebu'] }
        }
      },
      { $group: { _id: '$userId' } }
    ]).toArray();
    metrics['Broker Connected'] = brokers.length;

    // 13. INTRADAY SCORES
    metrics['Intraday Scores'] = await db.collection('intraday_User_Tracking').countDocuments({
      savedDate: { $gte: TODAY_START, $lt: TODAY_END }
    });

    // Display results
    console.log('═'.repeat(80));
    console.log('ACTUAL DATABASE VALUES FOR TODAY (ALL USERS):');
    console.log('═'.repeat(80));
    console.log('\nMetric                          Database    Dashboard    Match?');
    console.log('─'.repeat(80));

    const dashboardValues = {
      'New Users': 15,
      'Active Users': 0,
      'Successful Logins': 186,
      'Failed Logins': 27,
      'Login Success %': '87.32%',
      'Stock Scores': 621,
      'Stock Backtests': 311,
      'ETF Scores': 18,
      'ETF Backtests': 33,
      'Paper Portfolio': 18,
      'Live Real Portfolio': 6,
      'Broker Connected': 0,
      'Intraday Scores': 88
    };

    Object.keys(metrics).forEach(metric => {
      const dbVal = metrics[metric];
      const dashVal = dashboardValues[metric];
      const match = dbVal === dashVal ? '✓ YES' : '✗ NO';
      console.log(`${metric.padEnd(30)} ${String(dbVal).padEnd(11)} ${String(dashVal).padEnd(12)} ${match}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

fastDiagnostic();
