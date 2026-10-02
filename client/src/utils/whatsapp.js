export const formatPaymentMethodText = (bill) => {
  const account = bill.paymentAccountDetails || bill.paymentAccount;
  if (!account || !account.name) return [];

  const lines = ['Payment can be made using:', account.name];
  if (account.upiId) {
    lines.push(`UPI: ${account.upiId}`);
  }
  if (account.paymentType === 'Bank Transfer' && account.bankDetails?.accountNumber) {
    lines.push(`Bank A/C: ${account.bankDetails.accountNumber} | IFSC: ${account.bankDetails.ifscCode || 'N/A'}`);
  }
  return lines;
};

const resolveGarageName = (passedName, billSnapshotName) => {
  if (passedName && typeof passedName === 'string' && passedName.trim() && passedName.trim() !== 'My Garage' && passedName.trim() !== 'GarageCare') {
    return passedName.trim();
  }
  if (
    billSnapshotName &&
    typeof billSnapshotName === 'string' &&
    billSnapshotName.trim() &&
    billSnapshotName.trim() !== 'My Garage' &&
    billSnapshotName.trim() !== 'GarageCare'
  ) {
    return billSnapshotName.trim();
  }
  return passedName?.trim() || billSnapshotName?.trim() || 'Maurya Automobiles';
};

const resolveGaragePhone = (passedPhone, billSnapshotContact) => {
  let candidate = (passedPhone !== undefined && passedPhone !== null && String(passedPhone).trim())
    ? String(passedPhone).trim()
    : (billSnapshotContact !== undefined && billSnapshotContact !== null && String(billSnapshotContact).trim()
      ? String(billSnapshotContact).trim()
      : '9619966132');

  // If candidate contains the old contact number 7021871795, override to 9619966132
  if (candidate.includes('7021871795')) {
    candidate = '9619966132';
  }

  const digits = candidate.replace(/\D/g, '');
  if (candidate === 'N/A' || candidate.toLowerCase() === 'null' || candidate.toLowerCase() === 'undefined' || digits.length < 10) {
    return '9619966132';
  }
  return candidate;
};

const buildSignature = (garageName, garagePhone) => {
  const nameUpper = (garageName || 'My Garage').toUpperCase();
  const phone = (garagePhone && String(garagePhone).trim()) ? String(garagePhone).trim() : '';

  if (phone) {
    return ['—', `*${nameUpper}*`, `Phone: ${phone}`];
  }
  return ['—', `*${nameUpper}*`];
};

export const getWhatsAppUrl = (bill, garageNameParam, garagePhoneParam) => {
  const customerName = bill.customerDetails?.name || bill.customer?.name || 'Customer';
  const mobile = bill.customerDetails?.mobile || bill.customer?.mobile;

  if (!mobile) {
    return { error: 'No mobile number found for this customer.' };
  }

  const digits = String(mobile).replace(/\D/g, '');
  const phoneNumber = digits.length === 10 ? `91${digits}` : digits;

  if (phoneNumber.length < 10) {
    return { error: 'The customer mobile number is not valid for WhatsApp.' };
  }

  const vehicleNumber = bill.vehicleDetails?.vehicleNumber || bill.vehicle?.vehicleNumber || 'N/A';
  const garageName = resolveGarageName(garageNameParam, bill.garageDetails?.name);
  const garagePhone = resolveGaragePhone(garagePhoneParam, bill.garageDetails?.contact);
  const sig = buildSignature(garageName, garagePhone);

  const totalAmount = Number(bill.totalAmount) || 0;
  const paidAmount = Number(bill.totalPaid !== undefined ? bill.totalPaid : bill.paidAmount) || 0;
  const outstanding = Number(bill.outstanding !== undefined ? bill.outstanding : Math.max(totalAmount - paidAmount, 0));
  const isFullyPaid = (paidAmount >= totalAmount && totalAmount > 0) || (outstanding <= 0 && totalAmount > 0);

  let messageLines;

  if (isFullyPaid) {
    messageLines = [
      `Namaste ${customerName}, *Payment mil gaya!*`,
      `*${garageName}* ko chunne ke liye dhanyavaad.`,
      `*Bill No:* ${bill.billNumber} | *Gaadi:* ${vehicleNumber}`,
      `*Amount:* ₹${totalAmount.toLocaleString('en-IN')} — *PAID IN FULL*`,
      ...sig
    ];
  } else {
    // Partially Paid or Unpaid
    const account = bill.paymentAccountDetails || bill.paymentAccount;
    const upiId = account?.upiId && account.upiId !== 'N/A' ? account.upiId.trim() : '';
    const accountName = account?.name || garageName;

    messageLines = [
      `Namaste ${customerName},`,
      `*${garageName} ka service bill*`,
      `*Bill No:* ${bill.billNumber} | *Gaadi:* ${vehicleNumber}`,
      `*Total:* ₹${totalAmount.toLocaleString('en-IN')}`,
      `*Paid:* ₹${paidAmount.toLocaleString('en-IN')}`,
      `*Baaki:* *₹${outstanding.toLocaleString('en-IN')}*`,
      ...(upiId ? [`UPI se pay karein: ${upiId} (${accountName})`] : []),
      ...sig
    ];
  }

  return { url: `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageLines.join('\n'))}` };
};

export const getPaymentReminderWhatsAppUrl = (bill, garageNameParam, garagePhoneParam) => {
  const customerName = bill.customerDetails?.name || bill.customer?.name || 'Customer';
  const mobile = bill.customerDetails?.mobile || bill.customer?.mobile;

  if (!mobile) {
    return { error: 'No mobile number found for this customer.' };
  }

  const digits = String(mobile).replace(/\D/g, '');
  const phoneNumber = digits.length === 10 ? `91${digits}` : digits;

  if (phoneNumber.length < 10) {
    return { error: 'The customer mobile number is not valid for WhatsApp.' };
  }

  const garageName = resolveGarageName(garageNameParam, bill.garageDetails?.name);
  const garagePhone = resolveGaragePhone(garagePhoneParam, bill.garageDetails?.contact);
  const sig = buildSignature(garageName, garagePhone);

  const totalAmount = Number(bill.totalAmount) || 0;
  const paidAmount = Number(bill.totalPaid !== undefined ? bill.totalPaid : bill.paidAmount) || 0;
  const outstanding = Number(bill.outstanding !== undefined ? bill.outstanding : Math.max(totalAmount - paidAmount, 0));
  const account = bill.paymentAccountDetails || bill.paymentAccount;
  const upiId = account?.upiId && account.upiId !== 'N/A' ? account.upiId.trim() : '';
  const accountName = account?.name || garageName;

  const messageLines = [
    `Namaste ${customerName},`,
    `Aapke bill #${bill.billNumber} ka *₹${outstanding.toLocaleString('en-IN')}* baaki hai.`,
    `Bill Total: ₹${totalAmount.toLocaleString('en-IN')} | Paid: ₹${paidAmount.toLocaleString('en-IN')}`,
    ...(upiId ? [`UPI: ${upiId} (${accountName})`] : []),
    'Jaldi payment kar dein. Dhanyavaad!',
    ...sig
  ];

  return { url: `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageLines.join('\n'))}` };
};

export const getReminderWhatsAppUrl = (reminder, garageName = 'My Garage', garagePhoneParam) => {
  const customerName = reminder.customer?.name || 'Customer';
  const mobile = reminder.customer?.mobile;

  if (!mobile) {
    return { error: 'No mobile number found for this customer.' };
  }

  const digits = String(mobile).replace(/\D/g, '');
  const phoneNumber = digits.length === 10 ? `91${digits}` : digits;

  if (phoneNumber.length < 10) {
    return { error: 'The customer mobile number is not valid for WhatsApp.' };
  }

  const garagePhone = resolveGaragePhone(garagePhoneParam || reminder.garageContact || reminder.garagePhone || reminder.phone);
  const sig = buildSignature(garageName, garagePhone);

  const vehicleNumber = reminder.vehicle?.vehicleNumber || 'N/A';
  const vehicleDesc = [reminder.vehicle?.brand, reminder.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle';
  const dueDateStr = reminder.dueDate ? new Date(reminder.dueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : 'soon';

  let messageLines;

  switch (reminder.type) {
    case 'Service':
      messageLines = [
        `Namaste ${customerName},`,
        `*${garageName}* se reminder`,
        `Aapki gaadi *${vehicleDesc} (${vehicleNumber})* ki periodic service *${dueDateStr}* ko due hai.`,
        'Slot book karne ke liye reply karein.',
        ...sig
      ];
      break;

    case 'Insurance':
      messageLines = [
        `Namaste ${customerName},`,
        `*${garageName}* — zaroori reminder`,
        `Aapki gaadi *${vehicleNumber}* ka motor insurance *${dueDateStr}* ko expire ho raha hai.`,
        'Time par renew karayein — challan se bachein aur No-Claim Bonus (NCB) bhi bacha rahega.',
        'Slot book karne ke liye reply karein.',
        ...sig
      ];
      break;

    case 'PUC':
      messageLines = [
        `Namaste ${customerName},`,
        `*${garageName}* se reminder`,
        `Aapki gaadi *${vehicleNumber}* ka PUC certificate *${dueDateStr}* ko expire ho raha hai.`,
        'Due date se pehle renew karayein taaki challan na lage.',
        ...sig
      ];
      break;

    case 'Payment': {
      const outstanding = reminder.metadata?.outstanding ? Number(reminder.metadata.outstanding).toLocaleString('en-IN') : '0';
      const billNum = reminder.metadata?.billNumber || 'N/A';
      const rawUpi = reminder.metadata?.upiId || reminder.upiId;
      const upiId = rawUpi && rawUpi !== 'N/A' ? String(rawUpi).trim() : '';
      const accountName = reminder.metadata?.accountName || reminder.accountName || garageName;
      messageLines = [
        `Namaste ${customerName},`,
        `*${garageName}* — payment reminder`,
        `*Bill #${billNum}* (${vehicleNumber}) me *₹${outstanding}* baaki hai.`,
        ...(upiId ? [`UPI se pay karein: ${upiId} (${accountName})`] : []),
        'Dhanyavaad!',
        ...sig
      ];
      break;
    }

    default:
      messageLines = [
        `Namaste ${customerName},`,
        `*${garageName}* se reminder`,
        `Aapki gaadi *${vehicleNumber}* scheduled on *${dueDateStr}*.`,
        ...sig
      ];
  }

  return { url: `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageLines.join('\n'))}` };
};
