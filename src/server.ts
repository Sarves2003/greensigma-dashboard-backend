import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, closeDatabase } from './config/database';
import { AuthService } from './services/AuthService';
import { requireAuth, requirePermission } from './middleware/auth';
import { ROUTE_PERMISSION_MAP } from './config/permissions';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import overviewRoutes from './routes/overview';
import userRoutes from './routes/users';
import retentionRoutes from './routes/retention';
import portfolioRoutes from './routes/portfolio';
import gsHealthRoutes from './routes/gsHealth';
import overviewV2Routes from './routes/overviewV2';
import unrealizedPnlRoutes from './routes/unrealizedPnl';
import funnelAnalysisRoutes from './routes/funnelAnalysis';
import usageAnalysisRoutes from './routes/usageAnalysis';
import activationTrackerRoutes from './routes/activationTracker';
import emandateTrackerRoutes from './routes/emandateTracker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [
      'https://greensigma-dashboard-frontend.onrender.com',
      'http://localhost:4200',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Auth (login is public; /me and /change-password gate themselves via requireAuth)
app.use('/api/auth', authRoutes);
// Admin management (Owner-only, gated internally)
app.use('/api/admin', adminRoutes);

// Feature routes: base auth for everyone with a valid session, plus a tab-level
// permission check for routers that map 1:1 to a single dashboard tab.
app.use('/api/overview', requireAuth, overviewRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/retention', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/retention']), retentionRoutes);
app.use('/api/portfolio', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/portfolio']), portfolioRoutes);
app.use('/api/gs-health', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/gs-health']), gsHealthRoutes);
app.use('/api/overview-v2', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/overview-v2']), overviewV2Routes);
app.use('/api/unrealized-pnl', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/unrealized-pnl']), unrealizedPnlRoutes);
app.use('/api/funnel-analysis', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/funnel-analysis']), funnelAnalysisRoutes);
app.use('/api/usage-analysis', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/usage-analysis']), usageAnalysisRoutes);
app.use('/api/activation-tracker', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/activation-tracker']), activationTrackerRoutes);
app.use('/api/emandate-tracker', requireAuth, requirePermission(ROUTE_PERMISSION_MAP['/api/emandate-tracker']), emandateTrackerRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    await connectDatabase();
    console.log('Database connected');

    await new AuthService().ensureSeeded();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

startServer();
