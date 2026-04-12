import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDatabase from './config/db.js';
import authRoutes from './routes/auth.js';
import loadsRoutes from './routes/loads.js';
import trackingRoutes from './routes/tracking.js';
import paymentRoutes from './routes/payments.js';
import gstRoutes from './routes/gst.js';
import brokerRoutes from './routes/broker.js';
import fleetRoutes from './routes/fleet.js';
import supportRoutes from './routes/support.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

connectDatabase();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json());
app.use(morgan('tiny'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'speedy-trucks-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/loads', loadsRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/gst', gstRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/fleet', fleetRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Speedy Trucks backend listening on port ${PORT}`);
});
