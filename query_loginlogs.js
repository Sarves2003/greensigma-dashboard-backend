const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function queryLoginlogs() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('admin');

    // Query loginlogs (lowercase) collection
    console.log('=== Querying loginlogs (lowercase) collection ===');
    const loginlogsCount = await db.collection('loginlogs').countDocuments();
    console.log(`Total records in loginlogs: ${loginlogsCount}`);

    // Get sample records
    const samples = await db.collection('loginlogs').find({}).limit(3).toArray();
    console.log(`\nSample records:`);
    samples.forEach((doc, i) => {
      console.log(`${i + 1}. ${JSON.stringify(doc, null, 2).substring(0, 200)}...`);
    });

    // Count by status
    console.log(`\n=== Login count by status ===`);
    const statusCounts = await db.collection('loginlogs').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    statusCounts.forEach(s => console.log(`${s._id}: ${s.count}`));

    // Check what fields exist
    console.log(`\n=== Fields in loginlogs documents ===`);
    if (samples.length > 0) {
      console.log(Object.keys(samples[0]));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

queryLoginlogs();
