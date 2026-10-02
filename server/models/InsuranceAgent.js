const mongoose = require('mongoose');

const insuranceAgentSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 25
  },
  whatsapp: {
    type: String,
    trim: true,
    maxlength: 25,
    default: ''
  },
  companyName: {
    type: String,
    trim: true,
    maxlength: 150,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 254,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('InsuranceAgent', insuranceAgentSchema);
