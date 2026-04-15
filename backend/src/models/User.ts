import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  role: 'shipper' | 'truck_owner' | 'driver' | 'broker' | 'admin';
  name: string;
  phone: string;
  isVerified: boolean;
  lastLogin?: Date;
  failedLoginAttempts: number;
  lockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  incLoginAttempts(): Promise<void>;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },
  role: { type: String, required: true, enum: ['shipper', 'truck_owner', 'driver', 'broker', 'admin'] },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  isVerified: { type: Boolean, default: false },
  lastLogin: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date }
}, { timestamps: true });

// Index for performance
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });

// Password hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.incLoginAttempts = async function(): Promise<void> {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { failedLoginAttempts: 1 }
    });
  }

  const updates: any = { $inc: { failedLoginAttempts: 1 } };

  if (this.failedLoginAttempts + 1 >= 5 && !this.lockUntil) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }

  return this.updateOne(updates);
};

// Virtual for account lock
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

export const User = mongoose.model<IUser>('User', UserSchema);