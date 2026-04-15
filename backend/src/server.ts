import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import Redis from 'redis';
import authRoutes from './routes/auth';
import vehicleRoutes from './routes/vehicles';
import loadRoutes from './routes/loads';
import notificationRoutes from './routes/notifications';
import { NotificationService } from './services/NotificationService';
import { MatchingEngine } from './services/MatchingEngine';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ["http://localhost:3000", "http://localhost:8081"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ["http://localhost:3000", "http://localhost:8081"],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Redis setup for caching and queues
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// Services
const notificationService = new NotificationService();
const matchingEngine = new MatchingEngine(notificationService);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/loads', loadRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'speedy-trucks-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId: string) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on('leave', (userId: string) => {
    socket.leave(userId);
    console.log(`User ${userId} left room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Handle realtime location updates
  socket.on('update-location', async (data: { vehicleId: string; location: any }) => {
    try {
      // Update vehicle location in DB
      await mongoose.connection.db.collection('vehicles').updateOne(
        { _id: new mongoose.Types.ObjectId(data.vehicleId) },
        {
          $set: {
            'currentLocation': data.location,
            updatedAt: new Date()
          }
        }
      );

      // Broadcast to relevant users (shippers, brokers, etc.)
      socket.broadcast.emit('vehicle-location-updated', {
        vehicleId: data.vehicleId,
        location: data.location
      });
    } catch (error) {
      console.error('Location update error:', error);
    }
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/speedy-trucks')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { io, redisClient };