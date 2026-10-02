import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Plus, Edit, Trash2, Receipt, Search, Eye, CreditCard, Users, User, Phone, X, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import PaymentModal from '../components/PaymentModal';
import '../customers.css';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [customerOutstandingMap, setCustomerOutstandingMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  const [editingId, setEditingId] = useState(null);

  // Customer ledger modal state
  const [selectedCustomerForLedger, setSelectedCustomerForLedger] = useState(null);
  const [customerLedgerData, setCustomerLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState(null);
  const [modalClosing, setModalClosing] = useState(false);

  // Animated close for the Add/Edit Customer modal (visual only; same end result)
  const closeCustomerModal = () => {
    setModalClosing(true);
    window.setTimeout(() => {
      setModalClosing(false);
      setShowModal(false);
    }, 170);
  };

  const fetchCustomersAndOutstanding = async () => {
    setLoading(true);
    try {
      const [customersRes, billsRes] = await Promise.all([
        api.get('/customers'),
        api.get('/payments/outstanding').catch(() => ({ data: [] }))
      ]);
      setCustomers(customersRes.data);

      // Build customer outstanding balance map
      const map = {};
      (billsRes.data || []).forEach(b => {
        const custId = b.customer?._id || b.customer;
        if (custId) {
          const idStr = String(custId);
          const total = Number(b.totalAmount) || 0;
          const paid = Number(b.totalPaid !== undefined ? b.totalPaid : b.paidAmount) || 0;
          const out = Number(b.outstanding !== undefined ? b.outstanding : Math.max(total - paid, 0));
          map[idStr] = (map[idStr] || 0) + out;
        }
      });
      setCustomerOutstandingMap(map);
    } catch (error) {
      console.error('Error fetching customers', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomersAndOutstanding();
  }, []);

  const openCustomerLedger = async (customer) => {
    setSelectedCustomerForLedger(customer);
    setLoadingLedger(true);
    try {
      const { data } = await api.get(`/payments/outstanding/customer/${customer._id}`);
      setCustomerLedgerData(data);
    } catch (error) {
      console.error('Error loading customer ledger', error);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/customers/${editingId}`, formData);
      } else {
        await api.post('/customers', formData);
      }
      setShowModal(false);
      setFormData({ name: '', mobile: '' });
      setEditingId(null);
      fetchCustomersAndOutstanding();
    } catch (error) {
      alert(error.response?.data?.message || 'Error saving customer');
    }
  };

  const handleEdit = (customer) => {
    setFormData({ name: customer.name, mobile: customer.mobile });
    setEditingId(customer._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await api.delete(`/customers/${id}`);
        fetchCustomersAndOutstanding();
      } catch (_error) {
        alert('Error deleting customer');
      }
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.mobile || '').includes(q);
  });

  const initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const init = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] || '')).toUpperCase();
    return init || '?';
  };
  const avatarTones = ['t-blue', 't-green', 't-orange', 't-purple', 't-sky'];

  return (
    <div className="cust-page">
      <div className="cust-topbar">
        <div className="cust-head">
          <h2>Customers</h2>
          <div className="cust-subtitle">Manage your customers and their details</div>
        </div>
        <div className="cust-actions">
          <div className="cust-search">
            <Search size={18} className="cust-search-icon" />
            <input
              type="text"
              placeholder="Search Customer..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className="cust-btn-primary"
            onClick={() => {
              setFormData({ name: '', mobile: '' });
              setEditingId(null);
              setModalClosing(false);
              setShowModal(true);
            }}
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      <div className="cust-stats-row">
        <Link to="/customers" className="cust-stat-card tone-blue" style={{ textDecoration: 'none' }}>
          <div className="cust-stat-top">
            <span className="cust-stat-label">TOTAL CUSTOMERS</span>
            <span className="cust-stat-icon" aria-hidden="true">
              <Users size={20} />
            </span>
          </div>
          <div className="cust-stat-body">
            <div className="cust-stat-value">{loading ? '...' : customers.length}</div>
            <div className="cust-stat-sub">Registered customers</div>
          </div>
        </Link>
      </div>

      <div className="cust-table-card">
        <div className="cust-table-head">
          <h3>Customer List</h3>
        </div>
        <div className="cust-table-wrap">
          <table className="cust-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile Number</th>
                <th>Total Outstanding</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="cust-empty">Loading...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan="4" className="cust-empty">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((customer, idx) => {
                  const outstanding = customerOutstandingMap[String(customer._id)] || 0;
                  return (
                    <tr key={customer._id}>
                      <td>
                        <div className="cust-name-cell">
                          <span className={`cust-avatar ${avatarTones[idx % avatarTones.length]}`}>{initials(customer.name)}</span>
                          <div>
                            <div className="cust-name">{customer.name}</div>
                            <div className="cust-since">Mobile: {customer.mobile}</div>
                          </div>
                        </div>
                      </td>
                      <td className="cust-mobile">{customer.mobile}</td>
                      <td>
                        {outstanding > 0 ? (
                          <button
                            type="button"
                            className="cust-pill cust-pill-danger"
                            onClick={() => openCustomerLedger(customer)}
                            title="Click to view outstanding bills breakdown"
                          >
                            ₹{outstanding.toLocaleString('en-IN')}
                          </button>
                        ) : (
                          <span className="cust-pill cust-pill-success">₹0 (Cleared)</span>
                        )}
                      </td>
                      <td>
                        <div className="cust-actions-group">
                          <button
                            type="button"
                            className="cust-icon-btn"
                            onClick={() => openCustomerLedger(customer)}
                            title="View bills and ledger"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            className="cust-icon-btn cust-icon-edit"
                            onClick={() => handleEdit(customer)}
                            title="Edit customer"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            type="button"
                            className="cust-icon-btn cust-icon-delete"
                            onClick={() => handleDelete(customer._id)}
                            title="Delete customer"
                          >
                            <Trash2 size={15} />
                          </button>
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

      {/* Bootstrap Modal for Add/Edit Customer */}
      {showModal && (
        <div className={`modal show d-block cust-modal ${modalClosing ? 'cust-closing' : ''}`} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered cust-modal-dialog">
            <div className="modal-content cust-modal-content">
              <div className="cust-modal-header">
                <div className="cust-modal-title-wrap">
                  <span className="cust-modal-title-icon"><UserPlus size={16} /></span>
                  <div>
                    <h5 className="cust-modal-title">{editingId ? 'Edit Customer' : 'Add New Customer'}</h5>
                    <small className="cust-modal-subtitle">Enter the customer details below</small>
                  </div>
                </div>
                <button type="button" className="cust-modal-close" onClick={closeCustomerModal} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="cust-modal-body">
                  <div className="cust-field">
                    <label className="cust-label" htmlFor="cust-name">Customer Name</label>
                    <div className="cust-input-wrap">
                      <User size={15} className="cust-input-icon" />
                      <input
                        id="cust-name"
                        type="text"
                        className="cust-input"
                        required
                        placeholder="e.g. Amit Sharma"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="cust-field">
                    <label className="cust-label" htmlFor="cust-mobile">Mobile Number</label>
                    <div className="cust-input-wrap">
                      <Phone size={15} className="cust-input-icon" />
                      <input
                        id="cust-mobile"
                        type="tel"
                        className="cust-input"
                        required
                        placeholder="e.g. 9876543210"
                        value={formData.mobile}
                        onChange={e => setFormData({...formData, mobile: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="cust-modal-footer">
                  <button type="button" className="cust-btn-neutral" onClick={closeCustomerModal}>Cancel</button>
                  <button type="submit" className="cust-btn-primary cust-btn-save">{editingId ? 'Update' : 'Save'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Customer Ledger & Outstanding Breakdown Modal */}
      {selectedCustomerForLedger && (
        <div className="modal show d-block cust-modal" tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-scrollable cust-modal-dialog cust-ledger-dialog">
            <div className="modal-content cust-modal-content">
              <div className="cust-modal-header">
                <div className="cust-modal-title-wrap">
                  <span className={`cust-avatar ${avatarTones[0]}`}>{initials(selectedCustomerForLedger.name)}</span>
                  <div>
                    <h5 className="cust-modal-title">{selectedCustomerForLedger.name}</h5>
                    <small className="cust-modal-subtitle">Mobile: {selectedCustomerForLedger.mobile}</small>
                  </div>
                </div>
                <button type="button" className="cust-modal-close" onClick={() => setSelectedCustomerForLedger(null)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="cust-modal-body">
                {loadingLedger ? (
                  <div className="cust-ledger-loading">Loading customer balance...</div>
                ) : customerLedgerData ? (
                  <>
                    <div className={`cust-outstanding-panel ${Number(customerLedgerData.totalOutstanding || 0) <= 0 ? 'st-clear' : ''}`}>
                      <div className="cust-outstanding-left">
                        <span className="cust-outstanding-icon"><Receipt size={18} /></span>
                        <div>
                          <span className="cust-outstanding-label">Total Customer Outstanding</span>
                          <div className="cust-outstanding-amount">
                            ₹{Number(customerLedgerData.totalOutstanding || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      <span className="cust-pill cust-pill-danger">
                        {customerLedgerData.bills?.length || 0} Total Bills
                      </span>
                    </div>

                    <h6 className="cust-bills-heading">Bills &amp; Payment Status</h6>
                    {customerLedgerData.bills && customerLedgerData.bills.length > 0 ? (
                      <div className="cust-table-wrap cust-ledger-table-wrap">
                        <table className="cust-table cust-ledger-table">
                          <colgroup>
                            <col className="c-billno" />
                            <col className="c-date" />
                            <col className="c-total" />
                            <col className="c-paid" />
                            <col className="c-due" />
                            <col className="c-status" />
                            <col className="c-action" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Bill No.</th>
                              <th>Date</th>
                              <th>Bill Total</th>
                              <th>Paid</th>
                              <th>Outstanding</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerLedgerData.bills.map(b => (
                              <tr key={b._id}>
                                <td className="cust-bill-no">{b.billNumber}</td>
                                <td className="cust-bill-date">{new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                <td className="cust-amount">₹{Number(b.totalAmount).toLocaleString('en-IN')}</td>
                                <td className="cust-amount cust-amount-paid">₹{Number(b.totalPaid || b.paidAmount || 0).toLocaleString('en-IN')}</td>
                                <td className="cust-amount cust-amount-due">₹{Number(b.outstanding || 0).toLocaleString('en-IN')}</td>
                                <td>
                                  <span className={`cust-status ${
                                    b.status === 'Paid' ? 'st-paid' :
                                    b.status === 'Partial' ? 'st-partial' : 'st-due'
                                  }`}>
                                    {b.paymentStatus || (b.status === 'Partial' ? 'Partially Paid' : b.status)}
                                  </span>
                                </td>
                                <td>
                                  <div className="cust-row-actions">
                                    <Link
                                      to={`/bills/view/${b._id}`}
                                      state={{ from: '/customers' }}
                                      className="cust-view-btn"
                                      title="View full bill details"
                                    >
                                      <Eye size={14} />
                                    </Link>
                                    <button
                                      type="button"
                                      className="cust-update-btn"
                                      onClick={() => setSelectedBillForPayment(b)}
                                    >
                                      <CreditCard size={13} /> Update
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="cust-ledger-loading">No bills recorded for this customer yet.</div>
                    )}
                  </>
                ) : (
                  <div className="cust-ledger-loading cust-ledger-error">Failed to load customer records.</div>
                )}
              </div>
              <div className="cust-modal-footer">
                <button type="button" className="cust-btn-neutral" onClick={() => setSelectedCustomerForLedger(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal opened from within Customer Ledger */}
      {selectedBillForPayment && (
        <PaymentModal
          show={Boolean(selectedBillForPayment)}
          bill={selectedBillForPayment}
          onClose={() => setSelectedBillForPayment(null)}
          onPaymentUpdated={() => {
            fetchCustomersAndOutstanding();
            if (selectedCustomerForLedger) {
              openCustomerLedger(selectedCustomerForLedger);
            }
          }}
        />
      )}
    </div>
  );
};

export default Customers;
