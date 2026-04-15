import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const TruckSchema = new mongoose.Schema({
  truckId: { type: String, required: true, unique: true },
  licensePlate: { type: String, required: true },
  capacity: { type: Number },
  type: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    required: true,
    enum: ['shipper', 'driver', 'fleet-manager', 'broker', 'admin'],
  },
  gstin: { type: String },
  phone: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  refreshTokens: [{ type: String }],  // stored hashed
  trucks: [TruckSchema],
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);
