import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { initializeWebSocket } from './services/websocket';
import http from 'http';
import { logger } from './utils/logger';
import { Assistant } from './models/Assistant';

const initializeApp = async () => {
  try {
    logger.info('Attempting to connect to MongoDB...');
    const dbUri = process.env.MONGODB_URI || '';
    const dbName = process.env.MONGODB_DB_NAME || 'dev';
    await mongoose.connect(dbUri, { dbName });
    logger.info(`Successfully connected to MongoDB database: ${dbName}`);

    // Create indexes for Assistant model
    logger.info('Creating database indexes...');
    try {
      // Create compound unique index for companyId and name
      await Assistant.collection.createIndex(
        { companyId: 1, name: 1 },
        { unique: true, sparse: true },
      );
      logger.info(
        'Created unique compound index on Assistant (companyId, name)',
      );

      // Create index on name alone for faster lookups
      await Assistant.collection.createIndex({ name: 1 });
      logger.info('Created index on Assistant name field');
    } catch (indexError: any) {
      if (indexError.code === 11000 || indexError.code === 11001) {
        logger.warn('Index already exists, skipping creation');
      } else {
        logger.error('Error creating indexes:', indexError);
      }
    }
  } catch (error: any) {
    logger.error('Error during initialization:', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

initializeApp();

import express from 'express';
import cors from 'cors';
import policyRouter from './routes/policy.routes';
import { assistantRouter } from './routes/assistant.routes';
import { sessionRouter } from './routes/session.routes';
import { companyRouter } from './routes/company.routes';
import { userRouter } from './routes/user.routes';
import { inboxRouter } from './routes/inbox.routes';
import { actionRouter } from './routes/action.routes';
import { verificationRouter } from './routes/verification.routes';
import {
  verifyAccess,
  verifyTokenMiddleware,
} from './middleware/auth.middleware';
import { apiKeyRateLimit } from './middleware/apiKeyRateLimit.middleware';
import { onboardingRouter } from './routes/onboarding.routes';
import { authRouter } from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler.middleware';
// Removed redundant file/content route imports - using unified workspace and file manager only
import integrationRouter from './routes/integration.routes';
import { teamRouter } from './routes/team.routes';
import { workspaceRouter } from './routes/workspace.routes';
import memoryRouter from './routes/memory.routes'; // Added import for memory router
import apiKeyRouter from './routes/apiKey.routes';
import { costTrackingRouter } from './routes/cost-tracking.routes';
import filesRouter from './routes/files.routes';
import promptHistoryRouter from './routes/prompt-history.routes';
// Removed legacy workspace routers - using unified workspace only
import unifiedWorkspaceRouter from './routes/unified-workspace.routes';
import mcpRouter from './routes/mcp.routes';
import oauthMcpRouter from './routes/oauth-mcp.routes';
import uiStateRouter from './routes/ui-state.routes';
import { inviteRouter } from './routes/invite.routes';
import nylasAuthRouter from './routes/nylas-auth.routes';

// Read package.json at startup
let packageJson: { version: string; name: string };
try {
  packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  );
} catch (error) {
  logger.warn('Could not read package.json', error);
  packageJson = { version: 'unknown', name: 'unknown' };
}

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server instance
const server = http.createServer(app);

// Initialize WebSocket service
const io = initializeWebSocket(server);

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Apply rate limiting globally for API key requests
app.use(
  apiKeyRateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute for API keys
    skipJWT: true, // Don't rate limit JWT auth
  }),
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: packageJson.version,
    name: packageJson.name,
  });
});

import compression from 'compression'; // Added for SSE Step 2

// Public routes
app.use('/auth', authRouter);
app.use('/policy', policyRouter);

// OAuth endpoints for MCP - public (no auth required)
app.use('/', oauthMcpRouter);

// MCP health check - public endpoint
app.get('/api/mcp/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// SSE Step 2: Skip compression() when SSE is requested for /assistant/user-input
// Note: The task card mentions /api/assistant/user-input.
// Given assistantRouter is mounted at /assistant, this middleware targets /assistant/user-input.
app.use('/assistant/user-input', (req, res, next) => {
  const acceptHeader = req.get('accept');
  // Check if acceptHeader is not undefined and includes 'text/event-stream'
  const wantsSSE =
    typeof acceptHeader === 'string' &&
    acceptHeader.includes('text/event-stream');
  if (wantsSSE) {
    return next(); // no gzip for SSE
  }
  // Apply compression only if SSE is not requested for this specific route
  return compression()(req, res, next);
});

// Routes that require company-specific access
// Note: Specific routes must come before generic /api route
app.use('/assistant', verifyTokenMiddleware, verifyAccess(), assistantRouter);
app.use('/company', verifyTokenMiddleware, verifyAccess(), companyRouter);
app.use('/user', verifyTokenMiddleware, verifyAccess(), userRouter);
// Removed redundant file/content routes - using unified file manager only
app.use('/inbox', verifyTokenMiddleware, verifyAccess(), inboxRouter);
app.use('/action', verifyTokenMiddleware, verifyAccess(), actionRouter);
app.use('/session', verifyTokenMiddleware, verifyAccess(), sessionRouter);
app.use('/files', verifyTokenMiddleware, verifyAccess(), filesRouter); // Unified file management
app.use('/api/keys', verifyTokenMiddleware, verifyAccess(), apiKeyRouter); // API key management (before generic /api)
app.use(
  '/api/costs',
  verifyTokenMiddleware,
  verifyAccess(),
  costTrackingRouter,
); // Cost tracking (before generic /api)
app.use(
  '/api/workspace',
  verifyTokenMiddleware,
  verifyAccess(),
  unifiedWorkspaceRouter,
); // Unified Workspace (before generic /api)
app.use('/api/ui-state', verifyTokenMiddleware, verifyAccess(), uiStateRouter); // UI State tracking (before generic /api)
app.use('/api/invites', verifyTokenMiddleware, verifyAccess(), inviteRouter); // User invite system
app.use('/api/nylas-auth', nylasAuthRouter); // Nylas auth (mixed auth - some routes public, some protected)
app.use('/webhooks', nylasAuthRouter); // Webhook callbacks from V3 microservice (public)
// MCP Server - custom auth that allows initialize, tools/list, and notifications without auth
app.use(
  '/api/mcp',
  (req, res, next) => {
    // Allow initialize, tools/list, and initialized notification without auth (required by MCP spec for capability discovery)
    if (
      req.body?.method === 'initialize' ||
      req.body?.method === 'tools/list' ||
      req.body?.method === 'notifications/initialized'
    ) {
      return next();
    }

    // For MCP, intercept 401 responses to add WWW-Authenticate header per RFC 9728
    const originalJson = res.json;
    res.json = function (body: any) {
      if (res.statusCode === 401) {
        res.header(
          'WWW-Authenticate',
          'Bearer realm="MCP", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"',
        );
      }
      return originalJson.call(this, body);
    };

    // All other methods require auth
    return verifyTokenMiddleware(req, res, () => {
      verifyAccess()(req, res, next);
    });
  },
  mcpRouter,
); // MCP Server (before generic /api)
app.use('/api', verifyTokenMiddleware, verifyAccess(), verificationRouter);
app.use('/onboarding', verifyTokenMiddleware, verifyAccess(), onboardingRouter);
// Removed content and content-type routes - using unified workspace only
app.use(
  '/integrations',
  verifyTokenMiddleware,
  verifyAccess(),
  integrationRouter,
);
app.use('/teams', verifyTokenMiddleware, verifyAccess(), teamRouter);
app.use('/workspace', workspaceRouter); // Public access for workspace file serving (team avatars, etc.)
app.use('/memory', verifyTokenMiddleware, verifyAccess(), memoryRouter); // Added memory router
app.use('/api', verifyTokenMiddleware, verifyAccess(), promptHistoryRouter); // Prompt history

// Admin-only routes - to be added later
//app.use('/admin', verifyTokenMiddleware, verifyAccess(true), adminRouter);

// error handler
app.use(errorHandler);

export default app;

if (process.env.NODE_ENV !== 'test') {
  // Use the HTTP server instead of the Express app to listen
  server.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
    logger.info(
      `WebSocket server is available at ws://localhost:${port}/realtime`,
    );
  });

  // Cleanup handlers for graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('Shutting down gracefully...');

    // Cleanup OpenAI Code Executor resources
    // TODO: Re-enable when openai-code-execution.service is implemented
    // try {
    //   const { cleanupCodeExecutor } = await import('./services/openai-code-execution.service');
    //   await cleanupCodeExecutor();
    //   logger.info('OpenAI Code Executor cleaned up');
    // } catch (error) {
    //   logger.error('Error cleaning up OpenAI Code Executor:', error);
    // }

    // Note: Unified workspace service doesn't require explicit cleanup
    // It uses in-memory Maps, MongoDB via Keyv (handles own connections),
    // and S3/GCP (stateless connections)

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}
