"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./config/database");
const AuthService_1 = require("./services/AuthService");
const auth_1 = require("./middleware/auth");
const permissions_1 = require("./config/permissions");
const auth_2 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const overview_1 = __importDefault(require("./routes/overview"));
const users_1 = __importDefault(require("./routes/users"));
const retention_1 = __importDefault(require("./routes/retention"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const gsHealth_1 = __importDefault(require("./routes/gsHealth"));
const overviewV2_1 = __importDefault(require("./routes/overviewV2"));
const unrealizedPnl_1 = __importDefault(require("./routes/unrealizedPnl"));
const funnelAnalysis_1 = __importDefault(require("./routes/funnelAnalysis"));
const usageAnalysis_1 = __importDefault(require("./routes/usageAnalysis"));
const activationTracker_1 = __importDefault(require("./routes/activationTracker"));
const emandateTracker_1 = __importDefault(require("./routes/emandateTracker"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({
    origin: [
        'https://greensigma-dashboard-frontend.onrender.com',
        'http://localhost:4200',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Auth (login is public; /me and /change-password gate themselves via requireAuth)
app.use('/api/auth', auth_2.default);
// Admin management (Owner-only, gated internally)
app.use('/api/admin', admin_1.default);
// Feature routes: base auth for everyone with a valid session, plus a tab-level
// permission check for routers that map 1:1 to a single dashboard tab.
app.use('/api/overview', auth_1.requireAuth, overview_1.default);
app.use('/api/users', auth_1.requireAuth, users_1.default);
app.use('/api/retention', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/retention']), retention_1.default);
app.use('/api/portfolio', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/portfolio']), portfolio_1.default);
app.use('/api/gs-health', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/gs-health']), gsHealth_1.default);
app.use('/api/overview-v2', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/overview-v2']), overviewV2_1.default);
app.use('/api/unrealized-pnl', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/unrealized-pnl']), unrealizedPnl_1.default);
// Permission gating for /webinar-dates is applied per-route inside funnelAnalysis.ts instead of
// here, since that endpoint is shared by 7 Day Activation and Emandate too, not just this tab.
app.use('/api/funnel-analysis', auth_1.requireAuth, funnelAnalysis_1.default);
app.use('/api/usage-analysis', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/usage-analysis']), usageAnalysis_1.default);
app.use('/api/activation-tracker', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/activation-tracker']), activationTracker_1.default);
app.use('/api/emandate-tracker', auth_1.requireAuth, (0, auth_1.requirePermission)(permissions_1.ROUTE_PERMISSION_MAP['/api/emandate-tracker']), emandateTracker_1.default);
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString(),
    });
});
// Start server
async function startServer() {
    try {
        await (0, database_1.connectDatabase)();
        console.log('Database connected');
        await new AuthService_1.AuthService().ensureSeeded();
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await (0, database_1.closeDatabase)();
    process.exit(0);
});
startServer();
//# sourceMappingURL=server.js.map