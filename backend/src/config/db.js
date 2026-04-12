import mongoose from 'mongoose';

const connectDatabase = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/speedy-trucks';
    await mongoose.connect(uri, {
      autoIndex: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.warn('MongoDB connection failed; continuing without database for local development.');
    console.warn(error.message);
  }
};

export default connectDatabase;
