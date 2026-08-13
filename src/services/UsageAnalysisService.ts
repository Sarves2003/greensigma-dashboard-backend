import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { ACTIVE_ACTION_COLLECTIONS } from './OverviewV2Service';

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Webminar" is a 3-record data-entry typo for "Webinar" in userdetail.type — merged here so the
// Type filter/column behaves as one category instead of silently splitting a handful of users off.
function normalizeUserType(raw: string | null | undefined): string {
  const t = (raw || '').trim();
  return t === 'Webminar' ? 'Webinar' : t;
}

export interface MainTabRow {
  id: string;
  name: string;
  mobile: string;
  email: string;
  type: string;
  referalCode: string | null;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  demoCallCount: number;
  assessmentCount: number;
  btCount: number;
  usageScore: number;
}

export interface BookingRow {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  status: string | null;
  createdAt: string | null;
  registered: boolean;
  matchedType: string | null;
  matchedReferalCode: string | null;
}

export interface MainTabFilters {
  startDate?: Date;
  endDate?: Date;
  type?: string;
  referalCode?: string;
  search?: string;
}

export class UsageAnalysisService {
  // ============ Main tab: signed-up users (in the filtered window) + their usage/booking footprint ============
  // Usage/booking counts are always lifetime totals, never scoped to the signup-date filter — a user
  // who signed up in July but booked a demo in August should still show that booking. The filters only
  // decide which USERS appear, same principle as the Live P&L "Active Portfolio Managers" card.
  //
  // Performance: the 7 feature collections + loginlogs are joined by running a $in query per collection
  // against the filtered user set, not one query per user. That set MUST be filtered server-side (not
  // "load all 9,800+ users, filter client-side") — a $in of thousands of ids against several
  // hundred-thousand-row collections is what made this endpoint take 60+ seconds before. Scoping the
  // signup-date filter server-side keeps every downstream query fast.
  async getMainTab(filters: MainTabFilters): Promise<MainTabRow[]> {
    const db = getDatabase();

    const query: any = {};
    if (filters.startDate || filters.endDate) {
      query.createdOn = {};
      if (filters.startDate) query.createdOn.$gte = filters.startDate;
      if (filters.endDate) query.createdOn.$lte = filters.endDate;
    }
    if (filters.type && filters.type !== 'all') {
      query.type = filters.type === 'Webinar' ? { $in: ['Webinar', 'Webminar'] } : filters.type;
    }
    if (filters.referalCode) {
      query.referalCode = { $regex: escapeRegex(filters.referalCode), $options: 'i' };
    }
    if (filters.search) {
      const s = escapeRegex(filters.search);
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { mobile: { $regex: s, $options: 'i' } },
        { whatsappNumber: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ];
    }

    const users = await db
      .collection('userdetail')
      .find(query)
      .project({ _id: 1, name: 1, email: 1, mobile: 1, whatsappNumber: 1, type: 1, createdOn: 1, referalCode: 1 })
      .toArray();

    const userIds = users.map((u: any) => u._id.toString());

    const [lastLoginMap, demoByPhone, assessByPhone, assessByEmail, featureMaps] = await Promise.all([
      this.getLastLoginMap(userIds),
      this.getDemoCallPhoneMap(),
      this.getAssessmentPhoneMap(),
      this.getAssessmentEmailMap(),
      this.getFeatureCountMaps(userIds),
    ]);

    return users.map((u: any) => {
      const id = u._id.toString();
      const phone = normalizePhone(u.mobile || u.whatsappNumber);
      const email = normalizeEmail(u.email);

      const assessedIds = new Set<string>([...(assessByPhone.get(phone) || []), ...(assessByEmail.get(email) || [])]);

      let usageScore = 0;
      for (const cfg of ACTIVE_ACTION_COLLECTIONS) {
        usageScore += featureMaps.get(cfg.name)?.get(id) || 0;
      }

      return {
        id,
        name: u.name || '',
        mobile: u.mobile || u.whatsappNumber || '',
        email: u.email || '',
        type: normalizeUserType(u.type),
        referalCode: u.referalCode || null,
        signedUpAt: u.createdOn ? new Date(u.createdOn).toISOString() : null,
        lastLoginAt: lastLoginMap.get(id) || null,
        demoCallCount: (demoByPhone.get(phone) || []).length,
        assessmentCount: assessedIds.size,
        btCount: featureMaps.get('backtest_Result')?.get(id) || 0,
        usageScore,
      };
    });
  }

  // ============ Demo Call / Assessment tabs: every booking, matched back to userdetail if possible ============
  async getDemoCallTab(): Promise<BookingRow[]> {
    const db = getDatabase();
    const rows = await db.collection('democall').find({}).toArray();
    const userLookup = await this.getUserLookupMaps();

    return rows.map((r: any) => this.toBookingRow(r, userLookup, false));
  }

  async getAssessmentTab(): Promise<BookingRow[]> {
    const db = getDatabase();
    const rows = await db.collection('assessments').find({}).toArray();
    const userLookup = await this.getUserLookupMaps();

    return rows.map((r: any) => this.toBookingRow(r, userLookup, true));
  }

  private toBookingRow(
    r: any,
    userLookup: { byPhone: Map<string, any>; byEmail: Map<string, any> },
    hasEmail: boolean
  ): BookingRow {
    const phone = normalizePhone(r.whatsappNumber);
    const email = hasEmail ? normalizeEmail(r.email) : '';
    const matchedUser = userLookup.byPhone.get(phone) || (email ? userLookup.byEmail.get(email) : undefined);

    return {
      id: r._id.toString(),
      name: r.name || '',
      mobile: r.whatsappNumber || '',
      email: hasEmail ? r.email || null : null,
      preferredDate: r.preferredDate ? new Date(r.preferredDate).toISOString() : null,
      preferredTime: r.preferredTime || null,
      status: r.status || null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      registered: !!matchedUser,
      matchedType: matchedUser ? normalizeUserType(matchedUser.type) : null,
      matchedReferalCode: matchedUser ? matchedUser.referalCode || null : null,
    };
  }

  // ============ Shared lookup builders ============
  private async getUserLookupMaps(): Promise<{ byPhone: Map<string, any>; byEmail: Map<string, any> }> {
    const db = getDatabase();
    const users = await db
      .collection('userdetail')
      .find({})
      .project({ mobile: 1, whatsappNumber: 1, email: 1, type: 1, referalCode: 1 })
      .toArray();

    const byPhone = new Map<string, any>();
    const byEmail = new Map<string, any>();
    for (const u of users as any[]) {
      const phone = normalizePhone(u.mobile || u.whatsappNumber);
      const email = normalizeEmail(u.email);
      if (phone && !byPhone.has(phone)) byPhone.set(phone, u);
      if (email && !byEmail.has(email)) byEmail.set(email, u);
    }
    return { byPhone, byEmail };
  }

  private async getLastLoginMap(userIds: string[]): Promise<Map<string, string>> {
    const db = getDatabase();
    // loginlogs.userId is stored as a real ObjectId (unlike the 7 feature collections, which store
    // userId as a plain string) — MongoDB does not coerce between the two, so this must query with
    // actual ObjectId instances or it silently matches nothing.
    const objectIds = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

    const results = await db
      .collection('loginlogs')
      .aggregate([
        { $match: { userId: { $in: objectIds }, status: 'SUCCESS' } },
        { $group: { _id: '$userId', lastLogin: { $max: '$loginTime' } } },
      ])
      .toArray();

    const map = new Map<string, string>();
    for (const r of results as any[]) {
      map.set(r._id.toString(), new Date(r.lastLogin).toISOString());
    }
    return map;
  }

  private async getDemoCallPhoneMap(): Promise<Map<string, string[]>> {
    const db = getDatabase();
    const rows = await db.collection('democall').find({}).project({ whatsappNumber: 1 }).toArray();
    const map = new Map<string, string[]>();
    for (const r of rows as any[]) {
      const phone = normalizePhone(r.whatsappNumber);
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(r._id.toString());
    }
    return map;
  }

  private async getAssessmentPhoneMap(): Promise<Map<string, string[]>> {
    const db = getDatabase();
    const rows = await db.collection('assessments').find({}).project({ whatsappNumber: 1 }).toArray();
    const map = new Map<string, string[]>();
    for (const r of rows as any[]) {
      const phone = normalizePhone(r.whatsappNumber);
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(r._id.toString());
    }
    return map;
  }

  private async getAssessmentEmailMap(): Promise<Map<string, string[]>> {
    const db = getDatabase();
    const rows = await db.collection('assessments').find({}).project({ email: 1 }).toArray();
    const map = new Map<string, string[]>();
    for (const r of rows as any[]) {
      const email = normalizeEmail(r.email);
      if (!email) continue;
      if (!map.has(email)) map.set(email, []);
      map.get(email)!.push(r._id.toString());
    }
    return map;
  }

  // One count-per-userId map per feature collection, so the caller can both sum them into a
  // usage score and read backtest_Result off individually as "BT count" without a second pass.
  private async getFeatureCountMaps(userIds: string[]): Promise<Map<string, Map<string, number>>> {
    const db = getDatabase();
    const result = new Map<string, Map<string, number>>();

    await Promise.all(
      ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
        const counts = await db
          .collection(cfg.name)
          .aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }])
          .toArray();

        const map = new Map<string, number>();
        for (const r of counts as any[]) map.set(r._id, r.count);
        result.set(cfg.name, map);
      })
    );

    return result;
  }
}
