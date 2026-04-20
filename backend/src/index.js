import 'dotenv/config';
import crypto from 'crypto';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import promClient from 'prom-client';
import connectDatabase from './config/db.js';
import { validateStartupEnv } from './config/envValidation.js';
import { getAllowedOriginsFromEnv } from './config/origins.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { auditLogger } from './middleware/auditLogger.js';
import { enforceTrustedOriginForCookieAuth } from './middleware/csrfProtection.js';
import { getSocketAccessToken, verifyAccessToken } from './middleware/authorize.js';
import { ensureAdminAccount } from './services/securityBootstrap.js';
import { getAdminPathSegment } from './middleware/adminSecurity.js';

promClient.collectDefaultMetrics({ timeout: 5000 });
import authRoutes from './routes/auth.js';
import loadsRoutes from './routes/loads.js';
import matchingRoutes from './routes/matching.js';
import trackingRoutes from './routes/tracking.js';
import paymentRoutes from './routes/payments.js';
import gstRoutes from './routes/gst.js';
import brokerRoutes from './routes/broker.js';
import fleetRoutes from './routes/fleet.js';
import supportRoutes from './routes/support.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import tollsRoutes from './routes/tolls.js';

const httpRequestsTotal = new promClient.Counter({
  name: 'speedy_trucks_http_requests_total',
  help: 'Total HTTP requests handled by the backend',
  labelNames: ['method', 'path', 'status_code'],
});

const authFailuresTotal = new promClient.Counter({
  name: 'speedy_trucks_auth_failures_total',
  help: 'Total failed authentication and authorization events',
  labelNames: ['path', 'status_code'],
});

validateStartupEnv();

const PORT = process.env.PORT || 5000;
const USE_CLUSTER = process.env.USE_CLUSTER === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const allowedOrigins = getAllowedOriginsFromEnv();

async function connectRedisClient(url) {
  const client = createClient({ url });
  try {
    await client.connect();
    return client;
  } catch (error) {
    console.warn(`Redis unavailable, continuing without Redis-backed features: ${error.message}`);
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect failures for partially connected clients.
    }
    return null;
  }
}

function createLimiter(options, redisClient, prefix) {
  const limiterOptions = {
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
  };

  if (redisClient?.isOpen) {
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix,
    });
  }

  return rateLimit(limiterOptions);
}

const createApp = async () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", ...allowedOrigins, 'https:', 'wss:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }));

  app.use(compression());
  app.use(hpp());
  app.use(mongoSanitize());
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny'));

  app.use((req, res, next) => {
    res.on('finish', () => {
      httpRequestsTotal.inc({ method: req.method, path: req.path, status_code: String(res.statusCode) });
      if (req.path.startsWith('/api/auth') && [401, 403, 423].includes(res.statusCode)) {
        authFailuresTotal.inc({ path: req.path, status_code: String(res.statusCode) });
      }
    });
    next();
  });

  const redisClient = await connectRedisClient(REDIS_URL);

  const apiLimiter = createLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  }, redisClient, 'rl:');

  const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication requests from this IP, please try again later.',
  }, redisClient, 'rl:auth:');

  const paymentLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many payment attempts from this IP, please slow down.',
  }, redisClient, 'rl:payment:');

  app.use(apiLimiter);

  // CSRF / trusted-origin guard runs after the rate limiter (correct order:
  // rate-limit → CSRF check → routes) and before all route handlers.
  //
  // The token comparison is expressed inline so that static analysis tools
  // (e.g. CodeQL js/missing-token-validation) can trace the data flow from
  // cookieParser() through this check to the route handlers without requiring
  // cross-file inter-procedural analysis.  The implementation in
  // csrfProtection.js remains the authoritative version (it also enforces the
  // trusted-origin check as a defence-in-depth layer).
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    // Bearer-token requests are not vulnerable to CSRF.
    if (req.get('authorization')) return next();
    // Requests without an auth cookie (e.g. webhook, public contact form)
    // are not subject to cookie-based CSRF.
    const cookies = req.cookies || {};
    const hasAuthCookie = Boolean(
      cookies['st_access'] || cookies['st_refresh']
      || cookies['st_admin_access'] || cookies['st_admin_refresh']
    );
    if (!hasAuthCookie) return next();
    // Double-submit CSRF token check — the frontend reads the non-HttpOnly
    // `csrf-token` cookie and echoes it as the `X-CSRF-Token` request header.
    const cookieToken = cookies['csrf-token'] || '';
    const headerToken = req.headers['x-csrf-token'] || '';
    if (!cookieToken || !headerToken) {
      return res.status(403).json({ error: 'Forbidden: missing CSRF token' });
    }
    try {
      const a = Buffer.from(cookieToken, 'utf8');
      const b = Buffer.from(headerToken, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Forbidden: invalid CSRF token' });
      }
    } catch {
      return res.status(403).json({ error: 'Forbidden: invalid CSRF token' });
    }
    // Delegate to the full implementation for the trusted-origin defence-in-
    // depth check.
    return enforceTrustedOriginForCookieAuth(req, res, next);
  });

  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      if (req.path === '/api/health') {
        return next();
      }
      if (req.headers['x-forwarded-proto'] === 'http') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
    app.use((req, res, next) => {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      next();
    });
  }

  await connectDatabase();
  await ensureAdminAccount();

  app.use((req, res, next) => {
    if (req.path === '/api/health') {
      return next();
    }
    if (process.env.NODE_ENV === 'production' && req.secure !== true && req.headers['x-forwarded-proto'] !== 'https') {
      return res.status(400).json({ error: 'HTTPS is required' });
    }
    return next();
  });

  // Audit middleware must be registered before route handlers.
  app.use('/api', auditLogger);

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'speedy-trucks-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongoState: mongoose.connection.readyState,
      redisConnected: redisClient?.isOpen ? 'connected' : 'disconnected',
    });
  });

  app.get('/metrics', async (req, res) => {
    // Require a bearer token to access metrics — prevents unauthenticated
    // reconnaissance via Prometheus scrape endpoint.
    const metricsToken = process.env.METRICS_SECRET_TOKEN;
    if (metricsToken) {
      const authHeader = req.headers.authorization || '';
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!provided || provided !== metricsToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    try {
      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } catch (error) {
      res.status(500).json({ error: 'Unable to collect metrics', details: error.message });
    }
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use(`/api/${getAdminPathSegment()}`, adminRoutes);
  app.use('/api/payments', paymentLimiter, paymentRoutes);
  app.use('/api/loads', loadsRoutes);
  app.use('/api/match', matchingRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/gst', gstRoutes);
  app.use('/api/broker', brokerRoutes);
  app.use('/api/fleet', fleetRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/tolls', tollsRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Global error handler – must be last
  app.use(globalErrorHandler);

  return { app, redisClient };
};

const startWorker = async () => {
  const { app, redisClient } = await createApp();
  const server = createServer(app);

  const io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  let pubClient = null;
  let subClient = null;

  if (redisClient?.isOpen) {
    pubClient = await connectRedisClient(REDIS_URL);
    subClient = pubClient ? await connectRedisClient(REDIS_URL) : null;
    if (pubClient?.isOpen && subClient?.isOpen) {
      io.adapter(createAdapter(pubClient, subClient));
    }
  }

  // Socket.IO JWT authentication middleware
  io.use((socket, next) => {
    const token = getSocketAccessToken(socket);
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      socket.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Auto-join personal room authenticated by JWT
    socket.join(socket.user.id);

    socket.on('join-vehicle', (vehicleId) => {
      socket.join(`vehicle:${vehicleId}`);
    });

    socket.on('leave-vehicle', (vehicleId) => {
      socket.leave(`vehicle:${vehicleId}`);
    });

    socket.on('update-location', async (data) => {
      if (!data?.vehicleId || typeof data.location?.lat !== 'number' || typeof data.location?.lng !== 'number') return;
      // Only drivers and fleet-managers can push location updates.
      if (!['driver', 'fleet-manager'].includes(socket.user.role)) return;

      const vehicleId = String(data.vehicleId);
      const location = {
        lat: data.location.lat,
        lng: data.location.lng,
      };
      const now = new Date();

      try {
        // Ownership check: only update a vehicle that is already registered and
        // owned by this user.  Never upsert — that would allow any authenticated
        // user to create phantom vehicle documents or overwrite ownerId on
        // vehicles they do not own (IDOR / vehicle hijacking).
        const result = await mongoose.connection.db.collection('vehicles').updateOne(
          { vehicleId, ownerId: socket.user.id },
          {
            $set: {
              currentLocation: location,
              updatedAt: now,
            },
            $push: {
              routeHistory: {
                $each: [{ ...location, timestamp: now }],
                $slice: -200,
              },
            },
          }
        );

        // Only broadcast if the vehicle actually existed and belonged to this user.
        if (result.matchedCount === 0) return;

        io.to(`vehicle:${vehicleId}`).emit('vehicle-location-updated', {
          vehicleId,
          location,
          updatedAt: now.toISOString(),
        });
      } catch (err) {
        console.error('Location update error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      socket.leave(socket.user.id);
    });
  });

  server.listen(PORT, () => {
    console.log(`${process.pid} listening on port ${PORT}`);
  });

  const shutdown = async () => {
    console.log('Graceful shutdown started');
    await io.close();
    await server.close();
    if (subClient?.isOpen) {
      await subClient.disconnect();
    }
    if (pubClient?.isOpen) {
      await pubClient.disconnect();
    }
    if (redisClient?.isOpen) {
      await redisClient.disconnect();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

if (USE_CLUSTER && cluster.isPrimary) {
  const cpuCount = Math.max(2, os.cpus().length - 1);
  console.log(`Primary process ${process.pid} setting up ${cpuCount} workers`);
  for (let i = 0; i < cpuCount; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  startWorker().catch((err) => {
    console.error('Worker failed to start:', err);
    process.exit(1);
  });
}
