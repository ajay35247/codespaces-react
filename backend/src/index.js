import cluster from 'cluster';
import os from 'os';
import express from 'express';
import cors from 'cors';
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
import dotenv from 'dotenv';
import connectDatabase from './config/db.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { auditLogger } from './middleware/auditLogger.js';
import { verifyAccessToken } from './middleware/authorize.js';

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

dotenv.config();

// ── Startup env validation ─────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}
const PORT = process.env.PORT || 5000;
const USE_CLUSTER = process.env.USE_CLUSTER === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.speedy-trucks.example.com';
const CLIENT_URL = process.env.CLIENT_URL || 'https://www.speedy-trucks.example.com';

const createApp = async () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", FRONTEND_URL, 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: [FRONTEND_URL, CLIENT_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }));

  app.use(compression());
  app.use(hpp());
  app.use(mongoSanitize());
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny'));

  const redisClient = createClient({ url: REDIS_URL });
  await redisClient.connect();

  const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:'
    }),
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:auth:'
    }),
  });

  const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many payment attempts from this IP, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:payment:'
    }),
  });

  app.use(apiLimiter);

  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
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

  connectDatabase();

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'speedy-trucks-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongoState: mongoose.connection.readyState,
      redisConnected: redisClient.isOpen ? 'connected' : 'disconnected'
    });
  });

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } catch (error) {
      res.status(500).json({ error: 'Unable to collect metrics', details: error.message });
    }
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/payments', paymentLimiter, paymentRoutes);
  app.use('/api/loads', loadsRoutes);
  app.use('/api/match', matchingRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/gst', gstRoutes);
  app.use('/api/broker', brokerRoutes);
  app.use('/api/fleet', fleetRoutes);

  // Audit all mutating API requests
  app.use('/api', auditLogger);

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

  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  const io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: FRONTEND_URL,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.adapter(createAdapter(pubClient, subClient));

  // Socket.IO JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.slice(7);
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
      if (!data?.vehicleId || !data?.location?.lat || !data?.location?.lng) return;
      // Only drivers can push location
      if (!['driver', 'fleet-manager'].includes(socket.user.role)) return;

      try {
        await mongoose.connection.db.collection('vehicles').updateOne(
          { _id: new mongoose.Types.ObjectId(data.vehicleId) },
          { $set: { currentLocation: data.location, updatedAt: new Date() } }
        );
        io.to(`vehicle:${data.vehicleId}`).emit('vehicle-location-updated', {
          vehicleId: data.vehicleId,
          location: data.location,
          updatedAt: new Date().toISOString(),
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
    await redisClient.disconnect();
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
