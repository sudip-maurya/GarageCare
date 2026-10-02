const Bill = require('../models/Bill');
const Service = require('../models/Service');

/**
 * Extracts a readable work summary from bill items.
 */
const getWorkSummaryFromItems = (items) => {
  if (Array.isArray(items) && items.length > 0) {
    const descriptions = items
      .map(i => i.description || i.itemDescription)
      .filter(Boolean);
    if (descriptions.length > 0) {
      return descriptions.join(', ');
    }
  }
  return 'Service';
};

/**
 * Synchronizes or creates a corresponding Service record for a given Bill.
 */
const syncServiceForBill = async (bill) => {
  if (!bill || !bill.vehicle || !bill.customer) return null;

  const billDate = bill.date || bill.createdAt || new Date();
  const workSummary = getWorkSummaryFromItems(bill.items);

  if (bill.service) {
    let serviceDoc = await Service.findById(bill.service);
    if (serviceDoc) {
      serviceDoc.serviceDate = billDate;
      serviceDoc.serviceAmount = bill.totalAmount;
      serviceDoc.vehicle = bill.vehicle;
      serviceDoc.customer = bill.customer;
      if (!serviceDoc.workPerformed || serviceDoc.workPerformed.trim() === '') {
        serviceDoc.workPerformed = workSummary;
      }
      await serviceDoc.save();
      return serviceDoc;
    }
  }

  // Check if an unlinked service already exists for this vehicle
  const existingService = await Service.findOne({
    vehicle: bill.vehicle,
    customer: bill.customer,
    _id: { $nin: await Bill.distinct('service', { service: { $ne: null } }) }
  });

  if (existingService) {
    existingService.serviceDate = billDate;
    existingService.serviceAmount = bill.totalAmount;
    if (!existingService.workPerformed || existingService.workPerformed.trim() === '') {
      existingService.workPerformed = workSummary;
    }
    await existingService.save();
    bill.service = existingService._id;
    await bill.save();
    return existingService;
  }

  // Auto-create service record for this bill
  const newService = await Service.create({
    vehicle: bill.vehicle,
    customer: bill.customer,
    serviceDate: billDate,
    serviceAmount: bill.totalAmount,
    workPerformed: workSummary,
    notes: `Bill #${bill.billNumber}`
  });

  bill.service = newService._id;
  await bill.save();
  return newService;
};

/**
 * Removes the corresponding Service record when a bill is deleted,
 * provided no other bills are linked to that service.
 */
const removeServiceForDeletedBill = async (bill) => {
  if (!bill || !bill.service) return;

  const otherBillsCount = await Bill.countDocuments({
    service: bill.service,
    _id: { $ne: bill._id }
  });

  if (otherBillsCount === 0) {
    await Service.deleteOne({ _id: bill.service });
  }
};

/**
 * Full sync across all bills and services to guarantee consistency.
 */
const syncBillsAndServices = async () => {
  try {
    const bills = await Bill.find();
    for (const bill of bills) {
      await syncServiceForBill(bill);
    }
  } catch (err) {
    console.error('syncBillsAndServices error:', err.message);
  }
};

module.exports = {
  syncBillsAndServices,
  syncServiceForBill,
  removeServiceForDeletedBill,
  getWorkSummaryFromItems
};
