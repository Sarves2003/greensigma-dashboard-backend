import { Db } from 'mongodb';
export declare function connectDatabase(): Promise<Db>;
export declare function getDatabase(): Db;
export declare function closeDatabase(): Promise<void>;
export declare const COLLECTIONS: {
    readonly USERS: "userdetail";
    readonly LOGIN_LOGS: "loginlogs";
    readonly STOCK_SCORES: "liveScoring_User_Tracking";
    readonly BACKTEST_RESULTS: "backtest_Result";
    readonly ETF_SCORES: "etf_liveScoring_User_Tracking";
    readonly ETF_BACKTEST: "ETF_Backtest_Result";
    readonly BROKER_DETAILS: "borkrage_details";
    readonly PORTFOLIO: "portfolio_details";
    readonly INTRADAY_SCORES: "intraday_User_Tracking";
    readonly STOCK_LISTS: "Stock_Lists";
    readonly REALIZED_RETURNS: "realizedreturns";
    readonly WEBINAR_BATCH_DATES: "webinar_batch_dates";
    readonly DASHBOARD_USERS: "dashboard_users";
    readonly DASHBOARD_ROLE_PERMISSIONS: "dashboard_role_permissions";
};
//# sourceMappingURL=database.d.ts.map