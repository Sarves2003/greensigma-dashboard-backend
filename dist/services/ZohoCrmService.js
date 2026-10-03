"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZohoCrmService = void 0;
const axios_1 = __importDefault(require("axios"));
const RNR = 'RNR';
const BOOKED = 'Meeting Booked';
const NOT_QUALIFIED = 'Not Qualified';
const CACHE_TTL_MS = 2 * 60 * 1000; // short — this is live operational data, not slow-changing history
class ZohoCrmService {
    constructor() {
        this.cachedToken = null;
        this.filterCache = null;
    }
    get accountsDomain() {
        return process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.in';
    }
    get apiDomain() {
        return process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in';
    }
    async getAccessToken() {
        const now = Date.now();
        if (this.cachedToken && this.cachedToken.expiresAt - 60000 > now) {
            return this.cachedToken.accessToken;
        }
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
        if (!clientId || !clientSecret || !refreshToken) {
            throw new Error('Zoho CRM is not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN missing)');
        }
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
        });
        const response = await axios_1.default.post(`${this.accountsDomain}/oauth/v2/token`, params, { timeout: 15000 });
        const { access_token, expires_in } = response.data;
        if (!access_token) {
            throw new Error(`Zoho token refresh failed: ${JSON.stringify(response.data)}`);
        }
        this.cachedToken = { accessToken: access_token, expiresAt: now + (expires_in || 3600) * 1000 };
        return access_token;
    }
    // One retry on a 401 — the cached token can go stale right at the boundary even with the 60s
    // buffer above (e.g. after a long idle period on a cold Cloud Run instance).
    async coqlQuery(selectQuery) {
        const run = async () => {
            const token = await this.getAccessToken();
            return axios_1.default.post(`${this.apiDomain}/crm/v8/coql`, { select_query: selectQuery }, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeout: 20000, validateStatus: () => true });
        };
        let response = await run();
        if (response.status === 401) {
            this.cachedToken = null;
            response = await run();
        }
        if (response.status >= 300) {
            throw new Error(`Zoho COQL error (${response.status}): ${JSON.stringify(response.data)}`);
        }
        return response.data || {};
    }
    ymd(d) {
        return d.toISOString().slice(0, 10);
    }
    // Matches the Owner's own report: agents are identified by their Zoho last name alone (several
    // have a short code/nickname there, e.g. "Shree", "M", "BTK") — falling back to first name only
    // when last name is blank.
    agentLabel(firstName, lastName) {
        const f = (firstName || '').trim();
        const l = (lastName || '').trim();
        return l || f || 'Unassigned';
    }
    // Pages through every call in [start, end) — exclusive end, the convention throughout this app.
    // Zoho COQL returns at most 200 rows per call; this loops on `more_records` with a hard safety cap
    // so one bad filter never turns into an unbounded loop against a live API.
    async fetchCallsRaw(startDate, endDate) {
        const PAGE_SIZE = 200;
        const MAX_PAGES = 60; // 12,000 calls — generously above any realistic period this tab will be asked for
        const rows = [];
        for (let page = 0; page < MAX_PAGES; page++) {
            const offset = page * PAGE_SIZE;
            const query = `select id, Owner.first_name, Owner.last_name, Call_disposition, Sub_Disposition, ` +
                `Call_Duration_in_seconds, Call_Start_Time, What_Id, $se_module, To_Number__s, Voice_Recording__s from Calls ` +
                `where Call_Start_Time >= '${this.ymd(startDate)}T00:00:00+05:30' ` +
                `and Call_Start_Time < '${this.ymd(endDate)}T00:00:00+05:30' ` +
                `limit ${PAGE_SIZE} offset ${offset}`;
            const result = await this.coqlQuery(query);
            const data = result.data || [];
            for (const r of data) {
                rows.push({
                    id: r.id,
                    agent: this.agentLabel(r['Owner.first_name'], r['Owner.last_name']),
                    disposition: r['Call_disposition'] || null,
                    subDisposition: r['Sub_Disposition'] || null,
                    durationSec: Number(r['Call_Duration_in_seconds']) || 0,
                    startTime: r['Call_Start_Time'],
                    leadId: r['$se_module'] === 'Leads' && r['What_Id'] ? r['What_Id'].id : null,
                    leadName: r['What_Id'] ? r['What_Id'].name : null,
                    number: r['To_Number__s'] || null,
                    recordingUrl: r['Voice_Recording__s'] || null,
                });
            }
            if (!result.info?.more_records)
                break;
        }
        return rows;
    }
    // Bulk-resolves Lead_Source for a set of lead ids — only called when the lead-funnel filter is
    // actually in use, so the common "All funnels" path never pays for this extra round trip. Chunked
    // to stay well under COQL's query-length limit.
    async fetchLeadSources(leadIds) {
        const map = new Map();
        const CHUNK = 100; // Zoho COQL hard caps a WHERE ... in (...) clause at 100 values
        for (let i = 0; i < leadIds.length; i += CHUNK) {
            const chunk = leadIds.slice(i, i + CHUNK);
            const query = `select id, Lead_Source from Leads where id in (${chunk.join(',')})`;
            const result = await this.coqlQuery(query);
            for (const r of result.data || []) {
                map.set(r.id, r['Lead_Source'] || '');
            }
        }
        return map;
    }
    // Bulk-resolves the CURRENT state of a set of leads — name, number, status — straight from the
    // Leads module itself, rather than reconstructed from call records. Only called for one page of
    // the Lead Records table at a time, so this never needs to run against more than ~25 ids.
    async fetchLeadDetails(leadIds) {
        const map = new Map();
        const CHUNK = 100;
        for (let i = 0; i < leadIds.length; i += CHUNK) {
            const chunk = leadIds.slice(i, i + CHUNK);
            const query = `select id, Full_Name, Phone, Mobile, Call_disposition, Sub_Disposition, Follow_Up_Date_Time from Leads where id in (${chunk.join(',')})`;
            const result = await this.coqlQuery(query);
            for (const r of result.data || []) {
                map.set(r.id, {
                    name: r['Full_Name'] || null,
                    phone: r['Phone'] || r['Mobile'] || null,
                    disposition: r['Call_disposition'] || null,
                    subDisposition: r['Sub_Disposition'] || null,
                    followUpDateTime: r['Follow_Up_Date_Time'] || null,
                });
            }
        }
        return map;
    }
    // The real, currently-used filter options — read live so a newly-added agent or lead source shows
    // up on its own, with nothing hardcoded to drift out of date. Cached briefly since these barely
    // change minute to minute but the page may re-fetch them often.
    async getFilterOptions() {
        const now = Date.now();
        if (this.filterCache && now - this.filterCache.ts < CACHE_TTL_MS) {
            return this.filterCache.data;
        }
        // COQL rejects a GROUP BY aggregate with no WHERE clause at all ("missing clause: where"), so the
        // agent query is scoped to a wide-but-bounded window instead of being truly unfiltered — wide
        // enough that it will never exclude a real, currently-active agent.
        const wideStart = this.ymd(new Date(Date.UTC(2020, 0, 1)));
        const wideEnd = this.ymd(new Date(Date.now() + 24 * 60 * 60 * 1000));
        const [agentRows, sourceRows] = await Promise.all([
            this.coqlQuery(`select Owner.first_name, Owner.last_name, COUNT(id) from Calls ` +
                `where Call_Start_Time >= '${wideStart}T00:00:00+05:30' and Call_Start_Time < '${wideEnd}T00:00:00+05:30' ` +
                `group by Owner.first_name, Owner.last_name`),
            this.coqlQuery(`select Lead_Source, COUNT(id) from Leads where Call_disposition is not null group by Lead_Source`),
        ]);
        const agents = (agentRows.data || [])
            .map((r) => this.agentLabel(r['Owner.first_name'], r['Owner.last_name']))
            .filter((a) => a !== 'Unassigned')
            .sort();
        const leadSources = (sourceRows.data || [])
            .map((r) => r['Lead_Source'])
            .filter((s) => !!s)
            .sort();
        const data = { agents, leadSources };
        this.filterCache = { data, ts: now };
        return data;
    }
    // Shared by both tabs: fetch the period's calls once, resolve lead sources only if that filter is
    // active, then narrow to the rows that match every active filter. Everything downstream (both
    // Calls-level and Leads-level stats) is derived from this same filtered row set.
    async getFilteredCalls(startDate, endDate, agents, leadSource) {
        let rows = await this.fetchCallsRaw(startDate, endDate);
        if (agents && agents.length > 0) {
            const wanted = new Set(agents);
            rows = rows.filter((r) => wanted.has(r.agent));
        }
        if (leadSource && leadSource !== 'all') {
            const leadIds = [...new Set(rows.map((r) => r.leadId).filter((id) => !!id))];
            const sourceById = await this.fetchLeadSources(leadIds);
            rows = rows.filter((r) => r.leadId && sourceById.get(r.leadId) === leadSource);
        }
        return rows;
    }
    countPct(count, total) {
        return { count, pct: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0 };
    }
    async getCallsOverview(startDate, endDate, agents, leadSource) {
        const rows = (await this.getFilteredCalls(startDate, endDate, agents, leadSource)).filter((r) => r.disposition);
        const byAgentRaw = new Map();
        const outcomeCounts = new Map(); // outcome -> agent -> count
        const durations = [];
        const leadCallCounts = new Map(); // leadId -> dispositioned call count, for the followup avg
        for (const r of rows) {
            if (!byAgentRaw.has(r.agent))
                byAgentRaw.set(r.agent, { total: 0, rnr: 0, booked: 0, notQualified: 0, pickedDuration: 0 });
            const cur = byAgentRaw.get(r.agent);
            cur.total += 1;
            if (r.disposition === RNR)
                cur.rnr += 1;
            if (r.disposition === BOOKED)
                cur.booked += 1;
            if (r.disposition === NOT_QUALIFIED)
                cur.notQualified += 1;
            if (r.disposition !== RNR) {
                if (!outcomeCounts.has(r.disposition))
                    outcomeCounts.set(r.disposition, new Map());
                const m = outcomeCounts.get(r.disposition);
                m.set(r.agent, (m.get(r.agent) || 0) + 1);
                cur.pickedDuration += r.durationSec; // total talk time behind a PICKED call, whatever its outcome
            }
            if (r.durationSec > 0)
                durations.push(r.durationSec);
            if (r.leadId)
                leadCallCounts.set(r.leadId, (leadCallCounts.get(r.leadId) || 0) + 1);
        }
        const toStats = (agent, v) => {
            const picked = v.total - v.rnr;
            return {
                agent,
                total: v.total,
                rnr: v.rnr,
                picked,
                booked: v.booked,
                notQualified: v.notQualified,
                pickedPctOfTotal: v.total > 0 ? parseFloat(((picked / v.total) * 100).toFixed(1)) : 0,
                bookedPctOfPicked: picked > 0 ? parseFloat(((v.booked / picked) * 100).toFixed(1)) : 0,
                bookedPctOfTotal: v.total > 0 ? parseFloat(((v.booked / v.total) * 100).toFixed(1)) : 0,
                totalDurationSec: v.pickedDuration,
                avgDurationPerPickedCallSec: picked > 0 ? Math.round(v.pickedDuration / picked) : null,
            };
        };
        const byAgent = [...byAgentRaw.entries()].map(([agent, v]) => toStats(agent, v)).sort((a, b) => b.total - a.total);
        const teamTotals = byAgent.reduce((acc, a) => ({
            total: acc.total + a.total,
            rnr: acc.rnr + a.rnr,
            booked: acc.booked + a.booked,
            notQualified: acc.notQualified + a.notQualified,
            pickedDuration: acc.pickedDuration + a.totalDurationSec,
        }), { total: 0, rnr: 0, booked: 0, notQualified: 0, pickedDuration: 0 });
        const team = toStats('Team', teamTotals);
        const agentNames = byAgent.map((a) => a.agent);
        const outcomeMatrix = [...outcomeCounts.entries()]
            .map(([outcome, byAgentMap]) => ({
            outcome,
            byAgent: Object.fromEntries(agentNames.map((a) => [a, byAgentMap.get(a) || 0])),
        }))
            .sort((a, b) => {
            const totalA = Object.values(a.byAgent).reduce((s, n) => s + n, 0);
            const totalB = Object.values(b.byAgent).reduce((s, n) => s + n, 0);
            return totalB - totalA;
        });
        const totalDispositionedLinkedToLead = [...leadCallCounts.values()].reduce((a, b) => a + b, 0);
        const distinctLeadsTouched = leadCallCounts.size;
        return {
            kpis: {
                totalCalls: team.total,
                picked: this.countPct(team.picked, team.total),
                rnr: this.countPct(team.rnr, team.total),
                notQualified: this.countPct(team.notQualified, team.total),
                avgCallDurationSec: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
                maxCallDurationSec: durations.length > 0 ? Math.max(...durations) : null,
                totalCallDurationSec: team.totalDurationSec,
                avgFollowupsPerIndividual: distinctLeadsTouched > 0 ? parseFloat((totalDispositionedLinkedToLead / distinctLeadsTouched).toFixed(1)) : null,
            },
            byAgent,
            team,
            outcomeMatrix,
        };
    }
    async getLeadsOverview(startDate, endDate, agents, leadSource) {
        const rows = (await this.getFilteredCalls(startDate, endDate, agents, leadSource)).filter((r) => r.disposition && r.leadId);
        const byLead = new Map();
        for (const r of rows) {
            const day = r.startTime.slice(0, 10);
            const picked = r.disposition !== RNR;
            const existing = byLead.get(r.leadId);
            if (!existing) {
                byLead.set(r.leadId, {
                    agent: r.agent,
                    lastCallTime: r.startTime,
                    everPicked: picked,
                    everBooked: r.disposition === BOOKED,
                    everNotQualified: r.disposition === NOT_QUALIFIED,
                    outcomes: picked ? new Set([r.disposition]) : new Set(),
                    pickedDay: picked ? day : null,
                });
            }
            else {
                // Attribute the lead to whichever agent made its MOST RECENT call, by actual timestamp —
                // not fetch order, which COQL doesn't guarantee for raw (non-aggregate) selects.
                if (r.startTime > existing.lastCallTime) {
                    existing.agent = r.agent;
                    existing.lastCallTime = r.startTime;
                }
                if (picked && !existing.everPicked)
                    existing.pickedDay = day;
                existing.everPicked = existing.everPicked || picked;
                existing.everBooked = existing.everBooked || r.disposition === BOOKED;
                existing.everNotQualified = existing.everNotQualified || r.disposition === NOT_QUALIFIED;
                if (picked)
                    existing.outcomes.add(r.disposition);
            }
        }
        const byAgentRaw = new Map();
        const pickedByDay = new Map();
        const outcomeCounts = new Map(); // outcome -> agent -> distinct lead count
        for (const lead of byLead.values()) {
            if (!byAgentRaw.has(lead.agent))
                byAgentRaw.set(lead.agent, { total: 0, rnr: 0, booked: 0, notQualified: 0 });
            const cur = byAgentRaw.get(lead.agent);
            cur.total += 1;
            if (!lead.everPicked)
                cur.rnr += 1;
            if (lead.everBooked)
                cur.booked += 1;
            if (lead.everNotQualified)
                cur.notQualified += 1;
            if (lead.pickedDay)
                pickedByDay.set(lead.pickedDay, (pickedByDay.get(lead.pickedDay) || 0) + 1);
            for (const outcome of lead.outcomes) {
                if (!outcomeCounts.has(outcome))
                    outcomeCounts.set(outcome, new Map());
                const m = outcomeCounts.get(outcome);
                m.set(lead.agent, (m.get(lead.agent) || 0) + 1);
            }
        }
        const toStats = (agent, v) => {
            const picked = v.total - v.rnr;
            return {
                agent,
                total: v.total,
                rnr: v.rnr,
                picked,
                booked: v.booked,
                notQualified: v.notQualified,
                pickedPctOfTotal: v.total > 0 ? parseFloat(((picked / v.total) * 100).toFixed(1)) : 0,
                bookedPctOfPicked: picked > 0 ? parseFloat(((v.booked / picked) * 100).toFixed(1)) : 0,
                bookedPctOfTotal: v.total > 0 ? parseFloat(((v.booked / v.total) * 100).toFixed(1)) : 0,
                notQualifiedPctOfTotal: v.total > 0 ? parseFloat(((v.notQualified / v.total) * 100).toFixed(1)) : 0,
            };
        };
        const byAgent = [...byAgentRaw.entries()].map(([agent, v]) => toStats(agent, v)).sort((a, b) => b.total - a.total);
        const teamTotals = byAgent.reduce((acc, a) => ({ total: acc.total + a.total, rnr: acc.rnr + a.rnr, booked: acc.booked + a.booked, notQualified: acc.notQualified + a.notQualified }), { total: 0, rnr: 0, booked: 0, notQualified: 0 });
        const team = toStats('Team', teamTotals);
        const agentNames = byAgent.map((a) => a.agent);
        const outcomeMatrix = [...outcomeCounts.entries()]
            .map(([outcome, byAgentMap]) => ({
            outcome,
            byAgent: Object.fromEntries(agentNames.map((a) => [a, byAgentMap.get(a) || 0])),
        }))
            .sort((a, b) => {
            const totalA = Object.values(a.byAgent).reduce((s, n) => s + n, 0);
            const totalB = Object.values(b.byAgent).reduce((s, n) => s + n, 0);
            return totalB - totalA;
        });
        const daySpan = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
        const maxInADay = pickedByDay.size > 0 ? Math.max(...pickedByDay.values()) : null;
        return {
            kpis: {
                totalLeadsCalled: team.total,
                picked: this.countPct(team.picked, team.total),
                rnr: this.countPct(team.rnr, team.total),
                booked: this.countPct(team.booked, team.total),
                notQualified: this.countPct(team.notQualified, team.total),
                avgLeadsPerDay: team.total > 0 ? parseFloat((team.total / daySpan).toFixed(1)) : null,
                maxLeadsReachedInADay: maxInADay,
            },
            byAgent,
            team,
            outcomeMatrix,
        };
    }
    // ============ Call Records (Calls tab) — the raw, founder-facing activity log ============
    // Every call in the period/filters, newest first, paginated. Shows EVERY call including still-
    // blank-disposition ones (unlike the KPIs above) — this table is "what actually happened", not a
    // scored metric.
    async getCallRecords(startDate, endDate, agents, leadSource, page, pageSize) {
        const rows = await this.getFilteredCalls(startDate, endDate, agents, leadSource);
        const sorted = [...rows].sort((a, b) => b.startTime.localeCompare(a.startTime));
        const total = sorted.length;
        const start = (page - 1) * pageSize;
        const pageRows = sorted.slice(start, start + pageSize).map((r) => ({
            id: r.id,
            dateTime: r.startTime,
            agent: r.agent,
            leadId: r.leadId,
            leadName: r.leadName,
            number: r.number,
            disposition: r.disposition,
            subDisposition: r.subDisposition,
            durationSec: r.durationSec,
            recordingUrl: r.recordingUrl,
        }));
        return { rows: pageRows, total, page, pageSize };
    }
    // ============ Lead Records (Leads tab) — one row per distinct person ============
    // Name/number/current status/next follow-up come live from the Lead record itself (so they always
    // reflect the LATEST call, even one outside the selected period); callsInPeriod/lastCallDateTime
    // are specific to the selected filters, same population as getLeadsOverview.
    async getLeadRecords(startDate, endDate, agents, leadSource, page, pageSize) {
        const rows = (await this.getFilteredCalls(startDate, endDate, agents, leadSource)).filter((r) => r.disposition && r.leadId);
        const byLead = new Map();
        for (const r of rows) {
            const existing = byLead.get(r.leadId);
            if (!existing) {
                byLead.set(r.leadId, { agent: r.agent, lastCallTime: r.startTime, callsInPeriod: 1 });
            }
            else {
                existing.callsInPeriod += 1;
                if (r.startTime > existing.lastCallTime) {
                    existing.agent = r.agent;
                    existing.lastCallTime = r.startTime;
                }
            }
        }
        const sortedLeadIds = [...byLead.entries()].sort((a, b) => b[1].lastCallTime.localeCompare(a[1].lastCallTime));
        const total = sortedLeadIds.length;
        const start = (page - 1) * pageSize;
        const pageSlice = sortedLeadIds.slice(start, start + pageSize);
        const details = await this.fetchLeadDetails(pageSlice.map(([leadId]) => leadId));
        const pageRows = pageSlice.map(([leadId, agg]) => {
            const d = details.get(leadId);
            return {
                leadId,
                name: d?.name ?? null,
                number: d?.phone ?? null,
                agent: agg.agent,
                disposition: d?.disposition ?? null,
                subDisposition: d?.subDisposition ?? null,
                followUpDateTime: d?.followUpDateTime ?? null,
                callsInPeriod: agg.callsInPeriod,
                lastCallDateTime: agg.lastCallTime,
            };
        });
        return { rows: pageRows, total, page, pageSize };
    }
    // ============ Lead History (the "persistence" popup, shared by both tables) ============
    // Every call ever logged against this ONE lead, oldest first — deliberately NOT restricted to
    // whatever date range the table itself is showing, so the full follow-up trail is always visible.
    async getLeadHistory(leadId) {
        if (!/^\d+$/.test(leadId)) {
            throw new Error('Invalid lead id');
        }
        const query = `select id, Call_disposition, Sub_Disposition, Call_Duration_in_seconds, Voice_Recording__s, ` +
            `Call_Start_Time, Owner.first_name, Owner.last_name from Calls where What_Id = '${leadId}'`;
        const result = await this.coqlQuery(query);
        return (result.data || [])
            .map((r) => ({
            id: r.id,
            dateTime: r['Call_Start_Time'],
            agent: this.agentLabel(r['Owner.first_name'], r['Owner.last_name']),
            disposition: r['Call_disposition'] || null,
            subDisposition: r['Sub_Disposition'] || null,
            durationSec: Number(r['Call_Duration_in_seconds']) || 0,
            recordingUrl: r['Voice_Recording__s'] || null,
        }))
            .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    }
}
exports.ZohoCrmService = ZohoCrmService;
//# sourceMappingURL=ZohoCrmService.js.map