const Payment = require('../models/Payment');
const Bill = require('../models/Bill');

const completedPaymentMatch = { status: 'Completed' };

const calculatePaymentState = (billTotal, totalPaid) => {
  const total = Number(billTotal) || 0;
  const paid = Math.min(Math.max(Number(totalPaid) || 0, 0), total);
  const outstanding = Math.max(total - paid, 0);
  const status = paid <= 0 ? 'Pending' : outstanding <= 0 ? 'Paid' : 'Partial';
  return { totalPaid: paid, outstanding, status, paymentStatus: status === 'Partial' ? 'Partially Paid' : status };
};

const getCompletedPaymentTotal = async (billId) => {
  const [result] = await Payment.aggregate([
    { $match: { bill: billId, ...completedPaymentMatch } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return result?.total || 0;
};

// Existing installations had a bill-level paidAmount but no transaction rows. Preserve it
// the first time that legacy bill is managed, so future recalculations have a complete ledger.
const ensureLegacyPayment = async (bill) => {
  const count = await Payment.countDocuments({ bill: bill._id });
  if (count === 0 && Number(bill.paidAmount) > 0) {
    await Payment.create({
      customer: bill.customer,
      bill: bill._id,
      amount: Math.min(Number(bill.paidAmount), Number(bill.totalAmount)),
      paymentDate: bill.date || bill.createdAt || new Date(),
      paymentMethod: 'Other',
      notes: 'Opening payment imported from the existing bill balance.'
    });
  }
};

const syncBillPaymentSummary = async (billId) => {
  const bill = await Bill.findById(billId);
  if (!bill) return null;
  const paid = await getCompletedPaymentTotal(bill._id);
  const state = calculatePaymentState(bill.totalAmount, paid);
  bill.paidAmount = state.totalPaid;
  bill.status = state.status;
  await bill.save();
  return { bill, ...state };
};

const attachPaymentSummaries = async (bills) => {
  const billIds = bills.map(bill => bill._id);
  if (!billIds.length) return [];
  const totals = await Payment.aggregate([
    { $match: { bill: { $in: billIds }, ...completedPaymentMatch } },
    { $group: { _id: '$bill', totalPaid: { $sum: '$amount' } } }
  ]);
  const totalByBill = new Map(totals.map(item => [String(item._id), item.totalPaid]));

  return bills.map(source => {
    const bill = source.toObject ? source.toObject() : source;
    const paymentTotal = totalByBill.has(String(bill._id)) ? totalByBill.get(String(bill._id)) : Number(bill.paidAmount) || 0;
    const state = calculatePaymentState(bill.totalAmount, paymentTotal);
    return { ...bill, ...state, paidAmount: state.totalPaid, status: state.status };
  });
};

module.exports = { calculatePaymentState, getCompletedPaymentTotal, ensureLegacyPayment, syncBillPaymentSummary, attachPaymentSummaries };
