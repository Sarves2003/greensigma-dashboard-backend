const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function checkAllData() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('admin');

    // Check all collections for today's data
    console.log('=== Checking ALL data for TODAY (2026-07-27) ===\n');

    const collections = ['userdetail', 'loginlog', 'stockscore', 'portfolio', 'backtest', 'etfscore'];

    for (const colName of collections) {
      try {
        const count = await db.collection(colName).countDocuments({
          $or: [
            { createdOn: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') } },
            { createdAt: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') } },
            { requestedAt: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') } },
            { savedDate: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') } }
          ]
        });
        console.log(`${colName}: ${count} records`);
      } catch (e) {
        console.log(`${colName}: error - ${e.message}`);
      }
    }

    // Check what dates EXIST in loginlog
    console.log('\n=== Actual dates in loginlog collection ===');
    const distinctDates = await db.collection('loginlog').aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdOn' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 5 }
    ]).toArray();

    distinctDates.forEach(d => {
      console.log(`${d._id}: ${d.count} records`);
    });

    // Check date range parsing
    console.log('\n=== Date range debugging ===');
    const today = new Date('2026-07-27T00:00:00.000Z');
    const tomorrow = new Date('2026-07-28T00:00:00.000Z');
    console.log(`Filter range: ${today.toISOString()} to ${tomorrow.toISOString()}`);

    // Check IST conversion
    const istToday = new Date('2026-07-27T00:00:00.000+05:30');
    const istTomorrow = new Date('2026-07-28T00:00:00.000+05:30');
    console.log(`IST range: ${istToday.toISOString()} to ${istTomorrow.toISOString()}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

checkAllData();
