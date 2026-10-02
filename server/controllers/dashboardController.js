const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Bill = require('../models/Bill');
const Reminder = require('../models/Reminder');
const { attachPaymentSummaries } = require('../utils/paymentSummary');
const { syncVehicleAndBillReminders } = require('./reminderController');

// @desc    Get comprehensive dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7Days = new Date(startOfToday);
    in7Days.setDate(in7Days.getDate() + 7);

    // Sync reminders in background
    syncVehicleAndBillReminders().catch(e => console.error('Dashboard reminder sync err:', e.message));

    const [
      totalCustomers,
      totalVehicles,
      todaysServices,
      thisMonthsServices,
      allBills,
      urgentRemindersCount,
      recentServices,
      recentBills
    ] = await Promise.all([
      Customer.countDocuments(),
      Vehicle.countDocuments(),
      Service.countDocuments({
        serviceDate: { $gte: startOfToday, $lt: startOfTomorrow }
      }),
      Service.countDocuments({
        serviceDate: { $gte: startOfMonth }
      }),
      Bill.find().populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber brand model'),
      Reminder.countDocuments({
        status: 'Pending',
        dueDate: { $lte: in7Days }
      }),
      Service.find()
        .populate('customer', 'name mobile')
        .populate('vehicle', 'vehicleNumber brand model')
        .sort({ serviceDate: -1, createdAt: -1 })
        .limit(5),
      Bill.find()
        .populate('customer', 'name mobile')
        .populate('vehicle', 'vehicleNumber brand model')
        .sort({ date: -1, createdAt: -1 })
        .limit(6)
    ]);

    const summaries = await attachPaymentSummaries(allBills);
    const totalOutstanding = summaries.reduce((acc, b) => acc + (b.outstanding || 0), 0);
    const totalPaid = summaries.reduce((acc, b) => acc + (b.totalPaid || 0), 0);
    const totalRevenue = summaries.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
    const pendingBills = summaries.filter(b => b.outstanding > 0).length;

    const recentBillsWithSummaries = await attachPaymentSummaries(recentBills);

    res.json({
      totalCustomers,
      totalVehicles,
      todaysServices,
      thisMonthsServices,
      pendingBills,
      totalOutstanding,
      totalPaid,
      totalRevenue,
      urgentRemindersCount,
      recentServices,
      recentBills: recentBillsWithSummaries
    });
  } catch (error) {
    console.error('Failed to load dashboard statistics:', error.message);
    res.status(500).json({ message: 'Unable to load dashboard statistics' });
  }
};

// @desc    Export bills and revenue summary as CSV
// @route   GET /api/dashboard/export-report
// @access  Private
const exportReport = async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate('customer', 'name mobile')
      .populate('vehicle', 'vehicleNumber brand model')
      .sort({ date: -1, createdAt: -1 });

    const summaries = await attachPaymentSummaries(bills);

    const headers = [
      'Bill Number',
      'Date',
      'Customer Name',
      'Mobile',
      'Vehicle Number',
      'Vehicle Model',
      'Payment Method',
      'Total Amount (INR)',
      'Paid Amount (INR)',
      'Outstanding (INR)',
      'Status'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const rows = summaries.map(b => {
      const isPaid = (b.outstanding || 0) <= 0;
      const status = isPaid ? 'PAID IN FULL' : (b.totalPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
      const billDate = b.date ? new Date(b.date).toLocaleDateString('en-IN') : '';

      return [
        escapeCsv(b.billNumber),
        escapeCsv(billDate),
        escapeCsv(b.customer?.name || b.customerDetails?.name || ''),
        escapeCsv(b.customer?.mobile || b.customerDetails?.mobile || ''),
        escapeCsv(b.vehicle?.vehicleNumber || b.vehicleDetails?.vehicleNumber || ''),
        escapeCsv(`${b.vehicle?.brand || ''} ${b.vehicle?.model || ''}`.trim()),
        escapeCsv(b.paymentAccountDetails?.name || 'Standard'),
        b.totalAmount || 0,
        b.totalPaid || 0,
        b.outstanding || 0,
        escapeCsv(status)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="GarageCare_Billing_Report_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Failed to export report:', error.message);
    res.status(500).json({ message: 'Failed to export report' });
  }
};

module.exports = { getDashboardStats, exportReport };
