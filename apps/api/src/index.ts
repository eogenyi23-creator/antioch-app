/**
 * Antioch API — Express server entry point.
 */

import './config/env.js'; // validates env vars at startup
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { authMiddleware } from './auth/middleware.js';
import { errorHandler } from './middleware/index.js';
import { startJobs } from './jobs/index.js';
import { openApiSpec } from './openapi/spec.js';

// Routers
import authRouter from './auth/router.js';
import campaignsRouter from './routes/campaigns.js';
import milestonesRouter from './routes/milestones.js';
import donationsRouter from './routes/donations.js';
import { approvalsRouter, refundsRouter } from './routes/approvals.js';
import meRouter from './routes/me.js';
import adminRouter from './routes/admin.js';

const app = express();

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // needed for swagger-ui
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);

// Global rate limit: 200 req / 15 min per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Auth middleware (populates req.user on all routes)
// ---------------------------------------------------------------------------
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// OpenAPI docs
// ---------------------------------------------------------------------------
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
const api = express.Router();

api.use('/auth', authLimiter, authRouter);
api.use('/campaigns', campaignsRouter);
api.use('/campaigns/:id/milestones', milestonesRouter);
api.use('/campaigns/:id/donations', donationsRouter);
api.use('/campaigns/:id/milestones', approvalsRouter);
api.use('/campaigns/:id', refundsRouter);
api.use('/me', meRouter);
api.use('/admin', adminRouter);

app.use('/api/v1', api);

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
if (process.env['NODE_ENV'] !== 'test') {
  app.listen(env.port, () => {
    console.log(`Antioch API listening on port ${env.port}`);
    startJobs();
  });
}

export default app;
