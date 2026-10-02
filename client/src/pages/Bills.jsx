import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Plus, Search, FileText, MessageCircle, Pencil, CreditCard, Bell,
  CheckCircle2, Clock, AlertTriangle, IndianRupee, Wallet, CalendarDays, ArrowUpDown
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getWhatsAppUrl, getPaymentReminderWhatsAppUrl } from '../utils/whatsapp';
import PaymentModal from '../components/PaymentModal';
import GcSelect from '../components/GcSelect';
import './bills.css';

// Single source of truth for a bill's money values and status. It keeps the exact
// formulas the table always used (outstanding falls back to total - paid, and a bill
// counts as partially paid when the API says so or when it has a part payment), so the
// summary cards, the filter pills and the status pills always agree with the rows.
const getBillFinance = (bill) => {
  const total = Number(bill.totalAmount) || 0;
  const paid = Number(bill.totalPaid !== undefined ? bill.totalPaid : bill.paidAmount) || 0;
  const outstanding = Number(bill.outstanding !== undefined ? bill.outstanding : Math.max(total - paid, 0));
  const isFullyPaid = outstanding <= 0 && total > 0;
  const isPartiallyPaid = !isFullyPaid && (bill.paymentStatus === 'Partially Paid' || (paid > 0 && outstanding > 0));
  const statusKind = isFullyPaid ? 'paid' : isPartiallyPaid ? 'partial' : 'unpaid';
  const statusLabel = isFullyPaid ? 'Paid' : isPartiallyPaid ? 'Partially Paid' : 'Outstanding';
  return { total, paid, outstanding, isFullyPaid, isPartiallyPaid, statusKind, statusLabel };
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partially Paid' },
  { value: 'unpaid', label: 'Outstanding' }
];

const DATE_FILTERS = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'month', label: 'This month' }
];

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Amount: high to low' },
  { value: 'amount-asc', label: 'Amount: low to high' },
  { value: 'due-desc', label: 'Outstanding: high to low' }
];

const Bills = () => {
  const location = useLocation();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // UI-only filters: they narrow/order the bills that are already loaded from the API.
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedPaymentBill, setSelectedPaymentBill] = useState(null);
  const [feedback, setFeedback] = useState(() => location.state?.successMessage
    ? { type: 'success', message: location.state.successMessage }
    : { type: '', message: '' });

  const WHATSAPP_BILL_MESSAGE = 'WhatsApp opened with the bill message. Use View / Print to save the PDF, then attach it manually in WhatsApp.';

  // Auto-close the WhatsApp toasts after 3 seconds
  useEffect(() => {
    if (
      feedback.message === WHATSAPP_BILL_MESSAGE ||
      feedback.message.startsWith('WhatsApp payment reminder opened')
    ) {
      const timer = setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback.message]);

  const fetchBills = async () => {
    try {
      const { data } = await api.get('/bills');
      setBills(data);
    } catch (error) {
      console.error('Error fetching bills', error);
      setFeedback({ type: 'danger', message: 'Unable to load bills. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  // Summary totals derived from the real bills array (no extra request, no mock data).
  const stats = bills.reduce((acc, bill) => {
    const fin = getBillFinance(bill);
    acc.totalBills += 1;
    acc.totalBilled += fin.total;
    acc.totalPaid += fin.paid;
    acc.outstanding += fin.outstanding;
    if (fin.statusKind === 'partial') acc.partiallyPaid += 1;
    return acc;
  }, { totalBills: 0, totalBilled: 0, totalPaid: 0, outstanding: 0, partiallyPaid: 0 });

  // Rolling window used by the date filter (null = no lower bound).
  const dateWindowStart = (() => {
    if (dateFilter === '7' || dateFilter === '30' || dateFilter === '90') {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(dateFilter)).getTime();
    }
    return null;
  })();

  const filteredBills = bills
    .filter(bill => {
      // Search: unchanged - same fields, same matching as before.
      if (searchQuery) {
        const custName = bill.customer?.name || bill.customerDetails?.name || '';
        const custMobile = bill.customer?.mobile || bill.customerDetails?.mobile || '';
        const vehNum = bill.vehicle?.vehicleNumber || bill.vehicleDetails?.vehicleNumber || '';
        const matchesSearch =
          bill.billNumber.toLowerCase().includes(q) ||
          custName.toLowerCase().includes(q) ||
          custMobile.toLowerCase().includes(q) ||
          vehNum.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (statusFilter !== 'all' && getBillFinance(bill).statusKind !== statusFilter) return false;

      if (dateFilter !== 'all') {
        const billDate = new Date(bill.date);
        const billTime = billDate.getTime();
        if (!Number.isFinite(billTime)) return false;
        if (dateFilter === 'month') {
          const now = new Date();
          if (billDate.getMonth() !== now.getMonth() || billDate.getFullYear() !== now.getFullYear()) return false;
        } else if (dateWindowStart !== null && billTime < dateWindowStart) {
          return false;
        }
      }

      return true;
    })
    // .filter() already returned a fresh array, so sorting never touches `bills`.
    .sort((a, b) => {
      if (sortBy === 'amount-desc') return Number(b.totalAmount || 0) - Number(a.totalAmount || 0);
      if (sortBy === 'amount-asc') return Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
      if (sortBy === 'due-desc') return getBillFinance(b).outstanding - getBillFinance(a).outstanding;
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return sortBy === 'date-asc' ? timeA - timeB : timeB - timeA;
    });

  const handleWhatsApp = (bill) => {
    setFeedback({ type: '', message: '' });
    const { url, error } = getWhatsAppUrl(bill);

    if (error) {
      setFeedback({ type: 'danger', message: error });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setFeedback({
      type: 'info',
      message: WHATSAPP_BILL_MESSAGE
    });
  };

  const handleWhatsAppReminder = (bill) => {
    setFeedback({ type: '', message: '' });
    const { url, error } = getPaymentReminderWhatsAppUrl(bill);

    if (error) {
      setFeedback({ type: 'danger', message: error });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setFeedback({
      type: 'info',
      message: `WhatsApp payment reminder opened for ${bill.customer?.name || bill.customerDetails?.name}.`
    });
  };

  const handlePaymentUpdated = (updatedBill) => {
    if (updatedBill) {
      setBills(currentBills => currentBills.map(b => b._id === updatedBill._id ? { ...b, ...updatedBill } : b));
    }
    fetchBills();
  };

  return (
    <div className="bl-page">
      {/* ---------- Page header ---------- */}
      <div className="bl-header">
        <div className="bl-header-titles">
          <h2 className="bl-title">Bills &amp; Invoices</h2>
          <p className="bl-subtitle">Create, track and manage customer bills, payments and outstanding balances.</p>
        </div>
        <div className="bl-header-actions">
          <div className="bl-search">
            <Search size={18} />
            <input
              id="bl-bill-search"
              name="searchQuery"
              type="text"
              placeholder="Search bill no, customer or vehicle"
              aria-label="Search bill no, customer or vehicle"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            />
          </div>
          <Link to="/bills/generate" className="bl-generate-btn">
            <Plus size={18} /> Generate Bill
          </Link>
        </div>
      </div>

      {feedback.message && (
        <div className={`alert alert-${feedback.type} alert-dismissible fade show bl-alert`} role="alert">
          {feedback.message}
          <button type="button" className="btn-close" onClick={() => setFeedback({ type: '', message: '' })}></button>
        </div>
      )}

      {/* ---------- Summary cards (computed from the loaded bills) ---------- */}
      <div className="gc-kpis">
        <div className="gc-kpi tone-blue">
          <span className="gc-kpi-icon"><FileText size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Total Bills</div>
            <div className="gc-kpi-value">{loading ? '...' : stats.totalBills}</div>
            <div className="gc-kpi-sub">All bills generated</div>
          </div>
        </div>
        <div className="gc-kpi tone-sky">
          <span className="gc-kpi-icon"><IndianRupee size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Total Billed</div>
            <div className="gc-kpi-value">{loading ? '...' : `₹${stats.totalBilled.toLocaleString('en-IN')}`}</div>
            <div className="gc-kpi-sub">Value of every bill</div>
          </div>
        </div>
        <div className="gc-kpi tone-green">
          <span className="gc-kpi-icon"><Wallet size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Total Paid</div>
            <div className="gc-kpi-value">{loading ? '...' : `₹${stats.totalPaid.toLocaleString('en-IN')}`}</div>
            <div className="gc-kpi-sub">Amount collected so far</div>
          </div>
        </div>
        <div className="gc-kpi tone-red">
          <span className="gc-kpi-icon"><AlertTriangle size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Outstanding</div>
            <div className="gc-kpi-value">{loading ? '...' : `₹${stats.outstanding.toLocaleString('en-IN')}`}</div>
            <div className="gc-kpi-sub">Still to be collected</div>
          </div>
        </div>
        <div className="gc-kpi tone-amber">
          <span className="gc-kpi-icon"><Clock size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Partially Paid</div>
            <div className="gc-kpi-value">{loading ? '...' : stats.partiallyPaid}</div>
            <div className="gc-kpi-sub">Bills with a balance left</div>
          </div>
        </div>
      </div>

      {/* ---------- Bills data card ---------- */}
      <div className="bl-table-card">
        {/* Toolbar: status pills + date + sort. All of it narrows/reorders the real
            bills already held in state, so search, filters and sorting stay in sync. */}
        <div className="bl-toolbar">
          <div className="bl-seg" role="group" aria-label="Filter bills by payment status">
            {STATUS_FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`bl-seg-btn ${statusFilter === option.value ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
                aria-pressed={statusFilter === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="bl-toolbar-right">
            <div className="bl-select-wrap">
              <CalendarDays size={15} className="bl-select-icon" aria-hidden="true" />
              <GcSelect
                className="bl-select"
                value={dateFilter}
                onChange={setDateFilter}
                options={DATE_FILTERS}
                ariaLabel="Filter bills by date"
              />
            </div>
            <div className="bl-select-wrap">
              <ArrowUpDown size={15} className="bl-select-icon" aria-hidden="true" />
              <GcSelect
                className="bl-select"
                value={sortBy}
                onChange={setSortBy}
                options={SORT_OPTIONS}
                ariaLabel="Sort bills"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bl-loading">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Loading bills...
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="bl-empty">
            <span className="bl-empty-icon"><FileText size={28} /></span>
            <p className="bl-empty-title">No bills found</p>
            <p className="bl-empty-text">
              {searchQuery || statusFilter !== 'all' || dateFilter !== 'all'
                ? 'No bills match your current search or filters. Try changing or clearing them.'
                : 'No bills found. Generate a bill to get started.'}
            </p>
          </div>
        ) : (
          <div className="bl-table-wrapper">
            <table className="bl-table">
              {/* The columns are content-sized (see `table-layout: auto` in bills.css), so the
                  Bill No., the full Customer name + phone, the Vehicle number, the amounts,
                  the Status pill and the action buttons can never be squeezed, wrapped or
                  clipped. The colgroup below only steers how the spare width is shared on
                  large screens - a column always stays at least as wide as its content. */}
              <colgroup>
                <col className="bl-col-no" />
                <col className="bl-col-date" />
                <col className="bl-col-customer" />
                <col className="bl-col-vehicle" />
                <col className="bl-col-amount" />
                <col className="bl-col-amount" />
                <col className="bl-col-amount" />
                <col className="bl-col-status" />
                <col className="bl-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Bill No.</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th className="bl-th-right">Total Amount</th>
                  <th className="bl-th-right">Total Paid</th>
                  <th className="bl-th-right">Outstanding</th>
                  <th className="bl-th-center">Status</th>
                  <th className="bl-th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(bill => {
                  const fin = getBillFinance(bill);
                  const { total, paid, outstanding, statusKind, statusLabel } = fin;

                  return (
                    <tr key={bill._id}>
                      <td>
                        <span className="bl-bill-no">{bill.billNumber}</span>
                      </td>
                      <td>
                        <span className="bl-date">{new Date(bill.date).toLocaleDateString()}</span>
                      </td>
                      <td>
                        <div className="bl-customer-name" title={bill.customer?.name || bill.customerDetails?.name}>
                          {bill.customer?.name || bill.customerDetails?.name}
                        </div>
                        <span className="bl-customer-phone">
                          {bill.customer?.mobile || bill.customerDetails?.mobile || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="bl-vehicle-no">{bill.vehicle?.vehicleNumber}</span>
                      </td>
                      <td className="bl-td-right">
                        <span className="bl-amount">₹{total.toLocaleString('en-IN')}</span>
                      </td>
                      <td className="bl-td-right">
                        <span className="bl-amount bl-amount-paid">₹{paid.toLocaleString('en-IN')}</span>
                      </td>
                      <td className="bl-td-right">
                        <span className={`bl-amount ${outstanding > 0 ? 'bl-amount-due' : 'bl-amount-zero'}`}>
                          ₹{outstanding.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="bl-td-center">
                        <span className={`bl-status bl-status-${statusKind}`}>
                          {statusKind === 'paid'
                            ? <CheckCircle2 size={13} />
                            : statusKind === 'partial'
                              ? <Clock size={13} />
                              : <AlertTriangle size={13} />}
                          {statusLabel}
                        </span>
                      </td>
                      <td className="bl-td-actions">
                        <div className="bl-actions">
                          <button
                            type="button"
                            className="bl-action-btn bl-action-icon bl-action-primary"
                            onClick={() => setSelectedPaymentBill(bill)}
                            title={fin.isFullyPaid ? 'Fully paid' : 'Pay'}
                            aria-label="Pay"
                            disabled={fin.isFullyPaid}
                          >
                            <CreditCard size={15} />
                          </button>
                          <Link
                            to={`/bills/edit/${bill._id}`}
                            className="bl-action-btn bl-action-icon"
                            title="Edit"
                            aria-label="Edit"
                          >
                            <Pencil size={15} />
                          </Link>
                          <Link
                            to={`/bills/view/${bill._id}`}
                            state={{ from: '/bills' }}
                            className="bl-action-btn bl-action-icon"
                            title="View Bill"
                            aria-label="View Bill"
                          >
                            <FileText size={15} />
                          </Link>
                          <button
                            type="button"
                            className="bl-action-btn bl-action-icon bl-action-success"
                            onClick={() => handleWhatsApp(bill)}
                            title="WhatsApp"
                            aria-label="WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </button>
                          {outstanding > 0 && (
                            <button
                              type="button"
                              className="bl-action-btn bl-action-icon bl-action-warn"
                              onClick={() => handleWhatsAppReminder(bill)}
                              title="Send Reminder"
                              aria-label="Send Reminder"
                            >
                              <Bell size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPaymentBill && (
        <PaymentModal
          show={Boolean(selectedPaymentBill)}
          bill={selectedPaymentBill}
          onClose={() => setSelectedPaymentBill(null)}
          onPaymentUpdated={handlePaymentUpdated}
        />
      )}
    </div>
  );
};

export default Bills;

