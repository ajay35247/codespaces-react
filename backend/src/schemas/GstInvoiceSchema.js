import mongoose from 'mongoose';

const GstInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    loadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', index: true },
    shipper: { type: String, required: true, trim: true },
    shipperGstin: { type: String, trim: true },
    date: { type: Date, required: true, default: Date.now },
    value: { type: Number, required: true, min: 0 },
    cgst: { type: Number, required: true, default: 0, min: 0 },
    sgst: { type: Number, required: true, default: 0, min: 0 },
    igst: { type: Number, required: true, default: 0, min: 0 },
    hsn: { type: String, trim: true, default: '9965' },
    status: {
      type: String,
      enum: ['draft', 'issued', 'paid', 'cancelled'],
      default: 'draft',
    },
    finalized: { type: Boolean, default: false },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('GstInvoice', GstInvoiceSchema);
