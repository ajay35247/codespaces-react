import mongoose from 'mongoose';

const connectDatabase = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/speedy-trucks';
    // Fail fast (5 s) when the URI is unreachable so the worker can finish
    // boot and answer /api/health within Railway's 120 s healthcheck window
    // instead of stalling on mongoose's 30 s default ServerSelection.
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.warn('MongoDB connection failed; continuing without database for local development.');
    console.warn(error.message);
  }
};

export default connectDatabase;
