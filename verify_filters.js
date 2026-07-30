const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function verifyFilters() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('admin');

    // Query 1: Total Free users
    console.log('=== Query 1: Total Free users ===');
    const freeUsersCount = await db.collection('userdetail').countDocuments({ type: 'Free' });
    console.log(`Total Free users: ${freeUsersCount}\n`);

    // Query 2: New Free users today
    console.log('=== Query 2: New Free users created TODAY (2026-07-27) ===');
    const newFreeUsersToday = await db.collection('userdetail').countDocuments({
      type: 'Free',
      createdOn: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') }
    });
    console.log(`New Free users today: ${newFreeUsersToday}\n`);

    // Query 3: All successful logins today (all users)
    console.log('=== Query 3: All successful logins TODAY (all user types) ===');
    const allSuccessfulLoginsToday = await db.collection('loginlog').countDocuments({
      createdOn: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') },
      status: 'Success'
    });
    console.log(`All successful logins today: ${allSuccessfulLoginsToday}\n`);

    // Query 4: Successful logins from Free users only today
    console.log('=== Query 4: Successful logins from Free users only TODAY ===');
    const freeUserIds = await db.collection('userdetail')
      .find({ type: 'Free' })
      .project({ _id: 1 })
      .toArray();
    const freeUserIdStrings = freeUserIds.map(u => u._id.toString());

    console.log(`Free users found: ${freeUserIds.length}`);
    if (freeUserIds.length > 0) {
      console.log(`Sample Free user IDs: ${freeUserIdStrings.slice(0, 5).join(', ')}\n`);
    }

    const freeSuccessfulLoginsToday = await db.collection('loginlog').countDocuments({
      userId: { $in: freeUserIdStrings },
      createdOn: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') },
      status: 'Success'
    });
    console.log(`Successful logins from Free users today: ${freeSuccessfulLoginsToday}\n`);

    // Query 5: Check broker data
    console.log('=== Query 5: Brokers created TODAY ===');
    const brokersToday = await db.collection('portfolio').find({
      createdAt: { $gte: new Date('2026-07-27T00:00:00.000Z'), $lt: new Date('2026-07-28T00:00:00.000Z') },
      borkrageType: 'kite'
    }).toArray();
    console.log(`Total broker connections today: ${brokersToday.length}`);
    if (brokersToday.length > 0) {
      console.log(`Sample brokers:`, brokersToday.slice(0, 3).map(b => ({ userId: b.userId, type: b.borkrageType })));
    }

    // Get user types for those broker userIds
    if (brokersToday.length > 0) {
      const brokerUserIds = brokersToday.map(b => b.userId);
      const brokerUsers = await db.collection('userdetail')
        .find({ _id: { $in: brokerUserIds } })
        .project({ _id: 1, type: 1 })
        .toArray();

      console.log(`\nUser types for brokers:`);
      brokerUsers.forEach(u => console.log(`  ${u._id}: ${u.type}`));

      const freeCount = brokerUsers.filter(u => u.type === 'Free').length;
      console.log(`\nBrokers belonging to Free users: ${freeCount}`);
      console.log(`Brokers NOT belonging to Free users: ${brokersToday.length - freeCount}\n`);
    }

    // Summary
    console.log('=== SUMMARY ===');
    console.log(`Dashboard shows with "Free" filter: Successful Logins = 180`);
    console.log(`Actual for Free users only: Successful Logins = ${freeSuccessfulLoginsToday}`);
    console.log(`Match? ${freeSuccessfulLoginsToday === 180 ? '✓ YES - Filter working' : '✗ NO - Filter NOT working'}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

verifyFilters();
