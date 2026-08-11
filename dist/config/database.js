"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTIONS = void 0;
exports.connectDatabase = connectDatabase;
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
const mongodb_1 = require("mongodb");
let mongoClient;
let database;
async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }
    try {
        mongoClient = new mongodb_1.MongoClient(mongoUri);
        await mongoClient.connect();
        database = mongoClient.db('admin');
        console.log('Connected to MongoDB');
        return database;
    }
    catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}
function getDatabase() {
    if (!database) {
        throw new Error('Database not initialized. Call connectDatabase first.');
    }
    return database;
}
async function closeDatabase() {
    if (mongoClient) {
        await mongoClient.close();
        console.log('Disconnected from MongoDB');
    }
}
exports.COLLECTIONS = {
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
};
//# sourceMappingURL=database.js.map