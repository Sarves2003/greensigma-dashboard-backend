import { MongoClient, Db } from 'mongodb';

let mongoClient: MongoClient;
let database: Db;

export async function connectDatabase(): Promise<Db> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    database = mongoClient.db('admin');
    console.log('Connected to MongoDB');
    return database;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error('Database not initialized. Call connectDatabase first.');
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    console.log('Disconnected from MongoDB');
  }
}

export const COLLECTIONS = {
  USERS: 'userdetail',
  LOGIN_LOGS: 'loginlogs',
  STOCK_SCORES: 'liveScoring_User_Tracking',
  BACKTEST_RESULTS: 'backtest_Result',
  ETF_SCORES: 'etf_liveScoring_User_Tracking',
  ETF_BACKTEST: 'ETF_Backtest_Result',
  BROKER_DETAILS: 'borkrage_details',
  PORTFOLIO: 'portfolio_details',
  INTRADAY_SCORES: 'intraday_User_Tracking',
  STOCK_LISTS: 'Stock_Lists',
  REALIZED_RETURNS: 'realizedreturns',
  WEBINAR_BATCH_DATES: 'webinar_batch_dates',
  DASHBOARD_USERS: 'dashboard_users',
  DASHBOARD_ROLE_PERMISSIONS: 'dashboard_role_permissions',
} as const;
