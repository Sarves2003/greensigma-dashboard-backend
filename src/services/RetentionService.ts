import { UserRepository } from '../repository/UserRepository';
import { LoginLogRepository } from '../repository/LoginLogRepository';
import { StockScoreRepository } from '../repository/ActivityRepository';
import { BacktestRepository } from '../repository/ActivityRepository';
import { ETFScoreRepository } from '../repository/ActivityRepository';
import { ETFBacktestRepository } from '../repository/ActivityRepository';
import { IntradayScoreRepository } from '../repository/ActivityRepository';
import { BrokerRepository } from '../repository/BrokerRepository';
import { PortfolioRepository } from '../repository/BrokerRepository';
import { FilterOptions, User } from '../types';
import { getDatabase } from '../config/database';

const LOGIN_DATA_CUTOFF = new Date('2026-05-23');

export class RetentionService {
  private userRepo = new UserRepository();
  private loginRepo = new LoginLogRepository();
  private stockScoreRepo = new StockScoreRepository();
  private backtestRepo = new BacktestRepository();
  private etfScoreRepo = new ETFScoreRepository();
  private etfBacktestRepo = new ETFBacktestRepository();
  private intradayRepo = new IntradayScoreRepository();
  private brokerRepo = new BrokerRepository();
  private portfolioRepo = new PortfolioRepository();

  // Get cohort retention heatmap data
  async getCohortRetention(
    filters: FilterOptions,
    granularity: 'monthly' | 'quarterly' | 'yearly'
  ): Promise<any> {
    const db = getDatabase();

    // Build user filter with date range + type
    const userFilter: any = {
      createdOn: {
        $gte: filters.dateRange.startDate,
        $lt: filters.dateRange.endDate
      }
    };
    if (filters.userType) {
      userFilter.type = filters.userType;
    }

    // Get users registered in the date range
    const users = await this.userRepo.findMany(userFilter);

    if (users.length === 0) {
      return [];
    }

    const userIds = users.map(u => u._id.toString());

    // Get last activity date for each user by checking all collections
    const userActivityMap = new Map<string, any>();

    // Query all collections in parallel (METHOD 1: Optimized)
    const { ObjectId } = require('mongodb');

    const [
      loginsData,
      stockScoresData,
      backtestData,
      etfScoresData,
      etfBacktestData,
      intradayData,
      brokerData,
      portfolioData
    ] = await Promise.all([
      db.collection('loginlogs')
        .find({ userId: { $in: userIds.map(id => new ObjectId(id)) }, status: 'SUCCESS' })
        .project({ userId: 1, loginTime: 1 })
        .toArray(),
      db.collection('liveScoring_User_Tracking')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, savedDate: 1 })
        .toArray(),
      db.collection('backtest_Result')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, savedDate: 1 })
        .toArray(),
      db.collection('etf_liveScoring_User_Tracking')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, requestedAt: 1 })
        .toArray(),
      db.collection('ETF_Backtest_Result')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, savedDate: 1 })
        .toArray(),
      db.collection('intraday_User_Tracking')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, savedDate: 1 })
        .toArray(),
      db.collection('borkrage_details')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, createdAt: 1 })
        .toArray(),
      db.collection('portfolio_details')
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, createdAt: 1 })
        .toArray()
    ]);

    // Build activity map with cutoff logic
    users.forEach(user => {
      userActivityMap.set(user._id.toString(), {
        registrationDate: new Date(user.createdOn),
        activityDates: []
      });
    });

    // Cutoff applies per EVENT date, not per user registration date:
    // loginlogs entries >= 2026-05-23 count; feature entries < 2026-05-23 count.
    loginsData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const loginDate = new Date(record.loginTime);
        if (loginDate >= LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(loginDate);
        }
      }
    });

    stockScoresData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.savedDate);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    backtestData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.savedDate);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    etfScoresData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.requestedAt);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    etfBacktestData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.savedDate);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    intradayData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.savedDate);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    brokerData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.createdAt);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    portfolioData.forEach(record => {
      const userId = record.userId.toString();
      if (userActivityMap.has(userId)) {
        const eventDate = new Date(record.createdAt);
        if (eventDate < LOGIN_DATA_CUTOFF) {
          userActivityMap.get(userId).activityDates.push(eventDate);
        }
      }
    });

    // Process activity map
    userActivityMap.forEach((activity, userId) => {
      const lastActivityDate = activity.activityDates.length > 0
        ? new Date(Math.max(...activity.activityDates.map((d: Date) => d.getTime())))
        : null;
      activity.lastActivityDate = lastActivityDate;
    });

    // Group users by cohort (registration month/quarter/year)
    const cohortMap = new Map<string, any[]>();

    userActivityMap.forEach((activity, userId) => {
      const cohortKey = this.getCohortKey(activity.registrationDate, granularity);

      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, []);
      }
      cohortMap.get(cohortKey)!.push({
        userId,
        registrationDate: activity.registrationDate,
        lastActivityDate: activity.lastActivityDate,
      });
    });

    // Columns = fixed absolute calendar periods spanning the selected date range
    const periodKeys = this.generatePeriodKeys(filters.dateRange.startDate, filters.dateRange.endDate, granularity);

    // Calculate retention for each cohort against each absolute period
    const rows = [];

    for (const [cohortKey, cohortUsers] of cohortMap.entries()) {
      const cohortDate = this.parseCohortKey(cohortKey, granularity);
      const values: Record<string, number | null> = {};

      for (const periodKey of periodKeys) {
        const periodDate = this.parseCohortKey(periodKey, granularity);

        if (periodDate < cohortDate) {
          // Cohort did not exist yet in this calendar period
          values[periodKey] = null;
          continue;
        }

        const nextPeriodDate = this.addPeriods(periodDate, 1, granularity);

        const activeInPeriod = cohortUsers.filter((user: any) => {
          if (!user.lastActivityDate) return false;
          const actDate = new Date(user.lastActivityDate);
          return actDate >= periodDate && actDate < nextPeriodDate;
        }).length;

        const retentionPercent = (activeInPeriod / cohortUsers.length) * 100;
        values[periodKey] = parseFloat(retentionPercent.toFixed(1));
      }

      rows.push({
        cohort: cohortKey,
        totalUsers: cohortUsers.length,
        values,
      });
    }

    // Sort cohort rows by cohort date descending (newest cohort first)
    rows.sort((a, b) => b.cohort.localeCompare(a.cohort));

    // Columns displayed newest -> oldest
    const columns = [...periodKeys].reverse();

    return { columns, rows };
  }

  // Helper: Generate absolute calendar period keys spanning a date range
  private generatePeriodKeys(startDate: Date, endDate: Date, granularity: 'monthly' | 'quarterly' | 'yearly'): string[] {
    const keys: string[] = [];
    const lastIncludedDate = new Date(endDate.getTime() - 1);

    let current = this.parseCohortKey(this.getCohortKey(startDate, granularity), granularity);
    const endBoundary = this.parseCohortKey(this.getCohortKey(lastIncludedDate, granularity), granularity);

    while (current <= endBoundary) {
      keys.push(this.getCohortKey(current, granularity));
      current = this.addPeriods(current, 1, granularity);
      if (keys.length > 60) break; // safety cap
    }

    return keys;
  }

  // Helper: Get cohort key (YYYY-MM format)
  private getCohortKey(date: Date, granularity: 'monthly' | 'quarterly' | 'yearly'): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);

    if (granularity === 'monthly') return `${year}-${month}`;
    if (granularity === 'quarterly') return `${year}-Q${quarter}`;
    return String(year);
  }

  // Helper: Parse cohort key to date
  private parseCohortKey(cohortKey: string, granularity: 'monthly' | 'quarterly' | 'yearly'): Date {
    if (granularity === 'monthly') {
      const [year, month] = cohortKey.split('-');
      const date = new Date();
      date.setUTCFullYear(parseInt(year));
      date.setUTCMonth(parseInt(month) - 1);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    }

    if (granularity === 'quarterly') {
      const [year, q] = cohortKey.split('-Q');
      const month = (parseInt(q) - 1) * 3;
      const date = new Date();
      date.setUTCFullYear(parseInt(year));
      date.setUTCMonth(month);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    }

    // Yearly
    const date = new Date();
    date.setUTCFullYear(parseInt(cohortKey));
    date.setUTCMonth(0);
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  // Helper: Add periods to date
  private addPeriods(date: Date, periods: number, granularity: 'monthly' | 'quarterly' | 'yearly'): Date {
    const newDate = new Date(date);

    if (granularity === 'monthly') {
      newDate.setUTCMonth(newDate.getUTCMonth() + periods);
    } else if (granularity === 'quarterly') {
      newDate.setUTCMonth(newDate.getUTCMonth() + periods * 3);
    } else {
      newDate.setUTCFullYear(newDate.getUTCFullYear() + periods);
    }

    return newDate;
  }

  // Get KPI vs Industry Standards
  async getKPIComparison(filters: FilterOptions): Promise<any> {
    const db = getDatabase();

    // Build user filter with date range
    const userFilter: any = {
      createdOn: {
        $gte: filters.dateRange.startDate,
        $lt: filters.dateRange.endDate
      }
    };
    if (filters.userType) {
      userFilter.type = filters.userType;
    }

    // Get users registered in this period only
    const users = await this.userRepo.findMany(userFilter);
    const newUsers = users.length;

    if (newUsers === 0) {
      return {};
    }

    const userIds = users.map(u => u._id.toString());
    const activeUsers = await this.getActiveUsersForPeriod(filters, userIds);

    const showUpRate = newUsers > 0 ? (activeUsers / newUsers) * 100 : 0;

    const successfulLogins = await db.collection('loginlogs').countDocuments({
      loginTime: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
      status: 'SUCCESS',
      userId: { $in: userIds.map(id => new (require('mongodb')).ObjectId(id)) },
    });

    const activationRate = newUsers > 0 ? (activeUsers / newUsers) * 100 : 0;

    return {
      showUpRate: parseFloat(showUpRate.toFixed(1)),
      activationRate: parseFloat(activationRate.toFixed(1)),
      totalUsers: newUsers,
      activeUsers,
      newUsers,
      successfulLogins,
      dau: activeUsers,
      mau: newUsers,
    };
  }

  private async getActiveUsersForPeriod(filters: FilterOptions, userIds: string[]): Promise<number> {
    const db = getDatabase();

    const afterCutoff = filters.dateRange.startDate > LOGIN_DATA_CUTOFF;

    if (afterCutoff) {
      const logins = await db
        .collection('loginlogs')
        .distinct('userId', {
          loginTime: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
          status: 'SUCCESS',
          userId: { $in: userIds.map(id => new (require('mongodb')).ObjectId(id)) },
        });
      return logins.length;
    }

    // Get unique users from all features
    const features = await Promise.all([
      db.collection('liveScoring_User_Tracking').distinct('userId', {
        savedDate: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
        userId: { $in: userIds },
      }),
      db.collection('backtest_Result').distinct('userId', {
        savedDate: { $gte: filters.dateRange.startDate, $lt: filters.dateRange.endDate },
        userId: { $in: userIds },
      }),
    ]);

    const uniqueUsers = new Set([...features[0], ...features[1]]);
    return uniqueUsers.size;
  }
}
