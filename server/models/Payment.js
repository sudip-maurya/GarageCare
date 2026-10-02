const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'],
    default: 'Cash'
  },
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Failed', 'Refunded'],
    default: 'Completed'
  },
  referenceNumber: { type: String, trim: true, maxlength: 100 },
  notes: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

paymentSchema.index({ bill: 1, paymentDate: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
