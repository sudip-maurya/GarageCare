const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PaymentAccount = require('../models/PaymentAccount');
const Settings = require('../models/Settings');
const Bill = require('../models/Bill');

const validPaymentTypes = ['Google Pay', 'PhonePe', 'Paytm', 'UPI', 'Bank Transfer', 'Other'];
const validId = value => mongoose.isValidObjectId(value);

// Helper to remove QR file from disk
const removeQrFile = (qrCodeUrl) => {
  if (!qrCodeUrl) return;
  try {
    const filename = path.basename(qrCodeUrl);
    const filePath = path.join(__dirname, '..', 'uploads', 'payment-qr', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to unlink QR file:', err.message);
  }
};

// Auto-migrate legacy QR from Settings if owner has 0 payment accounts
const ensureMigratedLegacyAccount = async (ownerId) => {
  const count = await PaymentAccount.countDocuments({ owner: ownerId });
  if (count === 0) {
    const settings = await Settings.findOne();
    if (settings && (settings.upiId || settings.paymentQrCode)) {
      await PaymentAccount.create({
        owner: ownerId,
        name: 'Primary UPI',
        paymentType: 'UPI',
        upiId: settings.upiId || '',
        qrCodeUrl: settings.paymentQrCode || '',
        instructions: settings.paymentInstructions || '',
        isActive: true,
        isDefault: true
      });
    }
  }
};

// @desc    Get all payment accounts for owner
// @route   GET /api/payment-accounts
// @access  Private
const getPaymentAccounts = async (req, res) => {
  try {
    const ownerId = req.owner._id;
    await ensureMigratedLegacyAccount(ownerId);

    const filter = { owner: ownerId };
    if (req.query.active === 'true') {
      filter.isActive = true;
    }

    const accounts = await PaymentAccount.find(filter).sort({ isDefault: -1, createdAt: 1 });
    res.json(accounts);
  } catch (error) {
    console.error('getPaymentAccounts:', error.message);
    res.status(500).json({ message: 'Unable to load payment accounts' });
  }
};

// @desc    Get single payment account
// @route   GET /api/payment-accounts/:id
// @access  Private
const getPaymentAccountById = async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid payment account ID' });
  }

  try {
    const account = await PaymentAccount.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!account) {
      return res.status(404).json({ message: 'Payment account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('getPaymentAccountById:', error.message);
    res.status(500).json({ message: 'Unable to load payment account' });
  }
};

// @desc    Create new payment account (max 4 per owner)
// @route   POST /api/payment-accounts
// @access  Private
const createPaymentAccount = async (req, res) => {
  try {
    const ownerId = req.owner._id;
    await ensureMigratedLegacyAccount(ownerId);

    const count = await PaymentAccount.countDocuments({ owner: ownerId });
    if (count >= 4) {
      if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
      return res.status(400).json({ message: 'Maximum 4 payment accounts allowed.' });
    }

    const name = String(req.body.name || '').trim();
    if (!name) {
      if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
      return res.status(400).json({ message: 'Payment account name is required.' });
    }

    const paymentType = req.body.paymentType || 'UPI';
    if (!validPaymentTypes.includes(paymentType)) {
      if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
      return res.status(400).json({ message: 'Invalid payment type.' });
    }

    let isDefault = req.body.isDefault === 'true' || req.body.isDefault === true || count === 0;
    const isActive = req.body.isActive === undefined ? true : (req.body.isActive === 'true' || req.body.isActive === true);

    if (isDefault) {
      await PaymentAccount.updateMany({ owner: ownerId }, { isDefault: false });
    }

    let bankDetails = {};
    if (req.body.bankDetails) {
      try {
        bankDetails = typeof req.body.bankDetails === 'string'
          ? JSON.parse(req.body.bankDetails)
          : req.body.bankDetails;
      } catch (e) {
        bankDetails = {};
      }
    }

    let qrCodeUrl = '';
    if (req.file) {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        qrCodeUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuffer.toString('base64')}`;
        fs.unlinkSync(req.file.path);
      } catch (_) {
        qrCodeUrl = `/uploads/payment-qr/${req.file.filename}`;
      }
    }

    const account = await PaymentAccount.create({
      owner: ownerId,
      name,
      paymentType,
      upiId: String(req.body.upiId || '').trim(),
      qrCodeUrl,
      instructions: String(req.body.instructions || '').trim(),
      bankDetails: {
        accountNumber: String(bankDetails.accountNumber || req.body.accountNumber || '').trim(),
        ifscCode: String(bankDetails.ifscCode || req.body.ifscCode || '').trim(),
        bankName: String(bankDetails.bankName || req.body.bankName || '').trim(),
        accountHolderName: String(bankDetails.accountHolderName || req.body.accountHolderName || '').trim()
      },
      isActive,
      isDefault
    });

    res.status(201).json(account);
  } catch (error) {
    if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
    console.error('createPaymentAccount:', error.message);
    res.status(500).json({ message: 'Unable to create payment account' });
  }
};

// @desc    Update payment account
// @route   PUT /api/payment-accounts/:id
// @access  Private
const updatePaymentAccount = async (req, res) => {
  if (!validId(req.params.id)) {
    if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
    return res.status(400).json({ message: 'Invalid payment account ID' });
  }

  try {
    const ownerId = req.owner._id;
    const account = await PaymentAccount.findOne({ _id: req.params.id, owner: ownerId });
    if (!account) {
      if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
      return res.status(404).json({ message: 'Payment account not found' });
    }

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
        return res.status(400).json({ message: 'Account name cannot be empty.' });
      }
      account.name = name;
    }

    if (req.body.paymentType !== undefined) {
      if (!validPaymentTypes.includes(req.body.paymentType)) {
        if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
        return res.status(400).json({ message: 'Invalid payment type.' });
      }
      account.paymentType = req.body.paymentType;
    }

    if (req.body.upiId !== undefined) {
      account.upiId = String(req.body.upiId).trim();
    }

    if (req.body.instructions !== undefined) {
      account.instructions = String(req.body.instructions).trim();
    }

    if (req.body.isActive !== undefined) {
      account.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    }

    if (req.body.isDefault !== undefined) {
      const wantDefault = req.body.isDefault === 'true' || req.body.isDefault === true;
      if (wantDefault) {
        await PaymentAccount.updateMany({ owner: ownerId, _id: { $ne: account._id } }, { isDefault: false });
        account.isDefault = true;
      } else {
        account.isDefault = false;
      }
    }

    let bankDetails = null;
    if (req.body.bankDetails) {
      try {
        bankDetails = typeof req.body.bankDetails === 'string'
          ? JSON.parse(req.body.bankDetails)
          : req.body.bankDetails;
      } catch (e) {
        bankDetails = null;
      }
    }

    if (bankDetails || req.body.accountNumber !== undefined) {
      account.bankDetails = {
        accountNumber: String(bankDetails?.accountNumber || req.body.accountNumber || account.bankDetails?.accountNumber || '').trim(),
        ifscCode: String(bankDetails?.ifscCode || req.body.ifscCode || account.bankDetails?.ifscCode || '').trim(),
        bankName: String(bankDetails?.bankName || req.body.bankName || account.bankDetails?.bankName || '').trim(),
        accountHolderName: String(bankDetails?.accountHolderName || req.body.accountHolderName || account.bankDetails?.accountHolderName || '').trim()
      };
    }

    // Handle new QR code file upload
    if (req.file) {
      if (account.qrCodeUrl) {
        removeQrFile(account.qrCodeUrl);
      }
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        account.qrCodeUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuffer.toString('base64')}`;
        fs.unlinkSync(req.file.path);
      } catch (_) {
        account.qrCodeUrl = `/uploads/payment-qr/${req.file.filename}`;
      }
      await Bill.updateMany(
        { paymentAccount: account._id },
        { $set: { 'paymentAccountDetails.qrCodeUrl': account.qrCodeUrl } }
      );
    } else if (req.body.removeQr === 'true' || req.body.removeQr === true) {
      if (account.qrCodeUrl) {
        removeQrFile(account.qrCodeUrl);
      }
      account.qrCodeUrl = '';
      await Bill.updateMany(
        { paymentAccount: account._id },
        { $set: { 'paymentAccountDetails.qrCodeUrl': '' } }
      );
    }

    await account.save();
    res.json(account);
  } catch (error) {
    if (req.file) removeQrFile(`/uploads/payment-qr/${req.file.filename}`);
    console.error('updatePaymentAccount:', error.message);
    res.status(500).json({ message: 'Unable to update payment account' });
  }
};

// @desc    Delete payment account
// @route   DELETE /api/payment-accounts/:id
// @access  Private
const deletePaymentAccount = async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid payment account ID' });
  }

  try {
    const ownerId = req.owner._id;
    const account = await PaymentAccount.findOne({ _id: req.params.id, owner: ownerId });
    if (!account) {
      return res.status(404).json({ message: 'Payment account not found' });
    }

    if (account.qrCodeUrl) {
      removeQrFile(account.qrCodeUrl);
    }

    const wasDefault = account.isDefault;
    await account.deleteOne();

    // If deleted account was default, promote the first active remaining account
    if (wasDefault) {
      const remaining = await PaymentAccount.findOne({ owner: ownerId, isActive: true });
      if (remaining) {
        remaining.isDefault = true;
        await remaining.save();
      }
    }

    res.json({ message: 'Payment account deleted successfully' });
  } catch (error) {
    console.error('deletePaymentAccount:', error.message);
    res.status(500).json({ message: 'Unable to delete payment account' });
  }
};

// @desc    Toggle payment account active/inactive
// @route   PATCH /api/payment-accounts/:id/status
// @access  Private
const togglePaymentAccountStatus = async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid payment account ID' });
  }

  try {
    const account = await PaymentAccount.findOne({ _id: req.params.id, owner: req.owner._id });
    if (!account) {
      return res.status(404).json({ message: 'Payment account not found' });
    }

    if (req.body.isActive !== undefined) {
      account.isActive = Boolean(req.body.isActive);
    } else {
      account.isActive = !account.isActive;
    }

    await account.save();
    res.json(account);
  } catch (error) {
    console.error('togglePaymentAccountStatus:', error.message);
    res.status(500).json({ message: 'Unable to change status' });
  }
};

// @desc    Set payment account as default
// @route   PATCH /api/payment-accounts/:id/default
// @access  Private
const setDefaultPaymentAccount = async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid payment account ID' });
  }

  try {
    const ownerId = req.owner._id;
    const account = await PaymentAccount.findOne({ _id: req.params.id, owner: ownerId });
    if (!account) {
      return res.status(404).json({ message: 'Payment account not found' });
    }

    await PaymentAccount.updateMany({ owner: ownerId }, { isDefault: false });
    account.isDefault = true;
    account.isActive = true; // A default account should be active
    await account.save();

    res.json(account);
  } catch (error) {
    console.error('setDefaultPaymentAccount:', error.message);
    res.status(500).json({ message: 'Unable to set default account' });
  }
};

module.exports = {
  getPaymentAccounts,
  getPaymentAccountById,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  togglePaymentAccountStatus,
  setDefaultPaymentAccount
};
