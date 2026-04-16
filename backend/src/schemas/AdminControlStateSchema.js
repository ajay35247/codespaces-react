import mongoose from 'mongoose';

const AdminControlStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedFromIp: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('AdminControlState', AdminControlStateSchema);
