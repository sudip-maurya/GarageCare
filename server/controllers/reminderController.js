const mongoose = require('mongoose');
const Reminder = require('../models/Reminder');
const Vehicle = require('../models/Vehicle');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const PaymentAccount = require('../models/PaymentAccount');
const { attachPaymentSummaries } = require('../utils/paymentSummary');
const { getPagination, paginatedResponse } = require('../utils/pagination');

let lastSyncTimestamp = 0;
const SYNC_THROTTLE_MS = 60 * 1000; // Throttle auto-sync to at most once per 60s

// Helper: Sync vehicle and bill dates into Reminder documents
const syncVehicleAndBillReminders = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < SYNC_THROTTLE_MS) {
    return;
  }
  lastSyncTimestamp = now;

  try {
    // 1. Scan vehicles with dates
    const vehicles = await Vehicle.find({ customer: { $ne: null } }).populate('customer');

    for (const vehicle of vehicles) {
      if (!vehicle.customer) continue;

      // Next Service Date
      if (vehicle.nextServiceDate) {
        await Reminder.updateOne(
          {
            vehicle: vehicle._id,
            type: 'Service',
            dueDate: vehicle.nextServiceDate
          },
          {
            $set: {
              customer: vehicle.customer._id,
              'metadata.currentKm': vehicle.currentKm,
              'metadata.nextOilChangeKm': vehicle.nextOilChangeKm
            },
            $setOnInsert: {
              status: 'Pending'
            }
          },
          { upsert: true }
        );

        // Auto-supersede previous Pending reminders when due date changes
        await Reminder.updateMany(
          {
            vehicle: vehicle._id,
            type: 'Service',
            dueDate: { $ne: vehicle.nextServiceDate },
            status: 'Pending'
          },
          {
            $set: {
              status: 'Dismissed',
              dismissedReason: 'Superseded by new due date',
              updatedAt: new Date()
            }
          }
        );
      }

      // Insurance Expiry Date
      if (vehicle.insuranceExpiryDate) {
        await Reminder.updateOne(
          {
            vehicle: vehicle._id,
            type: 'Insurance',
            dueDate: vehicle.insuranceExpiryDate
          },
          {
            $set: {
              customer: vehicle.customer._id
            },
            $setOnInsert: {
              status: 'Pending'
            }
          },
          { upsert: true }
        );

        // Auto-supersede previous Pending reminders when due date changes
        await Reminder.updateMany(
          {
            vehicle: vehicle._id,
            type: 'Insurance',
            dueDate: { $ne: vehicle.insuranceExpiryDate },
            status: 'Pending'
          },
          {
            $set: {
              status: 'Dismissed',
              dismissedReason: 'Superseded by new due date',
              updatedAt: new Date()
            }
          }
        );
      }

      // PUC Expiry Date
      if (vehicle.pucExpiryDate) {
        await Reminder.updateOne(
          {
            vehicle: vehicle._id,
            type: 'PUC',
            dueDate: vehicle.pucExpiryDate
          },
          {
            $set: {
              customer: vehicle.customer._id
            },
            $setOnInsert: {
              status: 'Pending'
            }
          },
          { upsert: true }
        );

        // Auto-supersede previous Pending reminders when due date changes
        await Reminder.updateMany(
          {
            vehicle: vehicle._id,
            type: 'PUC',
            dueDate: { $ne: vehicle.pucExpiryDate },
            status: 'Pending'
          },
          {
            $set: {
              status: 'Dismissed',
              dismissedReason: 'Superseded by new due date',
              updatedAt: new Date()
            }
          }
        );
      }
    }

    // 2. Scan unpaid/partially paid bills
    const allBills = await Bill.find().populate('customer').populate('vehicle').populate('paymentAccount');
    const summaries = await attachPaymentSummaries(allBills);

    for (const bill of summaries) {
      const customerId = bill.customer?._id || bill.customer;
      const vehicleId = bill.vehicle?._id || bill.vehicle;

      if (bill.outstanding && bill.outstanding > 0 && customerId && vehicleId) {
        await Reminder.updateOne(
          {
            'metadata.billId': bill._id,
            type: 'Payment'
          },
          {
            $set: {
              customer: customerId,
              vehicle: vehicleId,
              'metadata.billNumber': bill.billNumber,
              'metadata.totalAmount': bill.totalAmount,
              'metadata.outstanding': bill.outstanding,
              'metadata.upiId': bill.paymentAccountDetails?.upiId || bill.paymentAccount?.upiId || '',
              'metadata.accountName': bill.paymentAccountDetails?.name || bill.paymentAccount?.name || ''
            },
            $setOnInsert: {
              dueDate: bill.date || bill.createdAt || new Date(),
              status: 'Pending'
            }
          },
          { upsert: true }
        );

        // If previously auto-dismissed because it was fully paid, but now has outstanding > 0 again, reactivate
        await Reminder.updateMany(
          {
            'metadata.billId': bill._id,
            type: 'Payment',
            status: 'Dismissed',
            dismissedReason: 'Bill fully paid'
          },
          {
            $set: {
              status: 'Pending',
              dismissedReason: '',
              updatedAt: new Date()
            }
          }
        );
      } else if (bill.outstanding <= 0) {
        // Auto-dismiss pending payment reminder when bill is fully paid
        await Reminder.updateMany(
          { 'metadata.billId': bill._id, type: 'Payment', status: 'Pending' },
          {
            $set: {
              status: 'Dismissed',
              dismissedReason: 'Bill fully paid',
              updatedAt: new Date()
            }
          }
        );
      }
    }
  } catch (err) {
    console.error('syncVehicleAndBillReminders:', err.message);
  }
};

// @desc    Sync reminders from vehicle dates and bills
// @route   POST /api/reminders/sync
// @access  Private
const syncReminders = async (req, res) => {
  try {
    await syncVehicleAndBillReminders(true);
    res.json({ message: 'Reminders successfully synced from vehicles and bills' });
  } catch (error) {
    console.error('syncReminders:', error.message);
    res.status(500).json({ message: 'Failed to sync reminders' });
  }
};

// @desc    Get all reminders with filtering
// @route   GET /api/reminders
// @access  Private
const getReminders = async (req, res) => {
  try {
    // Run sync so reminders reflect any recent vehicle/service/bill edits
    await syncVehicleAndBillReminders();

    const { type, status, timeframe, search } = req.query;
    const filter = {};

    if (type && type !== 'All') {
      filter.type = new RegExp(`^${type}$`, 'i');
    }

    if (status === 'All') {
      filter.status = { $in: ['Pending', 'Sent'] };
    } else if (status) {
      filter.status = status;
    } else {
      // Default to Pending only
      filter.status = 'Pending';
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    if (timeframe === 'overdue') {
      filter.dueDate = { $lt: startOfToday };
    } else if (timeframe === 'today') {
      filter.dueDate = { $gte: startOfToday, $lt: startOfTomorrow };
    } else if (timeframe === 'upcoming7') {
      const in7Days = new Date(startOfToday);
      in7Days.setDate(in7Days.getDate() + 7);
      filter.dueDate = { $gte: startOfToday, $lte: in7Days };
    } else if (timeframe === 'upcoming30') {
      const in30Days = new Date(startOfToday);
      in30Days.setDate(in30Days.getDate() + 30);
      filter.dueDate = { $gte: startOfToday, $lte: in30Days };
    }

    let reminders = await Reminder.find(filter)
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model vehicleType')
      .sort({ dueDate: 1 });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      reminders = reminders.filter(r => {
        const vNum = r.vehicle?.vehicleNumber?.toLowerCase() || '';
        const cName = r.customer?.name?.toLowerCase() || '';
        const cMobile = r.customer?.mobile?.toLowerCase() || '';
        return vNum.includes(q) || cName.includes(q) || cMobile.includes(q);
      });
    }

    const { isPaginated, page, limit, skip } = getPagination(req);
    if (isPaginated) {
      const total = reminders.length;
      const paginatedData = reminders.slice(skip, skip + limit);
      return res.json(paginatedResponse({ data: paginatedData, total, page, limit }));
    }

    res.json(reminders);
  } catch (error) {
    console.error('getReminders:', error.message);
    res.status(500).json({ message: 'Failed to fetch reminders' });
  }
};

// @desc    Get reminder statistics
// @route   GET /api/reminders/stats
// @access  Private
const getReminderStats = async (req, res) => {
  try {
    await syncVehicleAndBillReminders();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const in7Days = new Date(startOfToday);
    in7Days.setDate(in7Days.getDate() + 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [overdueCount, todayCount, dueWeekCount, totalActive, sentThisMonth] = await Promise.all([
      Reminder.countDocuments({
        status: 'Pending',
        dueDate: { $lt: startOfToday }
      }),
      Reminder.countDocuments({
        status: 'Pending',
        dueDate: { $gte: startOfToday, $lt: startOfTomorrow }
      }),
      Reminder.countDocuments({
        status: 'Pending',
        dueDate: { $gte: startOfToday, $lte: in7Days }
      }),
      Reminder.countDocuments({
        status: 'Pending'
      }),
      Reminder.countDocuments({
        status: 'Sent',
        lastSentAt: { $gte: startOfMonth }
      })
    ]);

    res.json({
      overdueCount,
      todayCount,
      dueWeekCount,
      totalActive,
      sentThisMonth
    });
  } catch (error) {
    console.error('getReminderStats:', error.message);
    res.status(500).json({ message: 'Failed to get reminder stats' });
  }
};

// @desc    Update reminder status (Sent, Dismissed, Completed)
// @route   PATCH /api/reminders/:id/status
// @access  Private
const updateReminderStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid reminder ID' });
  }

  try {
    const { status, notes } = req.body;
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({ message: 'Reminder not found' });
    }

    if (status) {
      reminder.status = status;
      if (status === 'Sent') {
        reminder.lastSentAt = new Date();
      }
    }

    if (notes !== undefined) {
      reminder.notes = notes;
    }

    await reminder.save();
    await reminder.populate('customer', 'name mobile');
    await reminder.populate('vehicle', 'vehicleNumber brand model vehicleType');

    res.json(reminder);
  } catch (error) {
    console.error('updateReminderStatus:', error.message);
    res.status(500).json({ message: 'Failed to update reminder' });
  }
};

module.exports = {
  syncReminders,
  getReminders,
  getReminderStats,
  updateReminderStatus,
  syncVehicleAndBillReminders
};
