import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { FilterOptions } from '../types';

const LOGIN_DATA_CUTOFF = new Date('2026-05-23');
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LEDGER_SOURCES = ['login', 'stockScore', 'stockBacktest', 'etfScore', 'etfBacktest', 'intraday', 'portfolio', 'broker'] as const;
type LedgerSource = typeof LEDGER_SOURCES[number];

// Same 7 features as getActiveUserCount's "active" definition — login alone never counts.
export const ACTIVE_ACTION_COLLECTIONS: { name: string; dateField: string }[] = [
  { name: 'liveScoring_User_Tracking', dateField: 'savedDate' },
  { name: 'backtest_Result', dateField: 'savedDate' },
  { name: 'etf_liveScoring_User_Tracking', dateField: 'requestedAt' },
  { name: 'ETF_Backtest_Result', dateField: 'savedDate' },
  { name: 'intraday_User_Tracking', dateField: 'savedDate' },
  { name: 'portfolio_details', dateField: 'createdAt' },
  { name: 'borkrage_details', dateField: 'createdAt' },
];

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

    // Active User Count - ONLY users who signed up in this period AND took ≥1 action (7 features, no login) in this same period
    const signupIdsStr = signups.map((u: any) => u._id.toString());
    const signupIds = signups.map((u: any) => u._id);

    // Avg Logins/Day - ONLY users who signed up in this period (same cohort as every other Key Metrics card), logins within this same period
    const loginQuery: any = { loginTime: { $gte: startDate, $lt: endDate }, status: 'SUCCESS' };
    if (signupIds.length > 0) loginQuery.userId = { $in: signupIds };
    const totalLogins = signupIds.length > 0 ? await db.collection('loginlogs').countDocuments(loginQuery) : 0;
    const avgLoginsPerDay = parseFloat((totalLogins / daysInPeriod).toFixed(2));
    const distinctLoginUsers = signupIds.length > 0
      ? (await db.collection('loginlogs').distinct('userId', loginQuery)).length
      : 0;
    const loginRate = newSignups > 0 ? parseFloat((distinctLoginUsers / newSignups * 100).toFixed(1)) : 0;
    const activeUserCount = signupIdsStr.length > 0
      ? await this.getActiveUserCount(startDate, endDate, signupIdsStr)
      : 0;
    const activeUserRate = newSignups > 0 ? parseFloat((activeUserCount / newSignups * 100).toFixed(1)) : 0;

    // Avg Days to 1st Real Portfolio - for users who signed up in this period
    const avgDaysToFirstPortfolio = signupIdsStr.length > 0
      ? await this.getAvgDaysToFirstPortfolio(signupIdsStr, signups)
      : null;

    return {
      newSignups,
      newPaidCustomers,
      totalLogins,
      distinctLoginUsers,
      loginRate,
      avgLoginsPerDay,
      activeUserCount,
      activeUserRate,
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

  // ============ FEATURE USAGE (cohort = signed up in period, usage = cumulative through today) ============
  async getFeatureUsage(filters: FilterOptions): Promise<any[]> {
    const db = getDatabase();
    const userFilter = this.buildUserFilter(filters);
    const { startDate, endDate } = filters.dateRange;

    const cohort = await db.collection('userdetail').find({
      ...userFilter,
      createdOn: { $gte: startDate, $lt: endDate },
    }).project({ _id: 1 }).toArray();

    const cohortIdsStr = cohort.map((u: any) => u._id.toString());

    const empty = [
      { key: 'stockScores', label: 'Stock Scores', value: 0, avgPerUser: null },
      { key: 'stockBacktests', label: 'Stock Backtests', value: 0, avgPerUser: null },
      { key: 'etfScores', label: 'ETF Scores', value: 0, avgPerUser: null },
      { key: 'etfBacktests', label: 'ETF Backtests', value: 0, avgPerUser: null },
      { key: 'liveRealPortfolio', label: 'Live Real Portfolio', value: 0, avgPerUser: null },
      { key: 'brokerConnected', label: 'Broker Connected', value: 0, avgPerUser: null },
      { key: 'intradayScores', label: 'Intraday Scores', value: 0, avgPerUser: null },
    ];
    if (cohortIdsStr.length === 0) return empty;

    const scoped = (query: any = {}) => ({ ...query, userId: { $in: cohortIdsStr } });

    const [
      stockScoreCount, stockScoreUsers,
      etfScoreCount, etfScoreUsers,
      intradayCount, intradayUsers,
      stockBtSuccess, stockBtTotalUsers,
      etfBtSuccess, etfBtTotalUsers,
      liveRealPortfolios,
      brokerConnectedUsers,
    ] = await Promise.all([
      db.collection('liveScoring_User_Tracking').countDocuments(scoped()),
      db.collection('liveScoring_User_Tracking').distinct('userId', scoped()),
      db.collection('etf_liveScoring_User_Tracking').countDocuments(scoped()),
      db.collection('etf_liveScoring_User_Tracking').distinct('userId', scoped()),
      db.collection('intraday_User_Tracking').countDocuments(scoped()),
      db.collection('intraday_User_Tracking').distinct('userId', scoped()),
      db.collection('backtest_Result').countDocuments(scoped({ status: 'Success' })),
      db.collection('backtest_Result').distinct('userId', scoped()),
      db.collection('ETF_Backtest_Result').countDocuments(scoped({ status: 'Success' })),
      db.collection('ETF_Backtest_Result').distinct('userId', scoped()),
      db.collection('portfolio_details').countDocuments(scoped({ isInvested: true, borkrageType: { $in: ['kite', 'zebu'] } })),
      db.collection('borkrage_details').distinct('userId', scoped()),
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

  // ============ PLOT 3: N-day activation rate (ignores ALL global filters) ============
  // Returns ONE row per signup month, Tribe only. Each user judged against their OWN createdOn + dayWindow.
  // No whole-month eligibility gate — a month with recent signups just shows a lower/partial rate, honestly.
  async getActivationRate(monthKeys: string[], type: 'real' | 'paper', dayWindow: number = 30): Promise<any> {
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
        if (days >= 0 && days <= dayWindow) activatedSet.add(p.userId);
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

  // ============ Active User Flow: daily breakdown + rolling N-day total, trailing window ending today ============
  // "Active" = same 7-feature definition as getActiveUserCount (login alone doesn't count).
  async getActiveUserFlow(userType: string, dayWindow: number): Promise<any> {
    const db = getDatabase();

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowStart = new Date(todayStart.getTime() - (dayWindow - 1) * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000); // exclusive, covers all of today

    let eligibleUserIds: string[] | null = null;
    if (userType && userType !== 'all') {
      const users = await db.collection('userdetail').find({ type: userType }).project({ _id: 1 }).toArray();
      eligibleUserIds = users.map((u: any) => u._id.toString());
    }

    const dayBuckets = new Map<string, Set<string>>();
    for (let i = 0; i < dayWindow; i++) {
      const d = new Date(windowStart.getTime() + i * 24 * 60 * 60 * 1000);
      dayBuckets.set(d.toISOString().slice(0, 10), new Set());
    }

    await Promise.all(ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
      const query: any = { [cfg.dateField]: { $gte: windowStart, $lt: windowEnd } };
      if (eligibleUserIds) query.userId = { $in: eligibleUserIds };

      const docs = await db.collection(cfg.name)
        .find(query)
        .project({ userId: 1, [cfg.dateField]: 1 })
        .toArray();

      docs.forEach((doc: any) => {
        const uid = doc.userId?.toString();
        const rawDate = doc[cfg.dateField];
        if (!uid || !rawDate) return;
        const dayKey = new Date(rawDate).toISOString().slice(0, 10);
        dayBuckets.get(dayKey)?.add(uid);
      });
    }));

    const sortedDays = [...dayBuckets.keys()].sort();
    const dailyRows = sortedDays.map((day) => ({
      date: day,
      activeUsers: dayBuckets.get(day)!.size,
    }));

    const rollingActiveUsers = new Set<string>();
    dayBuckets.forEach((set) => set.forEach((uid) => rollingActiveUsers.add(uid)));

    const todayKey = todayStart.toISOString().slice(0, 10);
    const todayActiveUsers = dayBuckets.get(todayKey)?.size || 0;
    const stickinessRatio = rollingActiveUsers.size > 0
      ? parseFloat((todayActiveUsers / rollingActiveUsers.size * 100).toFixed(1))
      : 0;

    return {
      dayWindow,
      dailyRows,
      todayActiveUsers,
      rollingActiveUsers: rollingActiveUsers.size,
      stickinessRatio,
    };
  }

  // ============ Active User Flow by calendar period: This Month / Last Month / Last 3 Months ============
  // months[]: per-calendar-month MAU (for the Sum/Avg toggle). avgDailyActiveUsers/stickinessRatio use
  // the whole selected range's own day-by-day breakdown, not a sum across months (no double counting).
  async getActiveUserFlowByPeriod(userType: string, period: 'thisMonth' | 'lastMonth' | 'last3Months'): Promise<any> {
    const db = getDatabase();
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let monthStarts: Date[];
    let rangeStart: Date;
    let rangeEnd: Date;

    if (period === 'lastMonth') {
      const lastMonthStart = addMonths(currentMonthStart, -1);
      monthStarts = [lastMonthStart];
      rangeStart = lastMonthStart;
      rangeEnd = currentMonthStart;
    } else if (period === 'last3Months') {
      monthStarts = [addMonths(currentMonthStart, -2), addMonths(currentMonthStart, -1), currentMonthStart];
      rangeStart = monthStarts[0];
      rangeEnd = addMonths(currentMonthStart, 1);
    } else {
      monthStarts = [currentMonthStart];
      rangeStart = currentMonthStart;
      rangeEnd = addMonths(currentMonthStart, 1);
    }

    let eligibleUserIds: string[] | null = null;
    if (userType && userType !== 'all') {
      const users = await db.collection('userdetail').find({ type: userType }).project({ _id: 1 }).toArray();
      eligibleUserIds = users.map((u: any) => u._id.toString());
    }

    // Pre-populate every day up to "today" so zero-activity days count toward the average, not just days with data.
    const todayExclusiveEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 24 * 60 * 60 * 1000);
    const effectiveEnd = rangeEnd < todayExclusiveEnd ? rangeEnd : todayExclusiveEnd;

    const dayBuckets = new Map<string, Set<string>>();
    for (let d = new Date(rangeStart); d < effectiveEnd; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      dayBuckets.set(d.toISOString().slice(0, 10), new Set());
    }

    await Promise.all(ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
      const query: any = { [cfg.dateField]: { $gte: rangeStart, $lt: rangeEnd } };
      if (eligibleUserIds) query.userId = { $in: eligibleUserIds };

      const docs = await db.collection(cfg.name)
        .find(query)
        .project({ userId: 1, [cfg.dateField]: 1 })
        .toArray();

      docs.forEach((doc: any) => {
        const uid = doc.userId?.toString();
        const rawDate = doc[cfg.dateField];
        if (!uid || !rawDate) return;
        const dayKey = new Date(rawDate).toISOString().slice(0, 10);
        dayBuckets.get(dayKey)?.add(uid);
      });
    }));

    const months = monthStarts.map((mStart) => {
      const mEnd = addMonths(mStart, 1);
      const monthUsers = new Set<string>();
      dayBuckets.forEach((set, dayKey) => {
        const d = new Date(dayKey);
        if (d >= mStart && d < mEnd) set.forEach((uid) => monthUsers.add(uid));
      });
      return { monthLabel: monthLabel(monthKey(mStart)), activeUsers: monthUsers.size };
    });

    const dailyCounts = [...dayBuckets.values()].map((set) => set.size);
    const sumDailyActiveUsers = dailyCounts.reduce((a, b) => a + b, 0);
    const avgDailyActiveUsers = dailyCounts.length > 0
      ? parseFloat((sumDailyActiveUsers / dailyCounts.length).toFixed(1))
      : 0;

    const combinedSet = new Set<string>();
    dayBuckets.forEach((set) => set.forEach((uid) => combinedSet.add(uid)));
    const combinedActiveUsers = combinedSet.size;

    const stickinessRatio = combinedActiveUsers > 0
      ? parseFloat((avgDailyActiveUsers / combinedActiveUsers * 100).toFixed(1))
      : 0;

    return {
      months,
      combinedActiveUsers,
      avgDailyActiveUsers,
      sumDailyActiveUsers,
      stickinessRatio,
    };
  }

  // ============ Engagement Distribution: how many distinct days each active user showed up ============
  // Answers what a single stickiness ratio can't: whether the MAU pool is a broad base of occasional
  // users, or a small hardcore of daily regulars. Buckets are fixed day-count ranges (not tied to the
  // period length), so "22+ days" naturally covers everything from a 22-day custom range to a full
  // Last-3-Months window without needing period-specific bucket edges.
  private static readonly ENGAGEMENT_BUCKETS = [
    { label: '1 day', min: 1, max: 1 },
    { label: '2-3 days', min: 2, max: 3 },
    { label: '4-7 days', min: 4, max: 7 },
    { label: '8-14 days', min: 8, max: 14 },
    { label: '15-21 days', min: 15, max: 21 },
    { label: '22+ days', min: 22, max: Infinity },
  ];

  async getEngagementDistribution(
    userType: string,
    period: 'thisMonth' | 'lastMonth' | 'last3Months' | 'custom',
    customStart?: Date,
    customEnd?: Date
  ): Promise<any> {
    const db = getDatabase();
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let rangeStart: Date;
    let rangeEnd: Date; // exclusive

    if (period === 'lastMonth') {
      rangeStart = addMonths(currentMonthStart, -1);
      rangeEnd = currentMonthStart;
    } else if (period === 'last3Months') {
      rangeStart = addMonths(currentMonthStart, -2);
      rangeEnd = addMonths(currentMonthStart, 1);
    } else if (period === 'custom' && customStart && customEnd) {
      rangeStart = new Date(Date.UTC(customStart.getUTCFullYear(), customStart.getUTCMonth(), customStart.getUTCDate()));
      rangeEnd = new Date(Date.UTC(customEnd.getUTCFullYear(), customEnd.getUTCMonth(), customEnd.getUTCDate()) + 24 * 60 * 60 * 1000);
    } else {
      rangeStart = currentMonthStart;
      rangeEnd = addMonths(currentMonthStart, 1);
    }

    let eligibleUserIds: string[] | null = null;
    if (userType && userType !== 'all') {
      const users = await db.collection('userdetail').find({ type: userType }).project({ _id: 1 }).toArray();
      eligibleUserIds = users.map((u: any) => u._id.toString());
    }

    const todayExclusiveEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 24 * 60 * 60 * 1000);
    const effectiveEnd = rangeEnd < todayExclusiveEnd ? rangeEnd : todayExclusiveEnd;

    const userDayMap = new Map<string, Set<string>>();

    await Promise.all(ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
      const query: any = { [cfg.dateField]: { $gte: rangeStart, $lt: effectiveEnd } };
      if (eligibleUserIds) query.userId = { $in: eligibleUserIds };

      const docs = await db.collection(cfg.name)
        .find(query)
        .project({ userId: 1, [cfg.dateField]: 1 })
        .toArray();

      docs.forEach((doc: any) => {
        const uid = doc.userId?.toString();
        const rawDate = doc[cfg.dateField];
        if (!uid || !rawDate) return;
        const dayKey = new Date(rawDate).toISOString().slice(0, 10);
        if (!userDayMap.has(uid)) userDayMap.set(uid, new Set());
        userDayMap.get(uid)!.add(dayKey);
      });
    }));

    const mau = userDayMap.size;
    const totalDaysInRange = Math.round((effectiveEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));

    const buckets = OverviewV2Service.ENGAGEMENT_BUCKETS.map((b) => ({ label: b.label, users: 0 }));
    userDayMap.forEach((days) => {
      const count = days.size;
      const idx = OverviewV2Service.ENGAGEMENT_BUCKETS.findIndex((b) => count >= b.min && count <= b.max);
      if (idx >= 0) buckets[idx].users++;
    });

    const bucketsWithPct = buckets.map((b) => ({
      ...b,
      pct: mau > 0 ? parseFloat((b.users / mau * 100).toFixed(1)) : 0,
    }));

    return {
      rangeStart: rangeStart.toISOString().slice(0, 10),
      rangeEnd: new Date(effectiveEnd.getTime() - 1).toISOString().slice(0, 10),
      totalDaysInRange,
      mau,
      buckets: bucketsWithPct,
    };
  }

  // ============ Active User Breakdown: one bar per bucket, bucketed daily/monthly/quarterly/by day-of-week ============
  // "sum" per bucket = distinct/unique active users across that bucket's days (not a naive daily-count addition).
  // "avg" per bucket = mean of the bucket's individual daily active-user counts.
  async getActiveUserBreakdown(
    userType: string,
    granularity: 'daily' | 'monthly' | 'quarterly' | 'daywise',
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const db = getDatabase();
    const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const rangeEndExclusive = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

    let eligibleUserIds: string[] | null = null;
    if (userType && userType !== 'all') {
      const users = await db.collection('userdetail').find({ type: userType }).project({ _id: 1 }).toArray();
      eligibleUserIds = users.map((u: any) => u._id.toString());
    }

    const dayBuckets = new Map<string, Set<string>>();
    for (let d = new Date(startDate); d < rangeEndExclusive; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      dayBuckets.set(d.toISOString().slice(0, 10), new Set());
    }

    await Promise.all(ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
      const query: any = { [cfg.dateField]: { $gte: startDate, $lt: rangeEndExclusive } };
      if (eligibleUserIds) query.userId = { $in: eligibleUserIds };

      const docs = await db.collection(cfg.name)
        .find(query)
        .project({ userId: 1, [cfg.dateField]: 1 })
        .toArray();

      docs.forEach((doc: any) => {
        const uid = doc.userId?.toString();
        const rawDate = doc[cfg.dateField];
        if (!uid || !rawDate) return;
        const dayKey = new Date(rawDate).toISOString().slice(0, 10);
        dayBuckets.get(dayKey)?.add(uid);
      });
    }));

    const dayKeys = [...dayBuckets.keys()].sort();
    const groupMap = new Map<string, string[]>();

    dayKeys.forEach((dayKey) => {
      const d = new Date(`${dayKey}T00:00:00Z`);
      let groupKey: string;

      if (granularity === 'monthly') {
        groupKey = monthKey(d);
      } else if (granularity === 'quarterly') {
        groupKey = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
      } else if (granularity === 'daywise') {
        groupKey = String(d.getUTCDay());
      } else {
        groupKey = dayKey;
      }

      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey)!.push(dayKey);
    });

    const orderedKeys = granularity === 'daywise'
      ? ['0', '1', '2', '3', '4', '5', '6'].filter((k) => groupMap.has(k))
      : [...groupMap.keys()].sort();

    const bars = orderedKeys.map((key) => {
      const daysInGroup = groupMap.get(key)!;
      const dailySizes = daysInGroup.map((dk) => dayBuckets.get(dk)!.size);
      const avg = dailySizes.length > 0
        ? parseFloat((dailySizes.reduce((a, b) => a + b, 0) / dailySizes.length).toFixed(1))
        : 0;

      const uniqueSet = new Set<string>();
      daysInGroup.forEach((dk) => dayBuckets.get(dk)!.forEach((uid) => uniqueSet.add(uid)));

      let label: string;
      if (granularity === 'monthly') {
        label = monthLabel(key);
      } else if (granularity === 'quarterly') {
        const [y, q] = key.split('-Q');
        label = `Q${q} ${y}`;
      } else if (granularity === 'daywise') {
        label = WEEKDAY_NAMES[parseInt(key, 10)];
      } else {
        const d = new Date(`${key}T00:00:00Z`);
        label = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
      }

      return { label, sum: uniqueSet.size, avg };
    });

    return { granularity, bars };
  }
}

export { LEDGER_SOURCES, LedgerSource };
