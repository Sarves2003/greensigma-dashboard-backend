const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function inspectRealData() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('INSPECTING REAL COLLECTION DATA\n');

    const collections = [
      'loginlogs',
      'liveScoring_User_Tracking',
      'backtest_Result',
      'etf_liveScoring_User_Tracking',
      'ETF_Backtest_Result',
      'borkrage_details',
      'portfolio_details',
      'intraday_User_Tracking'
    ];

    for (const colName of collections) {
      console.log('\n' + '═'.repeat(80));
      console.log(`Collection: ${colName}`);
      console.log('═'.repeat(80));

      try {
        const count = await db.collection(colName).countDocuments();
        console.log(`Total documents: ${count}`);

        if (count > 0) {
          const sample = await db.collection(colName).findOne();
          console.log(`\nFields in collection:`);
          Object.keys(sample).forEach(key => {
            const value = sample[key];
            const type = value instanceof Date ? 'Date' : typeof value;
            console.log(`  ${key}: ${type} = ${String(value).substring(0, 80)}`);
          });

          // Show sample with dates
          console.log(`\nSample record:`);
          console.log(JSON.stringify(sample, null, 2).substring(0, 500));

          // For loginlogs, show date range
          if (colName === 'loginlogs') {
            const latestLogin = await db.collection(colName).findOne({}, { sort: { loginTime: -1 } });
            const oldestLogin = await db.collection(colName).findOne({}, { sort: { loginTime: 1 } });
            console.log(`\nDate range:`);
            console.log(`  Latest: ${latestLogin?.loginTime}`);
            console.log(`  Oldest: ${oldestLogin?.loginTime}`);

            // Count by status
            const successCount = await db.collection(colName).countDocuments({ status: 'SUCCESS' });
            const failureCount = await db.collection(colName).countDocuments({ status: 'FAILURE' });
            console.log(`\nCounts by status:`);
            console.log(`  SUCCESS: ${successCount}`);
            console.log(`  FAILURE: ${failureCount}`);

            // Check for logins on 2026-07-27
            const day27Logins = await db.collection(colName).countDocuments({
              loginTime: { $gte: new Date('2026-07-27T00:00:00Z'), $lt: new Date('2026-07-28T00:00:00Z') }
            });
            console.log(`  Logins on 2026-07-27 (UTC): ${day27Logins}`);
          }

          // For borkrage_details
          if (colName === 'borkrage_details') {
            const kiteCount = await db.collection(colName).countDocuments({ borkrageType: 'kite' });
            const zebuCount = await db.collection(colName).countDocuments({ borkrageType: 'zebu' });
            const paperCount = await db.collection(colName).countDocuments({ borkrageType: 'paper_trade' });
            console.log(`\nCounts by borkrageType:`);
            console.log(`  kite: ${kiteCount}`);
            console.log(`  zebu: ${zebuCount}`);
            console.log(`  paper_trade: ${paperCount}`);

            // Check created today
            const today = await db.collection(colName).countDocuments({
              createdAt: { $gte: new Date('2026-07-27T00:00:00Z'), $lt: new Date('2026-07-28T00:00:00Z') }
            });
            console.log(`  Created on 2026-07-27 (UTC): ${today}`);
          }
        }
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('Connection error:', error.message);
  } finally {
    await client.close();
  }
}

inspectRealData();
