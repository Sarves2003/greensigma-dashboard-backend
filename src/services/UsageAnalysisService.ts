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

// Intent = "did they take an action that says they want to talk to a human", scored only from
// demo call / assessment activity — deliberately excludes product usage entirely so it stays a
// distinct signal from Usage Score, per how the sales team wants to read these two apart.
// Assessment is scored the same way as demo call — presence, not status: neither has attended/
// completed tracking treated as a scoring gate, both are just "did they book/start this at all".
// demoCall has no attended/no-show tracking in the data at all (checked directly — 0 of 91 rows
// have any status field). Overall Score caps Usage Score's contribution at 50 so one very active
// power-user can't out-rank someone who engaged with the assessment (the stronger, more effortful
// intent signal) purely on click-volume.
const INTENT_DEMO_BOOKED_POINTS = 30;
const INTENT_ASSESSMENT_POINTS = 50;
const OVERALL_USAGE_SCORE_CAP = 50;

function computeIntentScore(demoCallCount: number, assessmentCount: number): number {
  const demoPoints = demoCallCount > 0 ? INTENT_DEMO_BOOKED_POINTS : 0;
  const assessmentPoints = assessmentCount > 0 ? INTENT_ASSESSMENT_POINTS : 0;
  return demoPoints + assessmentPoints;
}

// Sales-facing lead status, one value per user — kept separate from the scoring collections
// entirely (own doc per user in usage_analysis_status), since it's a manual CRM-style annotation,
// not something derived from product data.
export const LEAD_STATUS_OPTIONS = ['DP', 'Not Qualified', 'Not Interested', 'Pitched', 'Booked', 'Paid'] as const;
export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number];

export interface NoteEntry {
  text: string;
  byName: string;
  createdAt: string;
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
  liveScoringCount: number;
  etfLiveScoringCount: number;
  etfBacktestCount: number;
  intradayCount: number;
  portfoliosCreatedCount: number;
  brokerConnectedCount: number;
  usageScore: number;
  intentScore: number;
  overallScore: number;
  status: string | null;
  latestNote: NoteEntry | null;
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
  leadFrom: string | null;
}

export interface UserDetail {
  id: string;
  name: string;
  mobile: string;
  email: string;
  type: string;
  referalCode: string | null;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  portfolioDeployedAt: string | null;
  usageScore: number;
  intentScore: number;
  overallScore: number;
  featureBreakdown: {
    liveScoring: number;
    backtest: number;
    etfLiveScoring: number;
    etfBacktest: number;
    intraday: number;
    portfoliosCreated: number;
    brokerConnected: number;
  };
  demoCalls: { preferredDate: string | null; preferredTime: string | null; createdAt: string | null; leadFrom: string | null }[];
  assessments: {
    status: string | null;
    registrationStatus: string | null;
    completedAt: string | null;
    leadFrom: string | null;
    district: string | null;
    state: string | null;
    occupation: string | null;
    investmentExperience: string | null;
    portfolioSize: string | null;
    challenges: string[];
    otherChallenge: string | null;
  }[];
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

    const [lastLoginMap, demoByPhone, assessByPhone, assessByEmail, featureMaps, statusMap] = await Promise.all([
      this.getLastLoginMap(userIds),
      this.getDemoCallPhoneMap(),
      this.getAssessmentPhoneMap(),
      this.getAssessmentEmailMap(),
      this.getFeatureCountMaps(userIds),
      this.getStatusMap(userIds),
    ]);

    return users.map((u: any) => {
      const id = u._id.toString();
      const phone = normalizePhone(u.mobile || u.whatsappNumber);
      const email = normalizeEmail(u.email);

      const assessedIds = new Set<string>([...(assessByPhone.get(phone) || []), ...(assessByEmail.get(email) || [])]);
      const assessmentCount = assessedIds.size;

      let usageScore = 0;
      for (const cfg of ACTIVE_ACTION_COLLECTIONS) {
        usageScore += featureMaps.get(cfg.name)?.get(id) || 0;
      }

      const demoCallCount = (demoByPhone.get(phone) || []).length;
      const intentScore = computeIntentScore(demoCallCount, assessmentCount);
      const overallScore = intentScore + Math.min(usageScore, OVERALL_USAGE_SCORE_CAP);

      return {
        id,
        name: u.name || '',
        mobile: u.mobile || u.whatsappNumber || '',
        email: u.email || '',
        type: normalizeUserType(u.type),
        referalCode: u.referalCode || null,
        signedUpAt: u.createdOn ? new Date(u.createdOn).toISOString() : null,
        lastLoginAt: lastLoginMap.get(id) || null,
        demoCallCount,
        assessmentCount,
        btCount: featureMaps.get('backtest_Result')?.get(id) || 0,
        liveScoringCount: featureMaps.get('liveScoring_User_Tracking')?.get(id) || 0,
        etfLiveScoringCount: featureMaps.get('etf_liveScoring_User_Tracking')?.get(id) || 0,
        etfBacktestCount: featureMaps.get('ETF_Backtest_Result')?.get(id) || 0,
        intradayCount: featureMaps.get('intraday_User_Tracking')?.get(id) || 0,
        portfoliosCreatedCount: featureMaps.get('portfolio_details')?.get(id) || 0,
        brokerConnectedCount: featureMaps.get('borkrage_details')?.get(id) || 0,
        usageScore,
        intentScore,
        overallScore,
        status: statusMap.get(id)?.status ?? null,
        latestNote: statusMap.get(id)?.latestNote ?? null,
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
      leadFrom: r.leadFrom || null,
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

  // ============ Sales lead status + remarks (usage_analysis_status, one doc per userId) ============
  private static readonly STATUS_COLLECTION = 'usage_analysis_status';

  private async getStatusMap(userIds: string[]): Promise<Map<string, { status: string | null; latestNote: NoteEntry | null }>> {
    const db = getDatabase();
    const docs = await db
      .collection(UsageAnalysisService.STATUS_COLLECTION)
      .find({ _id: { $in: userIds } } as any)
      .toArray();

    const map = new Map<string, { status: string | null; latestNote: NoteEntry | null }>();
    for (const d of docs as any[]) {
      const notes: NoteEntry[] = Array.isArray(d.notes) ? d.notes : [];
      const latestNote = notes.length > 0 ? notes[notes.length - 1] : null;
      map.set(d._id, { status: d.status || null, latestNote });
    }
    return map;
  }

  async setUserStatus(userId: string, status: LeadStatus | null): Promise<void> {
    const db = getDatabase();
    await db
      .collection(UsageAnalysisService.STATUS_COLLECTION)
      .updateOne({ _id: userId } as any, { $set: { status, updatedAt: new Date() } }, { upsert: true });
  }

  async addUserNote(userId: string, text: string, byName: string): Promise<NoteEntry[]> {
    const db = getDatabase();
    const entry: NoteEntry = { text, byName, createdAt: new Date().toISOString() };
    await db
      .collection(UsageAnalysisService.STATUS_COLLECTION)
      .updateOne({ _id: userId } as any, { $push: { notes: entry } as any, $set: { updatedAt: new Date() } }, { upsert: true });
    return this.getUserNotes(userId);
  }

  async getUserNotes(userId: string): Promise<NoteEntry[]> {
    const db = getDatabase();
    const doc = await db.collection(UsageAnalysisService.STATUS_COLLECTION).findOne({ _id: userId } as any);
    const notes: NoteEntry[] = doc && Array.isArray((doc as any).notes) ? (doc as any).notes : [];
    return [...notes].reverse();
  }

  // ============ Main tab row click: one user's full journey ============
  async getUserDetail(userId: string): Promise<UserDetail | null> {
    const db = getDatabase();
    if (!ObjectId.isValid(userId)) return null;

    const user = await db.collection('userdetail').findOne({ _id: new ObjectId(userId) } as any);
    if (!user) return null;

    const phone = normalizePhone((user as any).mobile || (user as any).whatsappNumber);
    const email = normalizeEmail((user as any).email);

    const [lastLoginMap, featureMaps, demoDocs, assessDocs, liveDeployedDocs] = await Promise.all([
      this.getLastLoginMap([userId]),
      this.getFeatureCountMaps([userId]),
      db.collection('democall').find({}).toArray(),
      db.collection('assessments').find({}).toArray(),
      // Same "real, live, invested" definition as the Live P&L tab (PortfolioRepository.
      // getLiveRealPortfoliosWithHoldings) — kept in sync deliberately so "deployed date" here
      // means the same thing as "shows up in Live P&L" there.
      db
        .collection('portfolio_details')
        .find({ userId, isInvested: true, borkrageType: { $in: ['kite', 'zebu'] }, stockDetails: { $exists: true, $ne: [], $type: 'array' } })
        .project({ createdAt: 1 })
        .toArray(),
    ]);

    const demoCalls = (demoDocs as any[])
      .filter((d) => normalizePhone(d.whatsappNumber) === phone)
      .map((d) => ({
        preferredDate: d.preferredDate ? new Date(d.preferredDate).toISOString() : null,
        preferredTime: d.preferredTime || null,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        leadFrom: d.leadFrom || null,
      }));

    const matchedAssessDocs = (assessDocs as any[]).filter(
      (a) => normalizePhone(a.whatsappNumber) === phone || (email && normalizeEmail(a.email) === email)
    );
    const assessments = matchedAssessDocs.map((a) => ({
      status: a.status || null,
      registrationStatus: a.registrationStatus || null,
      completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : null,
      leadFrom: a.leadFrom || null,
      district: a.district || null,
      state: a.state || null,
      occupation: a.occupation || null,
      investmentExperience: a.investmentExperience || null,
      portfolioSize: a.portfolioSize || null,
      challenges: Array.isArray(a.challenges) ? a.challenges : [],
      otherChallenge: a.otherChallenge || null,
    }));

    let usageScore = 0;
    for (const cfg of ACTIVE_ACTION_COLLECTIONS) {
      usageScore += featureMaps.get(cfg.name)?.get(userId) || 0;
    }
    const intentScore = computeIntentScore(demoCalls.length, assessments.length);
    const overallScore = intentScore + Math.min(usageScore, OVERALL_USAGE_SCORE_CAP);

    const deployedDates = (liveDeployedDocs as any[]).map((p) => new Date(p.createdAt).getTime()).filter((t) => !isNaN(t));
    const portfolioDeployedAt = deployedDates.length > 0 ? new Date(Math.min(...deployedDates)).toISOString() : null;

    return {
      id: userId,
      name: (user as any).name || '',
      mobile: (user as any).mobile || (user as any).whatsappNumber || '',
      email: (user as any).email || '',
      type: normalizeUserType((user as any).type),
      referalCode: (user as any).referalCode || null,
      signedUpAt: (user as any).createdOn ? new Date((user as any).createdOn).toISOString() : null,
      lastLoginAt: lastLoginMap.get(userId) || null,
      portfolioDeployedAt,
      usageScore,
      intentScore,
      overallScore,
      featureBreakdown: {
        liveScoring: featureMaps.get('liveScoring_User_Tracking')?.get(userId) || 0,
        backtest: featureMaps.get('backtest_Result')?.get(userId) || 0,
        etfLiveScoring: featureMaps.get('etf_liveScoring_User_Tracking')?.get(userId) || 0,
        etfBacktest: featureMaps.get('ETF_Backtest_Result')?.get(userId) || 0,
        intraday: featureMaps.get('intraday_User_Tracking')?.get(userId) || 0,
        portfoliosCreated: featureMaps.get('portfolio_details')?.get(userId) || 0,
        brokerConnected: featureMaps.get('borkrage_details')?.get(userId) || 0,
      },
      demoCalls,
      assessments,
    };
  }
}
