import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, RefreshCw, Wallet, ChevronDown, Receipt } from 'lucide-react';

const PaymentModal = ({ bill, show, onClose, onPaymentUpdated }) => {
  const [payments, setPayments] = useState([]);
  const [currentBill, setCurrentBill] = useState(bill);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHistory, setShowHistory] = useState(true);

  // New payment form state
  const [formData, setFormData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: ''
  });

  // Edit payment state
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    amount: '',
    paymentDate: '',
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: ''
  });

  const fetchPaymentHistory = async () => {
    if (!bill?._id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/payments/bill/${bill._id}`);
      setPayments(data.payments || []);
      if (data.bill) {
        setCurrentBill(data.bill);
      }
    } catch (err) {
      console.error('Error fetching payments', err);
      setError(err.response?.data?.message || 'Unable to load payment history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && bill?._id) {
      setCurrentBill(bill);
      fetchPaymentHistory();
      setFormData({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
        referenceNumber: '',
        notes: ''
      });
      setError('');
      setSuccess('');
      setEditingPaymentId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, bill?._id]);

  const handleAddPayment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const amount = Number(formData.amount);
    const outstanding = currentBill.outstanding !== undefined 
      ? currentBill.outstanding 
      : Math.max(currentBill.totalAmount - (currentBill.paidAmount || 0), 0);

    if (!amount || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (amount > outstanding + 0.0001) {
      setError(`Payment amount cannot exceed the outstanding balance of ₹${outstanding.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        billId: currentBill._id,
        customerId: currentBill.customer?._id || currentBill.customer,
        amount,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber,
        notes: formData.notes
      };

      const { data } = await api.post('/payments', payload);
      setSuccess('Payment recorded successfully.');
      setFormData({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
        referenceNumber: '',
        notes: ''
      });

      if (data.bill) {
        setCurrentBill(data.bill);
      }
      await fetchPaymentHistory();
      if (onPaymentUpdated) {
        onPaymentUpdated(data.bill);
      }
    } catch (err) {
      console.error('Error adding payment', err);
      setError(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (payment) => {
    setEditingPaymentId(payment._id);
    setEditFormData({
      amount: payment.amount,
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : '',
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber || '',
      notes: payment.notes || ''
    });
    setError('');
    setSuccess('');
  };

  const handleCancelEdit = () => {
    setEditingPaymentId(null);
  };

  const handleSaveEdit = async (paymentId) => {
    setError('');
    setSuccess('');
    const amount = Number(editFormData.amount);
    if (!amount || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    const billTotal = Number(currentBill?.totalAmount || 0);
    const otherCompleted = payments
      .filter((p) => String(p._id) !== String(paymentId) && (p.status === 'Completed' || !p.status))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (otherCompleted + amount > billTotal + 0.0001) {
      const maxAllowed = Math.max(billTotal - otherCompleted, 0);
      setError(`Payment amount exceeds bill total. Maximum allowed is ₹${maxAllowed.toFixed(2)}.`);
      return;
    }

    try {
      const { data } = await api.put(`/payments/${paymentId}`, editFormData);
      setSuccess('Payment updated successfully.');
      setEditingPaymentId(null);
      if (data.bill) {
        setCurrentBill(data.bill);
      }
      await fetchPaymentHistory();
      if (onPaymentUpdated) {
        onPaymentUpdated(data.bill);
      }
    } catch (err) {
      console.error('Error updating payment', err);
      setError(err.response?.data?.message || 'Failed to update payment.');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment record? This will recalculate the bill outstanding amount.')) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      const { data } = await api.delete(`/payments/${paymentId}`);
      setSuccess('Payment deleted successfully.');
      if (data.bill) {
        setCurrentBill(data.bill);
      }
      await fetchPaymentHistory();
      if (onPaymentUpdated) {
        onPaymentUpdated(data.bill);
      }
    } catch (err) {
      console.error('Error deleting payment', err);
      setError(err.response?.data?.message || 'Failed to delete payment.');
    }
  };

  if (!show || !currentBill) return null;

  const totalAmount = Number(currentBill.totalAmount) || 0;
  const totalPaid = Number(currentBill.totalPaid !== undefined ? currentBill.totalPaid : currentBill.paidAmount) || 0;
  const outstanding = Number(currentBill.outstanding !== undefined ? currentBill.outstanding : Math.max(totalAmount - totalPaid, 0));
  const isFullyPaid = outstanding <= 0 && totalAmount > 0;
  const status = isFullyPaid ? 'PAID IN FULL' : (currentBill.paymentStatus === 'Partially Paid' || (totalPaid > 0 && outstanding > 0) ? 'Partially Paid' : (currentBill.paymentStatus || 'Pending'));

  return (
    <>
      <style>{`
        .pm-backdrop { background: rgba(15, 27, 51, 0.55); backdrop-filter: blur(4px); }
        .pm-modal { border: none; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(15, 27, 51, 0.28); }
        .pm-title { color: #0f1b33; font-weight: 700; letter-spacing: -0.02em; font-size: 1.15rem; }
        .pm-subtitle { color: #64748b; font-size: 0.8rem; font-weight: 500; }
        .pm-section { background: #f0f5ff; border-radius: 16px; border: 1px solid #e3ecfb; }
        .pm-stat-label { color: #64748b; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
        .pm-stat-value { color: #0f1b33; font-weight: 700; font-size: 1.05rem; margin-bottom: 0; letter-spacing: -0.01em; }
        .pm-input { border-radius: 10px; border: 1.5px solid #dbe4f3; background: #fff; color: #0f1b33; font-size: 0.875rem; padding: 0.5rem 0.75rem; transition: border-color .15s, box-shadow .15s; }
        .pm-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); outline: none; }
        .pm-label { color: #0f1b33; font-weight: 600; font-size: 0.78rem; margin-bottom: 0.35rem; }
        .pm-req { color: #ef4444; }
        .pm-btn-gradient { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); border: none; color: #fff; font-weight: 600; border-radius: 12px; padding: 0.55rem 1.4rem; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); transition: transform .15s, box-shadow .15s; }
        .pm-btn-gradient:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45); color: #fff; }
        .pm-btn-close { background: #f1f5f9; border: none; color: #0f1b33; font-weight: 600; border-radius: 10px; padding: 0.5rem 1.25rem; transition: background .15s; }
        .pm-btn-close:hover { background: #e2e8f0; color: #0f1b33; }
        .pm-history-card { border: 1px solid #e3ecfb; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 27, 51, 0.05); }
        .pm-history-header { background: #f0f5ff; cursor: pointer; user-select: none; transition: background .15s; }
        .pm-history-header:hover { background: #e6effd; }
        .pm-badge { font-size: 0.72rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 999px; letter-spacing: 0.03em; }
        .pm-badge-success { background: #dcfce7; color: #15803d; }
        .pm-badge-warn { background: #fef9c3; color: #a16207; }
        .pm-badge-danger { background: #fee2e2; color: #b91c1c; }
        .pm-method-badge { background: #eef2ff; color: #3730a3; font-weight: 600; font-size: 0.72rem; border-radius: 999px; padding: 0.25rem 0.65rem; }
        .pm-history-table th { color: #64748b; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; border-bottom: 1px solid #e3ecfb; }
        .pm-history-table td { color: #0f1b33; font-size: 0.85rem; }
        .pm-alert { border-radius: 12px; border: none; font-size: 0.875rem; }
        .pm-divider { height: 1px; background: linear-gradient(90deg, transparent, #dbe4f3, transparent); border: none; opacity: 1; }
        .pm-collapse-icon { transition: transform .2s ease; }
        .pm-collapse-icon.collapsed { transform: rotate(-90deg); }
        .pm-action-btn { border-radius: 8px; padding: 0.3rem 0.45rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
        .pm-actions-cell { white-space: nowrap; }
        .pm-actions { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; }
        .pm-actions .pm-action-btn { width: 36px; height: 36px; padding: 0; border-radius: 9px; flex-shrink: 0; transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
        .pm-actions .pm-act-edit:hover { filter: brightness(0.94); box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28); transform: translateY(-1px); }
        .pm-actions .pm-act-del:hover { filter: brightness(0.96); box-shadow: 0 2px 8px rgba(185, 28, 28, 0.25); transform: translateY(-1px); }
        .pm-actions .pm-act-save:hover { filter: brightness(0.94); box-shadow: 0 2px 8px rgba(21, 128, 61, 0.28); transform: translateY(-1px); }
        .pm-actions .pm-act-cancel:hover { filter: brightness(0.96); box-shadow: 0 2px 8px rgba(71, 85, 105, 0.25); transform: translateY(-1px); }
        .pm-history-card .table-responsive { overflow-x: auto; }
        .pm-history-table { min-width: 560px; }
      `}</style>
      <div className="modal show d-block pm-backdrop" tabIndex="-1">
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <div className="modal-content pm-modal">
            <div className="modal-header border-0 px-4 pt-4 pb-3">
              <div>
                <h5 className="modal-title pm-title d-flex align-items-center gap-2">
                  <span className="d-inline-flex align-items-center justify-content-center" style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' }}>
                    <Wallet size={18} color="#fff" />
                  </span>
                  Manage Payments — Bill #{currentBill.billNumber}
                </h5>
                <div className="pm-subtitle ms-5">Track payments, record new transactions, and review history</div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            <div className="modal-body px-4 pb-4">
              {/* Bill Payment Summary Card */}
              <div className="pm-section p-4 mb-4">
                <div className="d-flex align-items-center gap-2 mb-3">
                  <Receipt size={16} color="#2563eb" />
                  <span className="fw-bold" style={{ color: '#0f1b33', fontSize: '0.9rem' }}>Bill Summary</span>
                </div>
                <div className="row text-center gy-3">
                  <div className="col-6 col-md-3">
                    <div className="pm-stat-label">Bill Total</div>
                    <h5 className="pm-stat-value">₹{totalAmount.toLocaleString('en-IN')}</h5>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="pm-stat-label">{isFullyPaid ? 'Bill Amount Paid Fully' : 'Already Paid'}</div>
                    <h5 className="pm-stat-value" style={{ color: '#15803d' }}>₹{totalPaid.toLocaleString('en-IN')}</h5>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="pm-stat-label">Outstanding Amount</div>
                    <h5 className="pm-stat-value" style={{ color: '#b91c1c' }}>₹{outstanding.toLocaleString('en-IN')}</h5>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="pm-stat-label">Payment Status</div>
                    <span className={`pm-badge ${isFullyPaid ? 'pm-badge-success' : status === 'Partially Paid' ? 'pm-badge-warn' : 'pm-badge-danger'}`}>
                      {status}
                    </span>
                  </div>
                </div>
                <hr className="pm-divider my-3" />
                <div className="d-flex justify-content-between align-items-center">
                  <span className="pm-subtitle">
                    Customer: <strong style={{ color: '#0f1b33' }}>{currentBill.customerDetails?.name || currentBill.customer?.name}</strong> ({currentBill.customerDetails?.mobile || currentBill.customer?.mobile || 'N/A'})
                  </span>
                  {outstanding > 0 && (
                    <span className="pm-subtitle">
                      Balance due: <strong style={{ color: '#b91c1c' }}>₹{outstanding.toLocaleString('en-IN')}</strong>
                    </span>
                  )}
                </div>
              </div>

              {error && (
                <div className="alert alert-danger pm-alert d-flex align-items-center gap-2 mb-3" role="alert">
                  <AlertCircle size={18} /> {error}
                </div>
              )}
              {success && (
                <div className="alert alert-success pm-alert d-flex align-items-center gap-2 mb-3" style={{ background: '#dcfce7', color: '#15803d' }} role="alert">
                  <Check size={18} /> {success}
                </div>
              )}

              {/* Record New Payment Form */}
              {outstanding > 0 ? (
                <div className="pm-history-card mb-4" style={{ boxShadow: '0 6px 20px rgba(37, 99, 235, 0.10)' }}>
                  <div className="p-3" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' }}>
                    <h6 className="mb-0 fw-bold d-flex align-items-center gap-2 text-white" style={{ fontSize: '0.95rem' }}>
                      <span className="d-inline-flex align-items-center justify-content-center" style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.2)' }}>
                        <Plus size={15} />
                      </span>
                      Record New Payment
                    </h6>
                  </div>
                  <div className="p-4">
                    <form onSubmit={handleAddPayment}>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label pm-label">
                            Payment Amount (₹) <span className="pm-req">*</span>
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            max={outstanding}
                            step="0.01"
                            className="form-control pm-input"
                            placeholder={`Max ₹${outstanding}`}
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            required
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label pm-label">Payment Method <span className="pm-req">*</span></label>
                          <select
                            className="form-select pm-input"
                            value={formData.paymentMethod}
                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                            required
                          >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Card">Card</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label pm-label">Payment Date <span className="pm-req">*</span></label>
                          <input
                            type="date"
                            className="form-control pm-input"
                            value={formData.paymentDate}
                            onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label pm-label">Transaction / Reference No.</label>
                          <input
                            type="text"
                            className="form-control pm-input"
                            placeholder="e.g. UPI Ref / Cheque No."
                            value={formData.referenceNumber}
                            onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label pm-label">Notes</label>
                          <input
                            type="text"
                            className="form-control pm-input"
                            placeholder="e.g. Advance payment / Part payment"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="mt-4 text-end">
                        <button
                          type="submit"
                          className="btn pm-btn-gradient d-inline-flex align-items-center gap-2"
                          disabled={submitting}
                        >
                          {submitting ? 'Saving...' : (<><Check size={16} /> Save Payment</>)}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="alert alert-success pm-alert py-3 text-center mb-4" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                  This bill is fully paid. No outstanding amount remaining.
                </div>
              )}

              {/* Payment History Table */}
              <div className="pm-history-card">
                <div
                  className="pm-history-header d-flex justify-content-between align-items-center p-3"
                  onClick={() => setShowHistory((prev) => !prev)}
                >
                  <div className="d-flex align-items-center gap-2">
                    <ChevronDown size={16} color="#2563eb" className={`pm-collapse-icon ${showHistory ? '' : 'collapsed'}`} />
                    <span className="fw-bold" style={{ color: '#0f1b33', fontSize: '0.9rem' }}>Payment History</span>
                    <span className="pm-method-badge">{payments.length} {payments.length === 1 ? 'payment' : 'payments'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-light btn-sm pm-action-btn border-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchPaymentHistory();
                    }}
                    title="Refresh payment history"
                  >
                    <RefreshCw size={14} color="#2563eb" />
                  </button>
                </div>
                {showHistory && (
                <div className="p-0">
                  <div className="table-responsive">
                    <table className="table table-hover table-sm mb-0 align-middle pm-history-table">
                      <thead className="table-light">
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Reference</th>
                          <th>Notes</th>
                          <th className="text-center" style={{ width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                                  <tr><td colSpan="6" className="text-center py-3 text-muted">Loading payments...</td></tr>
                        ) : payments.length === 0 ? (
                          <tr><td colSpan="6" className="text-center py-3 text-muted">No payments recorded yet.</td></tr>
                        ) : (
                          payments.map((p) => {
                            const isEditing = editingPaymentId === p._id;
                            return (
                              <tr key={p._id}>
                                {isEditing ? (
                                  <>
                                    <td>
                                      <input
                                        type="date"
                                        className="form-control form-control-sm pm-input"
                                        value={editFormData.paymentDate}
                                        onChange={(e) => setEditFormData({ ...editFormData, paymentDate: e.target.value })}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        className="form-control form-control-sm pm-input text-end"
                                        value={editFormData.amount}
                                        onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                                      />
                                    </td>
                                    <td>
                                      <select
                                        className="form-select form-select-sm pm-input"
                                        value={editFormData.paymentMethod}
                                        onChange={(e) => setEditFormData({ ...editFormData, paymentMethod: e.target.value })}
                                      >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="Card">Card</option>
                                        <option value="Other">Other</option>
                                      </select>
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        className="form-control form-control-sm pm-input"
                                        value={editFormData.referenceNumber}
                                        onChange={(e) => setEditFormData({ ...editFormData, referenceNumber: e.target.value })}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        className="form-control form-control-sm pm-input"
                                        value={editFormData.notes}
                                        onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                                      />
                                    </td>
                                    <td className="text-center pm-actions-cell">
                                      <span className="pm-actions">
                                        <button
                                          type="button"
                                          className="btn btn-sm pm-action-btn pm-act-save"
                                          style={{ background: '#dcfce7', color: '#15803d' }}
                                          onClick={() => handleSaveEdit(p._id)}
                                          title="Save Payment"
                                          aria-label="Save Payment"
                                        >
                                          <Check size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm pm-action-btn pm-act-cancel"
                                          style={{ background: '#f1f5f9', color: '#475569' }}
                                          onClick={handleCancelEdit}
                                          title="Cancel"
                                          aria-label="Cancel"
                                        >
                                          <X size={15} />
                                        </button>
                                      </span>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                                    <td className="fw-bold text-success">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                                    <td>
                                      <span className="pm-method-badge">
                                        {p.paymentMethod}
                                      </span>
                                    </td>
                                    <td className="text-muted small">{p.referenceNumber || '—'}</td>
                                    <td className="text-muted small">{p.notes || '—'}</td>
                                    <td className="text-center pm-actions-cell">
                                      <span className="pm-actions">
                                        <button
                                          type="button"
                                          className="btn btn-sm pm-action-btn pm-act-edit"
                                          style={{ background: '#eff6ff', color: '#2563eb' }}
                                          onClick={() => handleStartEdit(p)}
                                          title="Edit Payment"
                                          aria-label="Edit Payment"
                                        >
                                          <Edit2 size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm pm-action-btn pm-act-del"
                                          style={{ background: '#fee2e2', color: '#b91c1c' }}
                                          onClick={() => handleDeletePayment(p._id)}
                                          title="Delete Payment"
                                          aria-label="Delete Payment"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex justify-content-end">
              <button type="button" className="btn pm-btn-close" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentModal;
