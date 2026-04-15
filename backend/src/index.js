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
import dotenv from 'dotenv';
import connectDatabase from './config/db.js';
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
const PORT = process.env.PORT || 5000;
const USE_CLUSTER = process.env.USE_CLUSTER === 'true';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FRONTEND_URL = process.env.CLIENT_URL || 'http://localhost:3000';

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
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }));

  app.use(compression());
  app.use(hpp());
  app.use(mongoSanitize());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny'));

  const redisClient = createClient({ url: REDIS_URL });
  await redisClient.connect();

  const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:'
    }),
  });

  app.use(apiLimiter);

  connectDatabase();

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'speedy-trucks-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/loads', loadsRoutes);
  app.use('/api/match', matchingRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/gst', gstRoutes);
  app.use('/api/broker', brokerRoutes);
  app.use('/api/fleet', fleetRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

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

  io.on('connection', (socket) => {
    socket.on('join', (userId) => {
      socket.join(userId);
    });

    socket.on('leave', (userId) => {
      socket.leave(userId);
    });

    socket.on('update-location', async (data) => {
      try {
        await mongoose.connection.db.collection('vehicles').updateOne(
          { _id: new mongoose.Types.ObjectId(data.vehicleId) },
          { $set: { currentLocation: data.location, updatedAt: new Date() } }
        );
        io.to(data.vehicleId).emit('vehicle-location-updated', {
          vehicleId: data.vehicleId,
          location: data.location
        });
      } catch (err) {
        console.error('Location update error:', err);
      }
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
