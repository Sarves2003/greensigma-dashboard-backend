import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { FilterOptions } from '../types';

const LOGIN_DATA_CUTOFF = new Date('2026-05-23');
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LEDGER_SOURCES = ['login', 'stockScore', 'stockBacktest', 'etfScore', 'etfBacktest', 'intraday', 'portfolio', 'broker'] as const;
type LedgerSource = typeof LEDGER_SOURCES[number];

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}
function monthStart(key: string): Date {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1));
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

const PLOT5_CACHE_TTL_MS = 5 * 60 * 1000;

export class OverviewV2Service {
  private plot5Cache = new Map<string, { data: any; ts: number }>();

  // Build a userdetail filter from global filters (userType/state/district/referralCode) - no date
  private buildUserFilter(filters: FilterOptions): any {
    const f: any = {};
    if (filters.userType) f.type = filters.userType;
    if (filters.state) f.state = filters.state;
    if (filters.district) f.district = filters.district;
    if (filters.referralCode) f.referalCode = filters.referralCode;
    return f;
  }

  // ============ KEY METRICS ============
  async getKeyMetrics(filters: FilterOptions): Promise<any> {
    const db = getDatabase();
    const userFilter = this.buildUserFilter(filters);
    const { startDate, endDate } = filters.dateRange;

    const signups = await db.collection('userdetail').find({
      ...userFilter,
      createdOn: { $gte: startDate, $lt: endDate },
    }).project({ _id: 1, createdOn: 1, type: 1 }).toArray();

    const newSignups = signups.length;
    const newPaidCustomers = signups.filter((u: any) => u.type === 'Tribe').length;

    const daysInPeriod = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Avg Logins/Day - restrict to users matching non-date filters
    const filteredUserIds = filters.userType || filters.state || filters.district || filters.referralCode
      ? (await db.collection('userdetail').find(userFilter).project({ _id: 1 }).toArray()).map((u: any) => u._id)
      : null;

    const loginQuery: any = { loginTime: { $gte: startDate, $lt: endDate }, status: 'SUCCESS' };
    if (filteredUserIds) loginQuery.userId = { $in: filteredUserIds };
    const totalLogins = await db.collection('loginlogs').countDocuments(loginQuery);
    const avgLoginsPerDay = parseFloat((totalLogins / daysInPeriod).toFixed(2));

    // Active User Count - ONLY users who signed up in this period AND took ≥1 action (7 features, no login) in this same period
    const signupIdsStr = signups.map((u: any) => u._id.toString());
    const activeUserCount = signupIdsStr.length > 0
      ? await this.getActiveUserCount(startDate, endDate, signupIdsStr)
      : 0;

    // Avg Days to 1st Real Portfolio - for users who signed up in this period
    const avgDaysToFirstPortfolio = signupIdsStr.length > 0
      ? await this.getAvgDaysToFirstPortfolio(signupIdsStr, signups)
      : null;

    return {
      newSignups,
      newPaidCustomers,
      avgLoginsPerDay,
      activeUserCount,
      avgDaysToFirstPortfolio,
    };
  }

  private async getActiveUserCount(startDate: Date, endDate: Date, userIds: string[] | null): Promise<number> {
    const db = getDatabase();
    const scope = (q: any) => (userIds ? { ...q, userId: { $in: userIds } } : q);

    const [stockScore, backtest, etfScore, etfBacktest, intraday, portfolio, broker] = await Promise.all([
      db.collection('liveScoring_User_Tracking').distinct('userId', scope({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('backtest_Result').distinct('userId', scope({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('etf_liveScoring_User_Tracking').distinct('userId', scope({ requestedAt: { $gte: startDate, $lt: endDate } })),
      db.collection('ETF_Backtest_Result').distinct('userId', scope({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('intraday_User_Tracking').distinct('userId', scope({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('portfolio_details').distinct('userId', scope({ createdAt: { $gte: startDate, $lt: endDate } })),
      db.collection('borkrage_details').distinct('userId', scope({ createdAt: { $gte: startDate, $lt: endDate } })),
    ]);
    return new Set([...stockScore, ...backtest, ...etfScore, ...etfBacktest, ...intraday, ...portfolio, ...broker]).size;
  }

  private async getAvgDaysToFirstPortfolio(signupIdsStr: string[], signups: any[]): Promise<number | null> {
    const db = getDatabase();
    const deployments = await db.collection('portfolio_details')
      .find({ userId: { $in: signupIdsStr }, isInvested: true, borkrageType: { $in: ['kite', 'zebu'] } })
      .project({ userId: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .toArray();

    const firstDeployByUser = new Map<string, Date>();
    deployments.forEach((d: any) => {
      if (!firstDeployByUser.has(d.userId)) firstDeployByUser.set(d.userId, new Date(d.createdAt));
    });

    const signupDateByUser = new Map(signups.map((u: any) => [u._id.toString(), new Date(u.createdOn)]));
    const daysList: number[] = [];
    firstDeployByUser.forEach((deployDate, userId) => {
      const signupDate = signupDateByUser.get(userId);
      if (signupDate) daysList.push((deployDate.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24));
    });

    if (daysList.length === 0) return null;
    return parseFloat((daysList.reduce((a, b) => a + b, 0) / daysList.length).toFixed(1));
  }

  // ============ FEATURE USAGE (fixed avg/user bug) ============
  async getFeatureUsage(filters: FilterOptions): Promise<any[]> {
    const db = getDatabase();
    const userFilter = this.buildUserFilter(filters);
    const { startDate, endDate } = filters.dateRange;

    const hasUserFilter = filters.userType || filters.state || filters.district || filters.referralCode;
    const filteredUserIdsStr = hasUserFilter
      ? (await db.collection('userdetail').find(userFilter).project({ _id: 1 }).toArray()).map((u: any) => u._id.toString())
      : null;

    const scoped = (query: any) => {
      if (filteredUserIdsStr) return { ...query, userId: { $in: filteredUserIdsStr } };
      return query;
    };

    const [
      stockScoreCount, stockScoreUsers,
      etfScoreCount, etfScoreUsers,
      intradayCount, intradayUsers,
      stockBtSuccess, stockBtTotalUsers,
      etfBtSuccess, etfBtTotalUsers,
      liveRealPortfolios,
      brokerConnectedUsers,
    ] = await Promise.all([
      db.collection('liveScoring_User_Tracking').countDocuments(scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('liveScoring_User_Tracking').distinct('userId', scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('etf_liveScoring_User_Tracking').countDocuments(scoped({ requestedAt: { $gte: startDate, $lt: endDate } })),
      db.collection('etf_liveScoring_User_Tracking').distinct('userId', scoped({ requestedAt: { $gte: startDate, $lt: endDate } })),
      db.collection('intraday_User_Tracking').countDocuments(scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('intraday_User_Tracking').distinct('userId', scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('backtest_Result').countDocuments(scoped({ savedDate: { $gte: startDate, $lt: endDate }, status: 'Success' })),
      db.collection('backtest_Result').distinct('userId', scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('ETF_Backtest_Result').countDocuments(scoped({ savedDate: { $gte: startDate, $lt: endDate }, status: 'Success' })),
      db.collection('ETF_Backtest_Result').distinct('userId', scoped({ savedDate: { $gte: startDate, $lt: endDate } })),
      db.collection('portfolio_details').countDocuments(scoped({ createdAt: { $gte: startDate, $lt: endDate }, isInvested: true, borkrageType: { $in: ['kite', 'zebu'] } })),
      db.collection('borkrage_details').distinct('userId', scoped({ createdAt: { $gte: startDate, $lt: endDate } })),
    ]);

    const avg = (count: number, uniqueUsers: number) => uniqueUsers > 0 ? parseFloat((count / uniqueUsers).toFixed(1)) : null;

    return [
      { key: 'stockScores', label: 'Stock Scores', value: stockScoreCount, avgPerUser: avg(stockScoreCount, stockScoreUsers.length) },
      { key: 'stockBacktests', label: 'Stock Backtests', value: stockBtSuccess, avgPerUser: avg(stockBtSuccess, stockBtTotalUsers.length) },
      { key: 'etfScores', label: 'ETF Scores', value: etfScoreCount, avgPerUser: avg(etfScoreCount, etfScoreUsers.length) },
      { key: 'etfBacktests', label: 'ETF Backtests', value: etfBtSuccess, avgPerUser: avg(etfBtSuccess, etfBtTotalUsers.length) },
      { key: 'liveRealPortfolio', label: 'Live Real Portfolio', value: liveRealPortfolios, avgPerUser: null },
      { key: 'brokerConnected', label: 'Broker Connected', value: brokerConnectedUsers.length, avgPerUser: null },
      { key: 'intradayScores', label: 'Intraday Scores', value: intradayCount, avgPerUser: avg(intradayCount, intradayUsers.length) },
    ];
  }

  // ============ PLOT 1: New Signups Monthly (obeys global filter) ============
  async getSignupsMonthly(filters: FilterOptions): Promise<any> {
    const db = getDatabase();
    const userFilter = this.buildUserFilter(filters);
    const { startDate, endDate } = filters.dateRange;

    const rows = await db.collection('userdetail').aggregate([
      { $match: { ...userFilter, createdOn: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdOn' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();

    return {
      labels: rows.map((r: any) => monthLabel(r._id)),
      values: rows.map((r: any) => r.count),
    };
  }

  // ============ PLOT 2: Ledger usage count by signup cohort, summed (obeys global filter) ============
  async getLedgerUsageByCohort(filters: FilterOptions, ledgerItems: LedgerSource[]): Promise<any> {
    const db = getDatabase();
    const userFilter = this.buildUserFilter(filters);
    const { startDate, endDate } = filters.dateRange;

    const users = await db.collection('userdetail').find({
      ...userFilter,
      createdOn: { $gte: startDate, $lt: endDate },
    }).project({ _id: 1, createdOn: 1 }).toArray();

    if (users.length === 0) return { labels: [], values: [] };

    const cohortMap = new Map<string, string[]>(); // monthKey -> userIds
    const cohortObjectIds = new Map<string, ObjectId[]>();
    users.forEach((u: any) => {
      const key = monthKey(new Date(u.createdOn));
      if (!cohortMap.has(key)) { cohortMap.set(key, []); cohortObjectIds.set(key, []); }
      cohortMap.get(key)!.push(u._id.toString());
      cohortObjectIds.get(key)!.push(u._id);
    });

    const sortedKeys = [...cohortMap.keys()].sort();
    const values: number[] = [];

    const countConfigFor: Record<LedgerSource, { name: string; idField: 'obj' | 'str' }> = {
      login: { name: 'loginlogs', idField: 'obj' },
      stockScore: { name: 'liveScoring_User_Tracking', idField: 'str' },
      stockBacktest: { name: 'backtest_Result', idField: 'str' },
      etfScore: { name: 'etf_liveScoring_User_Tracking', idField: 'str' },
      etfBacktest: { name: 'ETF_Backtest_Result', idField: 'str' },
      intraday: { name: 'intraday_User_Tracking', idField: 'str' },
      portfolio: { name: 'portfolio_details', idField: 'str' },
      broker: { name: 'borkrage_details', idField: 'str' },
    };

    const totalsByCohort = new Map<string, number>();

    await Promise.all(sortedKeys.flatMap(key => {
      const userIdsStr = cohortMap.get(key)!;
      const userObjectIds = cohortObjectIds.get(key)!;
      totalsByCohort.set(key, 0);

      return ledgerItems.map(async item => {
        const cfg = countConfigFor[item];
        const query: any = { userId: { $in: cfg.idField === 'obj' ? userObjectIds : userIdsStr } };
        if (item === 'login') query.status = 'SUCCESS';
        const count = await db.collection(cfg.name).countDocuments(query);
        totalsByCohort.set(key, (totalsByCohort.get(key) || 0) + count);
      });
    }));

    return {
      labels: sortedKeys.map(monthLabel),
      values: sortedKeys.map(k => totalsByCohort.get(k) || 0),
    };
  }

  // ============ PLOT 3: 30-day activation rate (ignores ALL global filters) ============
  // Returns ONE row per signup month, Tribe only. Each user judged against their OWN createdOn + 30 days.
  // No whole-month eligibility gate — a month with recent signups just shows a lower/partial rate, honestly.
  async getActivationRate(monthKeys: string[], type: 'real' | 'paper'): Promise<any> {
    const db = getDatabase();
    const rows: any[] = [];

    for (const key of monthKeys) {
      const cStart = monthStart(key);
      const cEnd = addMonths(cStart, 1);

      const users = await db.collection('userdetail').find({
        type: 'Tribe',
        createdOn: { $gte: cStart, $lt: cEnd },
      }).project({ _id: 1, createdOn: 1 }).toArray();

      if (users.length === 0) {
        rows.push({ monthLabel: monthLabel(key), poolSize: 0, activatedCount: 0, rate: null });
        continue;
      }

      const userIdsStr = users.map((u: any) => u._id.toString());
      const signupDateMap = new Map(users.map((u: any) => [u._id.toString(), new Date(u.createdOn)]));

      const query: any = { userId: { $in: userIdsStr } };
      if (type === 'real') {
        query.isInvested = true;
        query.borkrageType = { $in: ['kite', 'zebu'] };
      } else {
        query.borkrageType = 'paper_trade';
      }

      const portfolios = await db.collection('portfolio_details').find(query).project({ userId: 1, createdAt: 1 }).toArray();

      const activatedSet = new Set<string>();
      portfolios.forEach((p: any) => {
        const signupDate = signupDateMap.get(p.userId);
        if (!signupDate) return;
        const days = (new Date(p.createdAt).getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days <= 30) activatedSet.add(p.userId);
      });

      rows.push({
        monthLabel: monthLabel(key),
        poolSize: users.length,
        activatedCount: activatedSet.size,
        rate: parseFloat((activatedSet.size / users.length * 100).toFixed(1)),
      });
    }

    return { rows };
  }

  // ============ PLOT 4: Live-capital deployment rate, real only, unbounded, Tribe only (ignores ALL global filters) ============
  async getLiveCapitalRate(monthKeys: string[]): Promise<any> {
    const db = getDatabase();
    const labels: string[] = [];
    const values: number[] = [];

    for (const key of monthKeys) {
      const cStart = monthStart(key);
      const cEnd = addMonths(cStart, 1);

      const cohortUsers = await db.collection('userdetail').find({
        type: 'Tribe',
        createdOn: { $gte: cStart, $lt: cEnd },
      }).project({ _id: 1 }).toArray();

      if (cohortUsers.length === 0) continue;

      const userIdsStr = cohortUsers.map((u: any) => u._id.toString());
      const realUsers = await db.collection('portfolio_details').distinct('userId', {
        userId: { $in: userIdsStr },
        isInvested: true,
        borkrageType: { $in: ['kite', 'zebu'] },
      });

      labels.push(monthLabel(key));
      values.push(parseFloat((realUsers.length / cohortUsers.length * 100).toFixed(1)));
    }

    return { labels, values };
  }

  // ============ PLOT 5: Monthly Active Paid Users, Tribe only, last 12 months (ignores ALL global filters) ============
  async getMonthlyActivePaid(ledgerItems: LedgerSource[]): Promise<any> {
    const cacheKey = [...ledgerItems].sort().join(',');
    const cached = this.plot5Cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PLOT5_CACHE_TTL_MS) {
      return cached.data;
    }

    const result = await this.computeMonthlyActivePaid(ledgerItems);
    this.plot5Cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  }

  private async computeMonthlyActivePaid(ledgerItems: LedgerSource[]): Promise<any> {
    const db = getDatabase();
    const tribeUsers = await db.collection('userdetail').find({ type: 'Tribe' }).project({ _id: 1 }).toArray();
    const tribeIdsStr = tribeUsers.map((u: any) => u._id.toString());
    const tribeObjectIds = tribeUsers.map((u: any) => u._id);

    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      months.push(monthKey(addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -i)));
    }

    const collectionFor: Record<LedgerSource, { name: string; dateField: string; idField: 'obj' | 'str' }> = {
      login: { name: 'loginlogs', dateField: 'loginTime', idField: 'obj' },
      stockScore: { name: 'liveScoring_User_Tracking', dateField: 'savedDate', idField: 'str' },
      stockBacktest: { name: 'backtest_Result', dateField: 'savedDate', idField: 'str' },
      etfScore: { name: 'etf_liveScoring_User_Tracking', dateField: 'requestedAt', idField: 'str' },
      etfBacktest: { name: 'ETF_Backtest_Result', dateField: 'savedDate', idField: 'str' },
      intraday: { name: 'intraday_User_Tracking', dateField: 'savedDate', idField: 'str' },
      portfolio: { name: 'portfolio_details', dateField: 'createdAt', idField: 'str' },
      broker: { name: 'borkrage_details', dateField: 'createdAt', idField: 'str' },
    };

    // Fire all (month x ledgerItem) queries in parallel instead of looping sequentially
    const activeSets: Map<string, Set<string>> = new Map(months.map(k => [k, new Set<string>()]));

    await Promise.all(months.flatMap(key => {
      const mStart = monthStart(key);
      const mEnd = addMonths(mStart, 1);

      return ledgerItems.map(async item => {
        const cfg = collectionFor[item];
        const userIdMatch = cfg.idField === 'obj' ? tribeObjectIds : tribeIdsStr;
        const query: any = { userId: { $in: userIdMatch }, [cfg.dateField]: { $gte: mStart, $lt: mEnd } };
        if (item === 'login') query.status = 'SUCCESS';

        const ids = await db.collection(cfg.name).distinct('userId', query);
        const targetSet = activeSets.get(key)!;
        ids.forEach((id: any) => targetSet.add(id.toString()));
      });
    }));

    return {
      labels: months.map(monthLabel),
      values: months.map(k => activeSets.get(k)!.size),
      totalTribeUsers: tribeUsers.length,
    };
  }
}

export { LEDGER_SOURCES, LedgerSource };
