"use strict";
// Central permission catalog. This is the single source of truth for every
// tab-level and card-level permission key in the dashboard. Backend middleware
// checks these keys to gate API routes; the frontend admin UI renders this same
// catalog (via GET /api/admin/permission-registry) to build the grant checkboxes,
// and tab/card components check these keys to decide what to render.
//
// To add a new lockable tab or card: add an entry here (and, for a tab, an entry
// in ROUTE_PERMISSION_MAP if its API should be gated). Nothing else needs to change
// for the permission to show up in the admin UI or be assignable to a role/user.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE_PERMISSIONS = exports.ROUTE_PERMISSION_MAP = exports.TAB_KEYS = exports.PERMISSION_KEYS = exports.PERMISSIONS = exports.ROLE_RANK = exports.ROLE_LABELS = exports.ROLES = void 0;
exports.isValidPermissionKey = isValidPermissionKey;
exports.ROLES = ['owner', 'super_admin', 'manager', 'product_manager', 'sales_team'];
exports.ROLE_LABELS = {
    owner: 'Owner',
    super_admin: 'Super Admin',
    manager: 'Manager',
    product_manager: 'Product Manager',
    sales_team: 'Sales Team',
};
// Roles ranked highest-privilege first. Used only for display ordering and for
// "can user A manage user B" checks (a role may never manage an equal-or-higher role).
exports.ROLE_RANK = {
    owner: 0,
    super_admin: 1,
    manager: 2,
    product_manager: 3,
    sales_team: 4,
};
exports.PERMISSIONS = [
    { key: 'tab:product-metrics', label: 'Product Metrics', type: 'tab' },
    { key: 'card:product-metrics:signup-engagement', label: 'Signup & Engagement', type: 'card', tabKey: 'tab:product-metrics' },
    { key: 'card:product-metrics:activation-rate', label: 'Activation Rate', type: 'card', tabKey: 'tab:product-metrics' },
    { key: 'card:product-metrics:active-user-cards', label: 'DAU / MAU / Stickiness Cards', type: 'card', tabKey: 'tab:product-metrics' },
    { key: 'card:product-metrics:active-user-breakdown', label: 'Active User Breakdown Chart', type: 'card', tabKey: 'tab:product-metrics' },
    { key: 'card:product-metrics:engagement-distribution', label: 'Engagement Distribution', type: 'card', tabKey: 'tab:product-metrics' },
    { key: 'tab:gs-health', label: 'Revenue Metrics', type: 'tab' },
    { key: 'card:gs-health:key-metrics', label: 'Key Metrics', type: 'card', tabKey: 'tab:gs-health' },
    { key: 'card:gs-health:trends', label: 'Trends & By-Year Comparison', type: 'card', tabKey: 'tab:gs-health' },
    { key: 'tab:funnel-analysis', label: 'Funnel Analysis', type: 'tab' },
    { key: 'card:funnel-analysis:segment1', label: 'Period Funnel Breakdown', type: 'card', tabKey: 'tab:funnel-analysis' },
    { key: 'card:funnel-analysis:segment2', label: 'All-Time Conversion Table', type: 'card', tabKey: 'tab:funnel-analysis' },
    { key: 'card:funnel-analysis:segment3', label: 'Webinar Batch Analysis', type: 'card', tabKey: 'tab:funnel-analysis' },
    { key: 'card:funnel-analysis:date-manager', label: 'Webinar Date Manager', type: 'card', tabKey: 'tab:funnel-analysis' },
    { key: 'card:funnel-analysis:location-upload', label: 'Location Data Upload', type: 'card', tabKey: 'tab:funnel-analysis' },
    { key: 'tab:unrealized-pnl', label: 'Live P&L', type: 'tab' },
    { key: 'card:unrealized-pnl:export', label: 'WhatsApp Export', type: 'card', tabKey: 'tab:unrealized-pnl' },
    { key: 'tab:portfolio', label: 'Portfolio', type: 'tab' },
    { key: 'tab:retention', label: 'Retention', type: 'tab' },
    { key: 'tab:usage-analysis', label: 'Usage Analysis', type: 'tab' },
    { key: 'card:usage-analysis:main', label: 'Main (Signup & Usage Table)', type: 'card', tabKey: 'tab:usage-analysis' },
    { key: 'card:usage-analysis:demo-call', label: 'Demo Call Tracking', type: 'card', tabKey: 'tab:usage-analysis' },
    { key: 'card:usage-analysis:assessment', label: 'Assessment Tracking', type: 'card', tabKey: 'tab:usage-analysis' },
];
exports.PERMISSION_KEYS = exports.PERMISSIONS.map((p) => p.key);
exports.TAB_KEYS = exports.PERMISSIONS.filter((p) => p.type === 'tab').map((p) => p.key);
function isValidPermissionKey(key) {
    return exports.PERMISSION_KEYS.includes(key);
}
// Maps an API route prefix to the tab permission required to call it.
// Only routers that correspond 1:1 to a single visible tab are listed here;
// shared/legacy routers (e.g. /api/users, /api/overview) are mounted with
// base authentication only (any logged-in dashboard user), since they are not
// a single tab's exclusive API.
exports.ROUTE_PERMISSION_MAP = {
    '/api/overview-v2': 'tab:product-metrics',
    '/api/gs-health': 'tab:gs-health',
    '/api/retention': 'tab:retention',
    '/api/portfolio': 'tab:portfolio',
    '/api/unrealized-pnl': 'tab:unrealized-pnl',
    '/api/funnel-analysis': 'tab:funnel-analysis',
    '/api/usage-analysis': 'tab:usage-analysis',
};
// Default permission grants per role. Seeded into dashboard_role_permissions on
// first boot; editable afterward by the Owner through the admin UI.
exports.DEFAULT_ROLE_PERMISSIONS = {
    owner: [...exports.PERMISSION_KEYS],
    super_admin: [...exports.PERMISSION_KEYS],
    manager: [...exports.PERMISSION_KEYS],
    product_manager: [
        'tab:product-metrics',
        'card:product-metrics:signup-engagement',
        'card:product-metrics:activation-rate',
        'card:product-metrics:active-user-cards',
        'card:product-metrics:active-user-breakdown',
        'card:product-metrics:engagement-distribution',
        'tab:funnel-analysis',
        'card:funnel-analysis:segment1',
        'card:funnel-analysis:segment2',
        'card:funnel-analysis:segment3',
        'card:funnel-analysis:date-manager',
        'card:funnel-analysis:location-upload',
        'tab:retention',
    ],
    sales_team: [
        'tab:funnel-analysis',
        'card:funnel-analysis:segment1',
        'card:funnel-analysis:segment2',
        'card:funnel-analysis:segment3',
        'tab:unrealized-pnl',
        'card:unrealized-pnl:export',
        'tab:gs-health',
        'card:gs-health:key-metrics',
        'card:gs-health:trends',
        'tab:usage-analysis',
        'card:usage-analysis:main',
        'card:usage-analysis:demo-call',
        'card:usage-analysis:assessment',
    ],
};
//# sourceMappingURL=permissions.js.map