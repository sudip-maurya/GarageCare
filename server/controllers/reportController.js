const Vehicle = require('../models/Vehicle');
const Customer = require('../models/Customer');
const Service = require('../models/Service');
const Bill = require('../models/Bill');
const { attachPaymentSummaries } = require('../utils/paymentSummary');

const escapeCsv = (str) => {
  if (str === null || str === undefined) return '""';
  const val = String(str).replace(/"/g, '""');
  return `"${val}"`;
};

// Helper to determine status and days diff
const getInsuranceCategory = (expiryDate) => {
  if (!expiryDate) return { category: 'notRecorded', label: 'Not Recorded', diffDays: null };
  const exp = new Date(expiryDate);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const diffDays = Math.round((expDay - startOfToday) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { category: 'overdue', label: `Expired (${Math.abs(diffDays)}d ago)`, diffDays };
  } else if (diffDays <= 30) {
    return { category: 'in30Days', label: `Expiring in ${diffDays}d`, diffDays };
  } else if (diffDays <= 60) {
    return { category: 'in60Days', label: `Expiring in ${diffDays}d`, diffDays };
  } else {
    return { category: 'valid', label: 'Active & Valid', diffDays };
  }
};

// @desc    Get vehicles categorized by insurance status
// @route   GET /api/reports/insurance
// @access  Private
const getInsuranceReport = async (req, res) => {
  try {
    const { category, search } = req.query;
    let vehicles = await Vehicle.find()
      .populate('customer', 'name mobile address')
      .sort({ insuranceExpiryDate: 1 });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const result = vehicles.map(v => {
      const ins = getInsuranceCategory(v.insuranceExpiryDate);
      return {
        _id: v._id,
        vehicleNumber: v.vehicleNumber,
        vehicleType: v.vehicleType,
        brand: v.brand,
        model: v.model,
        currentKm: v.currentKm,
        customer: v.customer,
        insuranceExpiryDate: v.insuranceExpiryDate,
        insuranceCategory: ins.category,
        insuranceLabel: ins.label,
        diffDays: ins.diffDays
      };
    });

    let filtered = result;
    if (category && category !== 'All') {
      filtered = filtered.filter(item => item.insuranceCategory === category);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(item => {
        const vNum = item.vehicleNumber?.toLowerCase() || '';
        const cName = item.customer?.name?.toLowerCase() || '';
        const cMobile = item.customer?.mobile?.toLowerCase() || '';
        return vNum.includes(q) || cName.includes(q) || cMobile.includes(q);
      });
    }

    // Counts
    const counts = {
      total: result.length,
      overdue: result.filter(r => r.insuranceCategory === 'overdue').length,
      in30Days: result.filter(r => r.insuranceCategory === 'in30Days').length,
      in60Days: result.filter(r => r.insuranceCategory === 'in60Days').length,
      valid: result.filter(r => r.insuranceCategory === 'valid').length,
      notRecorded: result.filter(r => r.insuranceCategory === 'notRecorded').length
    };

    res.json({ counts, vehicles: filtered });
  } catch (error) {
    console.error('getInsuranceReport:', error.message);
    res.status(500).json({ message: 'Failed to generate insurance report' });
  }
};

// @desc    Get master combined report data
// @route   GET /api/reports/master
// @access  Private
const getMasterReportData = async (req, res) => {
  try {
    const [vehicles, services, allBills] = await Promise.all([
      Vehicle.find().populate('customer', 'name mobile'),
      Service.find().sort({ serviceDate: -1 }),
      Bill.find().populate('customer', 'name mobile').populate('vehicle', 'vehicleNumber')
    ]);

    const summaries = await attachPaymentSummaries(allBills);

    // Map latest service per vehicle
    const latestServiceMap = {};
    services.forEach(s => {
      const vId = s.vehicle?.toString();
      if (vId && !latestServiceMap[vId]) {
        latestServiceMap[vId] = s;
      }
    });

    // Map billing per vehicle
    const vehicleBillingMap = {};
    summaries.forEach(b => {
      const vId = b.vehicle?._id?.toString() || b.vehicle?.toString();
      if (vId) {
        if (!vehicleBillingMap[vId]) {
          vehicleBillingMap[vId] = { totalBilled: 0, totalPaid: 0, outstanding: 0 };
        }
        vehicleBillingMap[vId].totalBilled += (b.totalAmount || 0);
        vehicleBillingMap[vId].totalPaid += (b.totalPaid || 0);
        vehicleBillingMap[vId].outstanding += (b.outstanding || 0);
      }
    });

    const masterRecords = vehicles.map(v => {
      const vId = v._id.toString();
      const lastService = latestServiceMap[vId];
      const billing = vehicleBillingMap[vId] || { totalBilled: 0, totalPaid: 0, outstanding: 0 };
      const ins = getInsuranceCategory(v.insuranceExpiryDate);

      return {
        _id: v._id,
        vehicleNumber: v.vehicleNumber,
        vehicleType: v.vehicleType,
        brand: v.brand,
        model: v.model,
        currentKm: v.currentKm,
        customer: v.customer,
        insuranceExpiryDate: v.insuranceExpiryDate,
        insuranceStatus: ins.label,
        pucExpiryDate: v.pucExpiryDate,
        nextServiceDate: v.nextServiceDate,
        lastServiceDate: lastService?.serviceDate,
        lastServiceWork: lastService?.workPerformed,
        totalBilled: billing.totalBilled,
        totalPaid: billing.totalPaid,
        outstanding: billing.outstanding
      };
    });

    res.json(masterRecords);
  } catch (error) {
    console.error('getMasterReportData:', error.message);
    res.status(500).json({ message: 'Failed to fetch master report data' });
  }
};

// @desc    Export any report as CSV
// @route   GET /api/reports/export
// @access  Private
const exportCsvReport = async (req, res) => {
  try {
    const { type } = req.query;
    const dateStr = new Date().toISOString().slice(0, 10);
    let headers = [];
    let rows = [];
    let fileName = `GarageCare_Report_${dateStr}.csv`;

    switch (type) {
      case 'master': {
        fileName = `GarageCare_Master_Report_${dateStr}.csv`;
        headers = [
          'Customer Name',
          'Mobile',
          'Vehicle Number',
          'Type',
          'Brand & Model',
          'Current KM',
          'Insurance Expiry',
          'Insurance Status',
          'PUC Expiry',
          'Last Service Date',
          'Next Service Date',
          'Total Invoiced (INR)',
          'Total Paid (INR)',
          'Current Outstanding (INR)'
        ];

        const [vehicles, services, allBills] = await Promise.all([
          Vehicle.find().populate('customer', 'name mobile'),
          Service.find().sort({ serviceDate: -1 }),
          Bill.find()
        ]);
        const summaries = await attachPaymentSummaries(allBills);

        const latestServiceMap = {};
        services.forEach(s => {
          const vId = s.vehicle?.toString();
          if (vId && !latestServiceMap[vId]) latestServiceMap[vId] = s;
        });

        const billingMap = {};
        summaries.forEach(b => {
          const vId = b.vehicle?.toString();
          if (vId) {
            if (!billingMap[vId]) billingMap[vId] = { billed: 0, paid: 0, out: 0 };
            billingMap[vId].billed += (b.totalAmount || 0);
            billingMap[vId].paid += (b.totalPaid || 0);
            billingMap[vId].out += (b.outstanding || 0);
          }
        });

        rows = vehicles.map(v => {
          const vId = v._id.toString();
          const lastSrv = latestServiceMap[vId];
          const bill = billingMap[vId] || { billed: 0, paid: 0, out: 0 };
          const ins = getInsuranceCategory(v.insuranceExpiryDate);

          return [
            escapeCsv(v.customer?.name || ''),
            escapeCsv(v.customer?.mobile || ''),
            escapeCsv(v.vehicleNumber),
            escapeCsv(v.vehicleType),
            escapeCsv(`${v.brand || ''} ${v.model || ''}`.trim()),
            v.currentKm || 0,
            escapeCsv(v.insuranceExpiryDate ? new Date(v.insuranceExpiryDate).toLocaleDateString('en-IN') : 'N/A'),
            escapeCsv(ins.label),
            escapeCsv(v.pucExpiryDate ? new Date(v.pucExpiryDate).toLocaleDateString('en-IN') : 'N/A'),
            escapeCsv(lastSrv?.serviceDate ? new Date(lastSrv.serviceDate).toLocaleDateString('en-IN') : 'N/A'),
            escapeCsv(v.nextServiceDate ? new Date(v.nextServiceDate).toLocaleDateString('en-IN') : 'N/A'),
            bill.billed,
            bill.paid,
            bill.out
          ].join(',');
        });
        break;
      }

      case 'vehicles': {
        fileName = `GarageCare_Vehicles_Fleet_${dateStr}.csv`;
        headers = [
          'Vehicle Number',
          'Vehicle Type',
          'Brand',
          'Model',
          'Current KM',
          'Customer Name',
          'Mobile',
          'Insurance Expiry',
          'PUC Expiry',
          'Next Service Date'
        ];

        const vehicles = await Vehicle.find().populate('customer', 'name mobile');
        rows = vehicles.map(v => [
          escapeCsv(v.vehicleNumber),
          escapeCsv(v.vehicleType),
          escapeCsv(v.brand),
          escapeCsv(v.model),
          v.currentKm || 0,
          escapeCsv(v.customer?.name || ''),
          escapeCsv(v.customer?.mobile || ''),
          escapeCsv(v.insuranceExpiryDate ? new Date(v.insuranceExpiryDate).toLocaleDateString('en-IN') : 'N/A'),
          escapeCsv(v.pucExpiryDate ? new Date(v.pucExpiryDate).toLocaleDateString('en-IN') : 'N/A'),
          escapeCsv(v.nextServiceDate ? new Date(v.nextServiceDate).toLocaleDateString('en-IN') : 'N/A')
        ].join(','));
        break;
      }

      case 'services': {
        fileName = `GarageCare_Service_Logs_${dateStr}.csv`;
        headers = [
          'Service Date',
          'Vehicle Number',
          'Customer Name',
          'Mobile',
          'KM Reading',
          'Work Performed',
          'Parts Changed',
          'Oil Changed',
          'Service Amount (INR)'
        ];

        const services = await Service.find()
          .populate('customer', 'name mobile')
          .populate('vehicle', 'vehicleNumber')
          .sort({ serviceDate: -1 });

        rows = services.map(s => [
          escapeCsv(s.serviceDate ? new Date(s.serviceDate).toLocaleDateString('en-IN') : ''),
          escapeCsv(s.vehicle?.vehicleNumber || ''),
          escapeCsv(s.customer?.name || ''),
          escapeCsv(s.customer?.mobile || ''),
          s.vehicleKm || 0,
          escapeCsv(s.workPerformed || ''),
          escapeCsv(s.partsChanged || 'None'),
          escapeCsv(s.oilChanged ? 'Yes' : 'No'),
          s.serviceAmount || 0
        ].join(','));
        break;
      }

      case 'outstanding': {
        fileName = `GarageCare_Outstanding_Ledger_${dateStr}.csv`;
        headers = [
          'Customer Name',
          'Mobile',
          'Bill Number',
          'Bill Date',
          'Vehicle Number',
          'Total Amount (INR)',
          'Total Paid (INR)',
          'Outstanding Due (INR)',
          'Status'
        ];

        const bills = await Bill.find()
          .populate('customer', 'name mobile')
          .populate('vehicle', 'vehicleNumber')
          .sort({ date: -1 });
        const summaries = await attachPaymentSummaries(bills);
        const dueBills = summaries.filter(b => (b.outstanding || 0) > 0);

        rows = dueBills.map(b => [
          escapeCsv(b.customer?.name || ''),
          escapeCsv(b.customer?.mobile || ''),
          escapeCsv(b.billNumber),
          escapeCsv(b.date ? new Date(b.date).toLocaleDateString('en-IN') : ''),
          escapeCsv(b.vehicle?.vehicleNumber || ''),
          b.totalAmount || 0,
          b.totalPaid || 0,
          b.outstanding || 0,
          escapeCsv(b.totalPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID')
        ].join(','));
        break;
      }

      default: {
        // Default billing report
        fileName = `GarageCare_Billing_Report_${dateStr}.csv`;
        headers = [
          'Bill Number',
          'Date',
          'Customer Name',
          'Mobile',
          'Vehicle Number',
          'Total Amount (INR)',
          'Paid Amount (INR)',
          'Outstanding (INR)',
          'Status'
        ];

        const bills = await Bill.find()
          .populate('customer', 'name mobile')
          .populate('vehicle', 'vehicleNumber')
          .sort({ date: -1 });
        const summaries = await attachPaymentSummaries(bills);

        rows = summaries.map(b => {
          const isPaid = (b.outstanding || 0) <= 0;
          return [
            escapeCsv(b.billNumber),
            escapeCsv(b.date ? new Date(b.date).toLocaleDateString('en-IN') : ''),
            escapeCsv(b.customer?.name || ''),
            escapeCsv(b.customer?.mobile || ''),
            escapeCsv(b.vehicle?.vehicleNumber || ''),
            b.totalAmount || 0,
            b.totalPaid || 0,
            b.outstanding || 0,
            escapeCsv(isPaid ? 'PAID IN FULL' : (b.totalPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID'))
          ].join(',');
        });
      }
    }

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('exportCsvReport:', error.message);
    res.status(500).json({ message: 'Failed to export CSV report' });
  }
};

module.exports = {
  getInsuranceReport,
  getMasterReportData,
  exportCsvReport
};
