const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function findLoginDates() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('admin');

    // Get latest login dates
    console.log('=== Latest login records ===');
    const latestLogins = await db.collection('loginlog')
      .find({})
      .sort({ createdOn: -1 })
      .limit(10)
      .toArray();

    console.log(`Total login records in database: ${await db.collection('loginlog').countDocuments()}\n`);

    latestLogins.forEach((login, i) => {
      console.log(`${i + 1}. Date: ${login.createdOn}, Status: ${login.status}`);
    });

    // Count successful logins by date
    console.log('\n=== Successful logins grouped by date ===');
    const loginsByDate = await db.collection('loginlog').aggregate([
      { $match: { status: 'Success' } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdOn' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 10 }
    ]).toArray();

    loginsByDate.forEach(row => {
      console.log(`${row._id}: ${row.count} successful logins`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

findLoginDates();
