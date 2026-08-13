"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageAnalysisService = void 0;
const mongodb_1 = require("mongodb");
const database_1 = require("../config/database");
const OverviewV2Service_1 = require("./OverviewV2Service");
function normalizePhone(raw) {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-10);
}
function normalizeEmail(raw) {
    return (raw || '').trim().toLowerCase();
}
function escapeRegex(raw) {
    return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// "Webminar" is a 3-record data-entry typo for "Webinar" in userdetail.type — merged here so the
// Type filter/column behaves as one category instead of silently splitting a handful of users off.
function normalizeUserType(raw) {
    const t = (raw || '').trim();
    return t === 'Webminar' ? 'Webinar' : t;
}
class UsageAnalysisService {
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
    async getMainTab(filters) {
        const db = (0, database_1.getDatabase)();
        const query = {};
        if (filters.startDate || filters.endDate) {
            query.createdOn = {};
            if (filters.startDate)
                query.createdOn.$gte = filters.startDate;
            if (filters.endDate)
                query.createdOn.$lte = filters.endDate;
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
        const userIds = users.map((u) => u._id.toString());
        const [lastLoginMap, demoByPhone, assessByPhone, assessByEmail, featureMaps] = await Promise.all([
            this.getLastLoginMap(userIds),
            this.getDemoCallPhoneMap(),
            this.getAssessmentPhoneMap(),
            this.getAssessmentEmailMap(),
            this.getFeatureCountMaps(userIds),
        ]);
        return users.map((u) => {
            const id = u._id.toString();
            const phone = normalizePhone(u.mobile || u.whatsappNumber);
            const email = normalizeEmail(u.email);
            const assessedIds = new Set([...(assessByPhone.get(phone) || []), ...(assessByEmail.get(email) || [])]);
            let usageScore = 0;
            for (const cfg of OverviewV2Service_1.ACTIVE_ACTION_COLLECTIONS) {
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
    async getDemoCallTab() {
        const db = (0, database_1.getDatabase)();
        const rows = await db.collection('democall').find({}).toArray();
        const userLookup = await this.getUserLookupMaps();
        return rows.map((r) => this.toBookingRow(r, userLookup, false));
    }
    async getAssessmentTab() {
        const db = (0, database_1.getDatabase)();
        const rows = await db.collection('assessments').find({}).toArray();
        const userLookup = await this.getUserLookupMaps();
        return rows.map((r) => this.toBookingRow(r, userLookup, true));
    }
    toBookingRow(r, userLookup, hasEmail) {
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
    async getUserLookupMaps() {
        const db = (0, database_1.getDatabase)();
        const users = await db
            .collection('userdetail')
            .find({})
            .project({ mobile: 1, whatsappNumber: 1, email: 1, type: 1, referalCode: 1 })
            .toArray();
        const byPhone = new Map();
        const byEmail = new Map();
        for (const u of users) {
            const phone = normalizePhone(u.mobile || u.whatsappNumber);
            const email = normalizeEmail(u.email);
            if (phone && !byPhone.has(phone))
                byPhone.set(phone, u);
            if (email && !byEmail.has(email))
                byEmail.set(email, u);
        }
        return { byPhone, byEmail };
    }
    async getLastLoginMap(userIds) {
        const db = (0, database_1.getDatabase)();
        // loginlogs.userId is stored as a real ObjectId (unlike the 7 feature collections, which store
        // userId as a plain string) — MongoDB does not coerce between the two, so this must query with
        // actual ObjectId instances or it silently matches nothing.
        const objectIds = userIds.filter((id) => mongodb_1.ObjectId.isValid(id)).map((id) => new mongodb_1.ObjectId(id));
        const results = await db
            .collection('loginlogs')
            .aggregate([
            { $match: { userId: { $in: objectIds }, status: 'SUCCESS' } },
            { $group: { _id: '$userId', lastLogin: { $max: '$loginTime' } } },
        ])
            .toArray();
        const map = new Map();
        for (const r of results) {
            map.set(r._id.toString(), new Date(r.lastLogin).toISOString());
        }
        return map;
    }
    async getDemoCallPhoneMap() {
        const db = (0, database_1.getDatabase)();
        const rows = await db.collection('democall').find({}).project({ whatsappNumber: 1 }).toArray();
        const map = new Map();
        for (const r of rows) {
            const phone = normalizePhone(r.whatsappNumber);
            if (!phone)
                continue;
            if (!map.has(phone))
                map.set(phone, []);
            map.get(phone).push(r._id.toString());
        }
        return map;
    }
    async getAssessmentPhoneMap() {
        const db = (0, database_1.getDatabase)();
        const rows = await db.collection('assessments').find({}).project({ whatsappNumber: 1 }).toArray();
        const map = new Map();
        for (const r of rows) {
            const phone = normalizePhone(r.whatsappNumber);
            if (!phone)
                continue;
            if (!map.has(phone))
                map.set(phone, []);
            map.get(phone).push(r._id.toString());
        }
        return map;
    }
    async getAssessmentEmailMap() {
        const db = (0, database_1.getDatabase)();
        const rows = await db.collection('assessments').find({}).project({ email: 1 }).toArray();
        const map = new Map();
        for (const r of rows) {
            const email = normalizeEmail(r.email);
            if (!email)
                continue;
            if (!map.has(email))
                map.set(email, []);
            map.get(email).push(r._id.toString());
        }
        return map;
    }
    // One count-per-userId map per feature collection, so the caller can both sum them into a
    // usage score and read backtest_Result off individually as "BT count" without a second pass.
    async getFeatureCountMaps(userIds) {
        const db = (0, database_1.getDatabase)();
        const result = new Map();
        await Promise.all(OverviewV2Service_1.ACTIVE_ACTION_COLLECTIONS.map(async (cfg) => {
            const counts = await db
                .collection(cfg.name)
                .aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }])
                .toArray();
            const map = new Map();
            for (const r of counts)
                map.set(r._id, r.count);
            result.set(cfg.name, map);
        }));
        return result;
    }
}
exports.UsageAnalysisService = UsageAnalysisService;
//# sourceMappingURL=UsageAnalysisService.js.map