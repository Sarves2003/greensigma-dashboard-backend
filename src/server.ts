import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, closeDatabase } from './config/database';
import overviewRoutes from './routes/overview';
import userRoutes from './routes/users';
import retentionRoutes from './routes/retention';
import portfolioRoutes from './routes/portfolio';
import gsHealthRoutes from './routes/gsHealth';
import overviewV2Routes from './routes/overviewV2';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || 'http://localhost:4200',
      'http://localhost:4200',
      'http://localhost:4201',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:4201',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Routes
app.use('/api/overview', overviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/retention', retentionRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/gs-health', gsHealthRoutes);
app.use('/api/overview-v2', overviewV2Routes);

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
