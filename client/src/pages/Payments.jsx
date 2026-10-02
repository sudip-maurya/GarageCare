import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api, { getFullImageUrl } from '../utils/api';
import {
  CreditCard, Search, RefreshCw,
  Trash2, QrCode, Check, IndianRupee,
  Plus, Edit, Star, Power, Building2, ShieldCheck, Wallet, Clock, CircleCheckBig,
  Eye, Bell, ChevronDown
} from 'lucide-react';
import { getPaymentReminderWhatsAppUrl } from '../utils/whatsapp';
import PaymentModal from '../components/PaymentModal';
import PaymentQrModal from '../components/PaymentQrModal';

const Payments = () => {
  const [activeTab, setActiveTab] = useState('outstanding'); // 'outstanding' | 'settings'
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    totalPaid: 0,
    pendingBills: 0,
    partiallyPaidBills: 0,
    fullyPaidBills: 0
  });
  const [bills, setBills] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingBills, setLoadingBills] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [accountFilter, setAccountFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  // Payment Accounts state
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuUp, setAccountMenuUp] = useState(false);
  const accountMenuRef = useRef(null);

  // Close the payment-account dropdown on outside click / Escape (visual only)
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) setAccountMenuOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  const toggleAccountMenu = () => {
    if (!accountMenuOpen && accountMenuRef.current) {
      const rect = accountMenuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Open upwards only if there is clearly not enough room below (~260px panel)
      setAccountMenuUp(spaceBelow < 280 && rect.top > 280);
    }
    setAccountMenuOpen((v) => !v);
  };

  const selectedAccountLabel = accountFilter === 'All' ? 'All Payment Accounts' : accountFilter;
  const selectedAccountObj = paymentAccounts.find((a) => a.name === accountFilter) || null;

  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Modals state
  const [selectedBillForPayment, setSelectedBillForPayment] = useState(null);
  const [selectedBillForQr, setSelectedBillForQr] = useState(null);

  // Feedback banner
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Add / Edit Account Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [modalError, setModalError] = useState('');
  const [accountForm, setAccountForm] = useState({
    name: '',
    paymentType: 'Google Pay',
    upiId: '',
    instructions: '',
    isDefault: false,
    isActive: true,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolderName: ''
  });
  const [accountQrFile, setAccountQrFile] = useState(null);
  const [accountQrPreview, setAccountQrPreview] = useState(null);

  const fetchDashboardStats = async () => {
    setLoadingStats(true);
    try {
      const { data } = await api.get('/payments/dashboard');
      setStats(data);
    } catch (err) {
      console.error('Failed to load payments dashboard stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchBills = async () => {
    setLoadingBills(true);
    try {
      const { data } = await api.get('/payments/outstanding');
      setBills(data);
    } catch (err) {
      console.error('Failed to load outstanding bills', err);
      setFeedback({ type: 'danger', message: 'Unable to load outstanding bills.' });
    } finally {
      setLoadingBills(false);
    }
  };

  const fetchPaymentAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data } = await api.get('/payment-accounts');
      setPaymentAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load payment accounts', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
    fetchBills();
    fetchPaymentAccounts();
  }, []);

  // Open Add Account Modal
  const handleOpenAddAccount = () => {
    if (paymentAccounts.length >= 4) {
      setFeedback({ type: 'danger', message: 'Maximum 4 payment accounts allowed. Please edit or delete an existing account.' });
      return;
    }
    setEditingAccountId(null);
    setModalError('');
    setAccountForm({
      name: '',
      paymentType: 'Google Pay',
      upiId: '',
      instructions: '',
      isDefault: paymentAccounts.length === 0,
      isActive: true,
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      accountHolderName: ''
    });
    setAccountQrFile(null);
    setAccountQrPreview(null);
    setShowAccountModal(true);
  };

  // Open Edit Account Modal
  const handleOpenEditAccount = (acc) => {
    setEditingAccountId(acc._id);
    setModalError('');
    setAccountForm({
      name: acc.name || '',
      paymentType: acc.paymentType || 'UPI',
      upiId: acc.upiId || '',
      instructions: acc.instructions || '',
      isDefault: Boolean(acc.isDefault),
      isActive: Boolean(acc.isActive),
      bankName: acc.bankDetails?.bankName || '',
      accountNumber: acc.bankDetails?.accountNumber || '',
      ifscCode: acc.bankDetails?.ifscCode || '',
      accountHolderName: acc.bankDetails?.accountHolderName || ''
    });
    setAccountQrFile(null);
    setAccountQrPreview(acc.qrCodeUrl ? getFullImageUrl(acc.qrCodeUrl) : null);
    setShowAccountModal(true);
  };

  const handleAccountFileChange = (e) => {
    const file = e.target.files[0];
    setModalError('');
    if (file) {
      if (!file.type.startsWith('image/')) {
        setModalError('Please upload an image file (PNG, JPG, JPEG, WEBP).');
        e.target.value = '';
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        setModalError('QR code image file must be smaller than 3MB.');
        e.target.value = '';
        return;
      }
      setAccountQrFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAccountQrPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!accountForm.name.trim()) {
      alert('Please enter an account name.');
      return;
    }

    setSavingAccount(true);
    setModalError('');
    setFeedback({ type: '', message: '' });

    try {
      const formData = new FormData();
      formData.append('name', accountForm.name.trim());
      formData.append('paymentType', accountForm.paymentType);
      formData.append('upiId', accountForm.upiId ? accountForm.upiId.trim() : '');
      formData.append('instructions', accountForm.instructions ? accountForm.instructions.trim() : '');
      formData.append('isDefault', String(accountForm.isDefault));
      formData.append('isActive', String(accountForm.isActive));

      if (accountForm.paymentType === 'Bank Transfer') {
        formData.append('bankDetails[bankName]', accountForm.bankName.trim());
        formData.append('bankDetails[accountNumber]', accountForm.accountNumber.trim());
        formData.append('bankDetails[ifscCode]', accountForm.ifscCode.trim());
        formData.append('bankDetails[accountHolderName]', accountForm.accountHolderName.trim());
      }

      if (accountQrFile) {
        formData.append('qrCode', accountQrFile);
      }

      if (editingAccountId) {
        await api.put(`/payment-accounts/${editingAccountId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setFeedback({ type: 'success', message: `Payment account "${accountForm.name}" updated successfully.` });
      } else {
        await api.post('/payment-accounts', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setFeedback({ type: 'success', message: `Payment account "${accountForm.name}" added successfully.` });
      }

      setShowAccountModal(false);
      fetchPaymentAccounts();
    } catch (err) {
      console.error('Error saving account', err);
      const msg = err.response?.data?.message || 'Failed to save payment account.';
      setModalError(msg);
      setFeedback({ type: 'danger', message: msg });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (acc) => {
    if (!window.confirm(`Are you sure you want to delete payment account "${acc.name}"? Past bills will retain their payment details snapshot.`)) {
      return;
    }
    setFeedback({ type: '', message: '' });
    try {
      await api.delete(`/payment-accounts/${acc._id}`);
      setFeedback({ type: 'success', message: `Payment account "${acc.name}" deleted.` });
      fetchPaymentAccounts();
    } catch (err) {
      console.error('Error deleting account', err);
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Failed to delete payment account.' });
    }
  };

  const handleToggleStatus = async (acc) => {
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await api.patch(`/payment-accounts/${acc._id}/status`);
      setFeedback({ type: 'success', message: `"${acc.name}" marked as ${data.account.isActive ? 'Active' : 'Inactive'}.` });
      fetchPaymentAccounts();
    } catch (err) {
      console.error('Error toggling status', err);
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Failed to toggle account status.' });
    }
  };

  const handleSetDefault = async (acc) => {
    setFeedback({ type: '', message: '' });
    try {
      await api.patch(`/payment-accounts/${acc._id}/default`);
      setFeedback({ type: 'success', message: `"${acc.name}" set as default payment account.` });
      fetchPaymentAccounts();
    } catch (err) {
      console.error('Error setting default', err);
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Failed to set default account.' });
    }
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
      message: `WhatsApp payment reminder opened for ${bill.customerDetails?.name || bill.customer?.name}.`
    });
  };

  const handlePaymentSaved = () => {
    fetchDashboardStats();
    fetchBills();
  };

  // Filter bills — Show ONLY bills that have an outstanding/unpaid amount
  const filteredBills = bills.filter(bill => {
    const total = Number(bill.totalAmount) || 0;
    const paid = Number(bill.totalPaid !== undefined ? bill.totalPaid : bill.paidAmount) || 0;
    const outstanding = Number(bill.outstanding !== undefined ? bill.outstanding : Math.max(total - paid, 0));
    const billStatus = bill.paymentStatus || (bill.status === 'Partial' ? 'Partially Paid' : bill.status);
    const isFullyPaid = (outstanding <= 0 && total > 0) || billStatus === 'Paid' || bill.status === 'Paid';

    // Completely hide/exclude fully paid bills (Outstanding = ₹0 / payment status = Paid)
    if (isFullyPaid || outstanding <= 0) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'All') {
      if (statusFilter === 'Partially Paid' && billStatus !== 'Partially Paid') return false;
      if (statusFilter === 'Pending' && billStatus !== 'Pending') return false;
      if (statusFilter === 'Paid') return false;
    }

    // Account filter
    if (accountFilter !== 'All') {
      const billAccName = bill.paymentAccountDetails?.name || bill.paymentAccount?.name;
      if (billAccName !== accountFilter) return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const billNo = (bill.billNumber || '').toLowerCase();
    const custName = (bill.customerDetails?.name || bill.customer?.name || '').toLowerCase();
    const custMobile = (bill.customerDetails?.mobile || bill.customer?.mobile || '').toLowerCase();
    const vehNo = (bill.vehicleDetails?.vehicleNumber || bill.vehicle?.vehicleNumber || '').toLowerCase();

    return billNo.includes(q) || custName.includes(q) || custMobile.includes(q) || vehNo.includes(q);
  });

  return (
    <div className="gc-page">
      <div className="gc-page-head">
        <div className="gc-titles">
          <h2 className="gc-title">Payments & Outstanding</h2>
          <p className="gc-subtitle">Track payments, outstanding balances, and multi-QR payment accounts</p>
        </div>
        <div className="gc-head-actions">
          <button
            className="btn btn-outline-secondary d-flex align-items-center gap-1"
            onClick={() => { fetchDashboardStats(); fetchBills(); fetchPaymentAccounts(); }}
            title="Refresh Data"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            className="btn btn-primary d-flex align-items-center gap-1"
            onClick={() => setSelectedBillForQr({})}
          >
            <QrCode size={16} /> Show Payment QR
          </button>
        </div>
      </div>

      {feedback.message && (
        <div className={`alert alert-${feedback.type} alert-dismissible fade show`} role="alert">
          {feedback.message}
          <button type="button" className="btn-close" onClick={() => setFeedback({ type: '', message: '' })}></button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="gc-kpis">
        <div className="gc-kpi tone-red">
          <span className="gc-kpi-icon"><IndianRupee size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Total Outstanding</div>
            <div className="gc-kpi-value">
              {loadingStats ? '...' : `₹${stats.totalOutstanding.toLocaleString('en-IN')}`}
            </div>
            <div className="gc-kpi-sub">Unpaid amount across all bills</div>
          </div>
        </div>
        <div className="gc-kpi tone-green">
          <span className="gc-kpi-icon"><Wallet size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Total Paid</div>
            <div className="gc-kpi-value">
              {loadingStats ? '...' : `₹${stats.totalPaid.toLocaleString('en-IN')}`}
            </div>
            <div className="gc-kpi-sub">Total collected revenue</div>
          </div>
        </div>
        <div className="gc-kpi tone-red">
          <span className="gc-kpi-icon"><Clock size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Pending Bills</div>
            <div className="gc-kpi-value">{loadingStats ? '...' : stats.pendingBills}</div>
            <div className="gc-kpi-sub">Bills with ₹0 collected</div>
          </div>
        </div>
        <div className="gc-kpi tone-amber">
          <span className="gc-kpi-icon"><CreditCard size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Partially Paid</div>
            <div className="gc-kpi-value">{loadingStats ? '...' : stats.partiallyPaidBills}</div>
            <div className="gc-kpi-sub">Partially cleared bills</div>
          </div>
        </div>
        <div className="gc-kpi tone-blue">
          <span className="gc-kpi-icon"><CircleCheckBig size={20} /></span>
          <div className="gc-kpi-body">
            <div className="gc-kpi-label">Fully Paid</div>
            <div className="gc-kpi-value">{loadingStats ? '...' : stats.fullyPaidBills}</div>
            <div className="gc-kpi-sub">Completely settled bills</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs gc-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'outstanding' ? 'active' : ''}`}
            onClick={() => setActiveTab('outstanding')}
            type="button"
          >
            Outstanding Bills & Ledger
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            Payment Accounts &amp; QR Settings ({paymentAccounts.length}/4)
          </button>
        </li>
      </ul>

      {/* Tab 1: Outstanding Bills Table */}
      {activeTab === 'outstanding' && (
        <div className="gc-table-card gc-outstanding">
          <div className="gc-toolbar">
            <div className="gc-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search Customer, Mobile, Bill No, Vehicle..."
                aria-label="Search outstanding bills"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="gc-acct" ref={accountMenuRef}>
              <button
                type="button"
                className={`gc-acct-btn ${accountMenuOpen ? 'open' : ''}`}
                onClick={toggleAccountMenu}
                aria-haspopup="listbox"
                aria-expanded={accountMenuOpen}
                title="Filter by payment account"
              >
                <span className="gc-acct-icon" aria-hidden="true">
                  <Wallet size={16} />
                </span>
                <span className="gc-acct-text" title={selectedAccountLabel}>
                  {selectedAccountLabel}
                  {selectedAccountObj?.paymentType ? (
                    <small className="gc-acct-sub">{selectedAccountObj.paymentType}</small>
                  ) : null}
                </span>
                <ChevronDown size={15} className={`gc-acct-chev ${accountMenuOpen ? 'open' : ''}`} />
              </button>
              {accountMenuOpen && (
                <div className={`gc-acct-menu ${accountMenuUp ? 'up' : ''}`} role="listbox" aria-label="Payment account">
                  <button
                    type="button"
                    role="option"
                    aria-selected={accountFilter === 'All'}
                    className={`gc-acct-opt ${accountFilter === 'All' ? 'selected' : ''}`}
                    onClick={() => { setAccountFilter('All'); setAccountMenuOpen(false); }}
                  >
                    <span className="gc-acct-opt-icon" aria-hidden="true"><Building2 size={16} /></span>
                    <span className="gc-acct-opt-text">
                      All Payment Accounts
                      <small>Show bills from every account</small>
                    </span>
                    {accountFilter === 'All' && <Check size={16} className="gc-acct-check" />}
                  </button>
                  {paymentAccounts.map((acc) => (
                    <button
                      key={acc._id}
                      type="button"
                      role="option"
                      aria-selected={accountFilter === acc.name}
                      className={`gc-acct-opt ${accountFilter === acc.name ? 'selected' : ''}`}
                      onClick={() => { setAccountFilter(acc.name); setAccountMenuOpen(false); }}
                    >
                      <span className="gc-acct-opt-icon" aria-hidden="true"><Wallet size={16} /></span>
                      <span className="gc-acct-opt-text">
                        {acc.name}
                        <small>{acc.paymentType || 'Payment account'}</small>
                      </span>
                      {accountFilter === acc.name && <Check size={16} className="gc-acct-check" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="gc-seg" role="group" aria-label="Status filter">
              {['All', 'Pending', 'Partially Paid', 'Paid'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="gc-table-scroll gc-wide">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Customer</th>
                    <th>Bill / Vehicle</th>
                    <th>Payment Account</th>
                    <th>Bill Date</th>
                    <th className="text-end">Bill Total</th>
                    <th className="text-end">Paid</th>
                    <th className="text-end">Outstanding</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBills ? (
                    <tr><td colSpan="9" className="text-center py-4">Loading outstanding records...</td></tr>
                  ) : filteredBills.length === 0 ? (
                    <tr><td colSpan="9" className="text-center py-4 text-muted">No bills match the selected filter.</td></tr>
                  ) : (
                    filteredBills.map((b) => {
                      const total = Number(b.totalAmount) || 0;
                      const paid = Number(b.totalPaid !== undefined ? b.totalPaid : b.paidAmount) || 0;
                      const outstanding = Number(b.outstanding !== undefined ? b.outstanding : Math.max(total - paid, 0));
                      const isFullyPaid = outstanding <= 0 && total > 0;
                      const displayStatus = isFullyPaid 
                        ? 'PAID IN FULL' 
                        : (b.paymentStatus === 'Partially Paid' || (paid > 0 && outstanding > 0)
                            ? 'Partially Paid' 
                            : (b.paymentStatus || b.status || 'Pending'));
                      const accountName = b.paymentAccountDetails?.name || b.paymentAccount?.name || '—';
                      const accountType = b.paymentAccountDetails?.paymentType || b.paymentAccount?.paymentType;

                      return (
                        <tr key={b._id}>
                          <td>
                            <div className="fw-bold">{b.customerDetails?.name || b.customer?.name}</div>
                            <small className="text-muted">{b.customerDetails?.mobile || b.customer?.mobile || '—'}</small>
                          </td>
                          <td>
                            <Link to={`/bills/view/${b._id}`} state={{ from: '/payments' }} title="View Bill / Invoice">{b.billNumber}</Link>
                            <small className="text-muted d-block">{b.vehicleDetails?.vehicleNumber || b.vehicle?.vehicleNumber || ''}</small>
                          </td>
                          <td>
                            {accountName !== '—' ? (
                              <div>
                                <span className="badge bg-light text-dark border">{accountName}</span>
                                {accountType && <small className="text-muted d-block">{accountType}</small>}
                              </div>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(b.date).toLocaleDateString()}</td>
                          <td className="text-end fw-semibold">₹{total.toLocaleString('en-IN')}</td>
                          <td className="text-end text-success fw-semibold">₹{paid.toLocaleString('en-IN')}</td>
                          <td className="text-end text-danger fw-bold">₹{outstanding.toLocaleString('en-IN')}</td>
                          <td className="text-center">
                            <span className={`badge ${
                              isFullyPaid ? 'bg-success' :
                              displayStatus === 'Partially Paid' ? 'bg-warning text-dark' : 'bg-danger'
                            }`}>
                              {displayStatus}
                            </span>
                          </td>
                          <td className="text-center gc-actions-cell">
                            <div className="gc-actions">
                              <Link
                                to={`/bills/view/${b._id}`}
                                state={{ from: '/payments' }}
                                className="gc-act"
                                title="View Bill / Invoice"
                                aria-label="View Bill"
                              >
                                <Eye size={17} />
                              </Link>
                              <button
                                type="button"
                                className="gc-act gc-act-primary"
                                onClick={() => setSelectedBillForPayment(b)}
                                title="Update or record payment"
                                aria-label="Update Payment"
                              >
                                <CreditCard size={17} />
                              </button>
                              {outstanding > 0 && (
                                <button
                                  type="button"
                                  className="gc-act"
                                  onClick={() => handleWhatsAppReminder(b)}
                                  title="Send WhatsApp payment reminder"
                                  aria-label="Send Reminder"
                                >
                                  <Bell size={17} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Tab 2: Payment Accounts & QR Settings (1 to 4 accounts) */}
      {activeTab === 'settings' && (
        <div>
          {/* Header with Add Button */}
          <div className="gc-page-head">
            <div className="gc-titles">
              <h4 className="gc-title" style={{ fontSize: '1.2rem' }}>Payment Accounts &amp; QR Codes</h4>
              <p className="gc-subtitle">
                Configure up to 4 payment accounts (Google Pay, PhonePe, Paytm, Bank Transfer, etc.). Select which account each bill should pay to.
              </p>
            </div>
            <div className="gc-head-actions">
              <button
                type="button"
                className="btn btn-primary d-inline-flex align-items-center gap-1"
                onClick={handleOpenAddAccount}
                disabled={paymentAccounts.length >= 4}
                title={paymentAccounts.length >= 4 ? 'Maximum 4 accounts reached' : 'Add new payment account'}
              >
                <Plus size={18} /> Add Payment Account ({paymentAccounts.length}/4)
              </button>
            </div>
          </div>

          {paymentAccounts.length >= 4 && (
            <div className="alert alert-info py-2 small mb-4 d-flex align-items-center gap-2">
              <ShieldCheck size={18} /> Maximum limit of 4 payment accounts reached. To add a new one, edit or remove an existing account.
            </div>
          )}

          {loadingAccounts ? (
            <div className="text-center py-5">Loading payment accounts...</div>
          ) : paymentAccounts.length === 0 ? (
            <div className="card text-center p-5 shadow-sm">
              <QrCode size={48} className="text-muted mx-auto mb-3" />
              <h5>No Payment Accounts Configured</h5>
              <p className="text-muted">
                Add your first payment account (e.g. Google Pay, PhonePe, Paytm, or Bank Transfer) with your UPI ID and QR code.
              </p>
              <div>
                <button className="btn btn-primary" onClick={handleOpenAddAccount}>
                  <Plus size={16} /> Add Payment Account
                </button>
              </div>
            </div>
          ) : (
            <div className="row g-3">
              {paymentAccounts.map((acc) => (
                <div key={acc._id} className="col-md-6 col-xl-3" style={{ minWidth: 0 }}>
                  <div className={`card h-100 shadow-sm ${!acc.isActive ? 'border-secondary opacity-75' : acc.isDefault ? 'border-primary border-2' : ''}`}>
                    {/* Header */}
                    <div className="card-header bg-light d-flex justify-content-between align-items-center py-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-secondary">{acc.paymentType}</span>
                        {acc.isDefault && <span className="badge bg-success">Default</span>}
                      </div>
                      <span className={`badge ${acc.isActive ? 'bg-success' : 'bg-danger'}`}>
                        {acc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="card-body text-center d-flex flex-column justify-content-between p-3">
                      <div>
                        <h5 className="fw-bold mb-1 text-primary">{acc.name}</h5>

                        {/* QR Image */}
                        <div className="my-2" style={{ minHeight: '130px' }}>
                          {acc.qrCodeUrl ? (
                            <img
                              src={getFullImageUrl(acc.qrCodeUrl)}
                              alt={acc.name}
                              className="img-fluid border p-1 rounded bg-white"
                              style={{ maxHeight: '120px', maxWidth: '120px', objectFit: 'contain' }}
                              onError={(e) => {
                                console.error('Failed to load QR image:', e.currentTarget.src);
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className="border border-dashed rounded p-3 text-muted small bg-light flex-column align-items-center justify-content-center"
                            style={{ height: '120px', display: acc.qrCodeUrl ? 'none' : 'flex' }}
                          >
                            <QrCode size={30} className="mb-1 text-secondary" />
                            <span>No QR Image</span>
                          </div>
                        </div>

                        {/* UPI ID */}
                        {acc.upiId && (
                          <div className="bg-light rounded p-1 mb-2 font-monospace small text-truncate" title={acc.upiId}>
                            <strong>UPI:</strong> {acc.upiId}
                          </div>
                        )}

                        {/* Bank Details */}
                        {acc.paymentType === 'Bank Transfer' && acc.bankDetails && (
                          <div className="bg-light rounded p-2 text-start small mb-2" style={{ fontSize: '11px' }}>
                            {acc.bankDetails.bankName && <div><strong>Bank:</strong> {acc.bankDetails.bankName}</div>}
                            {acc.bankDetails.accountNumber && <div><strong>A/C:</strong> {acc.bankDetails.accountNumber}</div>}
                            {acc.bankDetails.ifscCode && <div><strong>IFSC:</strong> {acc.bankDetails.ifscCode}</div>}
                          </div>
                        )}

                        {/* Instructions */}
                        {acc.instructions && (
                          <p className="text-muted small fst-italic text-truncate mb-2" title={acc.instructions}>
                            "{acc.instructions}"
                          </p>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="border-top pt-2 mt-2">
                        <div className="d-flex justify-content-between gap-1 mb-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                            onClick={() => handleToggleStatus(acc)}
                            title={acc.isActive ? 'Deactivate Account' : 'Activate Account'}
                          >
                            <Power size={13} /> {acc.isActive ? 'Disable' : 'Enable'}
                          </button>
                          {!acc.isDefault && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                              onClick={() => handleSetDefault(acc)}
                              title="Set as Default Account"
                            >
                              <Star size={13} /> Set Default
                            </button>
                          )}
                        </div>
                        <div className="d-flex justify-content-between gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                            onClick={() => handleOpenEditAccount(acc)}
                          >
                            <Edit size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                            onClick={() => handleDeleteAccount(acc)}
                            title="Delete Account"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Payment Account Modal */}
      {showAccountModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title d-flex align-items-center gap-2">
                  <QrCode size={20} className="text-primary" />
                  {editingAccountId ? 'Edit Payment Account' : 'Add Payment Account'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowAccountModal(false)}></button>
              </div>
              <form onSubmit={handleSaveAccount}>
                <div className="modal-body p-4">
                  {modalError && (
                    <div className="alert alert-danger py-2 mb-3" role="alert">
                      {modalError}
                    </div>
                  )}
                  <div className="row g-3">
                    {/* Account Name */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Account / Display Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Workshop Google Pay, Counter PhonePe, Bank"
                        value={accountForm.name}
                        onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                        required
                      />
                    </div>

                    {/* Payment Type */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">Payment Type *</label>
                      <select
                        className="form-select"
                        value={accountForm.paymentType}
                        onChange={(e) => setAccountForm({ ...accountForm, paymentType: e.target.value })}
                      >
                        <option value="Google Pay">Google Pay</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="UPI">Other UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* UPI ID */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">UPI ID</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. garage@oksbi or 9876543210@paytm"
                        value={accountForm.upiId}
                        onChange={(e) => setAccountForm({ ...accountForm, upiId: e.target.value })}
                      />
                      <div className="form-text">Displayed on bills and copied with 1-click by customers.</div>
                    </div>

                    {/* QR Code Upload */}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold">QR Code Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="form-control"
                        onChange={handleAccountFileChange}
                      />
                      {accountQrPreview && (
                        <div className="mt-2 text-center">
                          <img
                            src={accountQrPreview}
                            alt="QR Preview"
                            className="border p-1 rounded bg-white"
                            style={{ maxHeight: '100px', maxWidth: '100px', objectFit: 'contain' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Bank Transfer Details (conditional) */}
                    {accountForm.paymentType === 'Bank Transfer' && (
                      <div className="col-12 border p-3 rounded bg-light">
                        <h6 className="fw-bold mb-2 d-flex align-items-center gap-1">
                          <Building2 size={16} className="text-primary" /> Bank Account Details
                        </h6>
                        <div className="row g-2">
                          <div className="col-md-6">
                            <label className="form-label small">Bank Name</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="e.g. State Bank of India"
                              value={accountForm.bankName}
                              onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small">Account Number</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="e.g. 123456789012"
                              value={accountForm.accountNumber}
                              onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small">IFSC Code</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="e.g. SBIN0001234"
                              value={accountForm.ifscCode}
                              onChange={(e) => setAccountForm({ ...accountForm, ifscCode: e.target.value })}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small">Account Holder Name</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="e.g. City Garage Services"
                              value={accountForm.accountHolderName}
                              onChange={(e) => setAccountForm({ ...accountForm, accountHolderName: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment Instructions */}
                    <div className="col-12">
                      <label className="form-label fw-semibold">Payment Instructions</label>
                      <textarea
                        rows="2"
                        className="form-control"
                        placeholder="e.g. Mention Bill Number in remarks or send screenshot after payment."
                        value={accountForm.instructions}
                        onChange={(e) => setAccountForm({ ...accountForm, instructions: e.target.value })}
                      ></textarea>
                    </div>

                    {/* Default & Active Switches */}
                    <div className="col-12 d-flex gap-4">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="isDefaultAccount"
                          checked={accountForm.isDefault}
                          onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
                        />
                        <label className="form-check-label fw-semibold" htmlFor="isDefaultAccount">
                          Set as Default Account
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="isActiveAccount"
                          checked={accountForm.isActive}
                          onChange={(e) => setAccountForm({ ...accountForm, isActive: e.target.checked })}
                        />
                        <label className="form-check-label fw-semibold" htmlFor="isActiveAccount">
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingAccount}>
                    {savingAccount ? 'Saving...' : editingAccountId ? 'Update Account' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {selectedBillForPayment && (
        <PaymentModal
          show={Boolean(selectedBillForPayment)}
          bill={selectedBillForPayment}
          onClose={() => setSelectedBillForPayment(null)}
          onPaymentUpdated={handlePaymentSaved}
        />
      )}

      {/* Payment QR Modal */}
      {selectedBillForQr && (
        <PaymentQrModal
          show={Boolean(selectedBillForQr)}
          bill={selectedBillForQr._id ? selectedBillForQr : null}
          onClose={() => setSelectedBillForQr(null)}
        />
      )}
    </div>
  );
};

export default Payments;
