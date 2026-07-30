const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function check() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('admin');

    console.log('=== Collection existence ===');
    const collections = await db.listCollections().toArray();
    const names = collections.map(c => c.name);
    
    console.log(`loginlogs exists: ${names.includes('loginlogs')}`);
    console.log(`LOGIN_LOGS exists: ${names.includes('LOGIN_LOGS')}`);

    console.log('\n=== Query results ===');
    const loginlogsCount = await db.collection('loginlogs').countDocuments({ status: 'SUCCESS', loginTime: { $gte: new Date('2026-07-27'), $lt: new Date('2026-07-28') } });
    console.log(`loginlogs SUCCESS for 2026-07-27: ${loginlogsCount}`);

    const loginlogsAllCount = await db.collection('loginlogs').countDocuments({ status: 'SUCCESS' });
    console.log(`loginlogs SUCCESS total: ${loginlogsAllCount}`);

    try {
      const LOGIN_LOGS_Count = await db.collection('LOGIN_LOGS').countDocuments();
      console.log(`LOGIN_LOGS total: ${LOGIN_LOGS_Count}`);
    } catch (e) {
      console.log(`LOGIN_LOGS: Error - ${e.message}`);
    }

  } finally {
    await client.close();
  }
}

check();
