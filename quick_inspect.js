const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://greenSigmaAdmin:greensigma%4015@34.135.84.14:27017/?authSource=admin';

async function quickInspect() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('admin');

    console.log('Checking collections for stock/backtest/etf/portfolio data...\n');

    // Check what collections exist
    const allCollections = await db.listCollections().toArray();
    const names = allCollections.map(c => c.name);

    console.log('All collections containing "stock", "etf", "backtest", "score", "portfolio":');
    const relevant = names.filter(n => {
      const l = n.toLowerCase();
      return l.includes('stock') || l.includes('etf') || l.includes('backtest') || l.includes('score') || l.includes('portfolio');
    });

    relevant.forEach(name => {
      console.log(`  - ${name}`);
    });

    // For each relevant collection, show sample and field names
    console.log('\n═'.repeat(80));

    for (const colName of relevant.slice(0, 15)) {  // Limit to 15 to avoid timeout
      try {
        const count = await db.collection(colName).countDocuments();
        const doc = await db.collection(colName).findOne();

        if (count > 0) {
          console.log(`\n📋 ${colName}`);
          console.log(`   Count: ${count} documents`);
          console.log(`   Fields: ${Object.keys(doc).join(', ')}`);

          // Show date fields
          Object.keys(doc).forEach(key => {
            if (doc[key] instanceof Date || key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
              console.log(`   📅 ${key}: ${doc[key]}`);
            }
          });

          // Show sample userId field if exists
          if (doc.userId) {
            console.log(`   userId field exists: ✓`);
          }
          if (doc.user_id) {
            console.log(`   user_id field exists: ✓`);
          }
        }
      } catch (e) {
        console.log(`   ERROR: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

quickInspect();
