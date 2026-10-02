import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { getFullImageUrl } from '../utils/api';
import { useSmartBack } from '../utils/navigation';
import {
  Plus, Trash2, QrCode, X, CalendarDays, ArrowLeft
} from 'lucide-react';
import './generate-bill.css';

const toDateInputValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const customerIdOf = (vehicle) => vehicle.customer?._id || vehicle.customer;

const EditBill = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const handleBack = useSmartBack('/bills');
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showEnlargeQrModal, setShowEnlargeQrModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showEnlargeQrModal) {
        setShowEnlargeQrModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEnlargeQrModal]);
  const [form, setForm] = useState({
    billNumber: '',
    customer: '',
    vehicle: '',
    service: '',
    date: '',
    items: [{ description: '', itemDescription: '', quantity: 1, unitPrice: '', amount: '', type: 'Service' }],
    discount: 0,
    paidAmount: 0,
    status: 'Pending',
    paymentAccount: ''
  });

  useEffect(() => {
    const loadBillEditor = async () => {
      try {
        const [billResponse, customersResponse, vehiclesResponse, servicesResponse, accountsResponse] = await Promise.all([
          api.get(`/bills/${id}`),
          api.get('/customers'),
          api.get('/vehicles'),
          api.get('/services'),
          api.get('/payment-accounts').catch(() => ({ data: [] }))
        ]);
        const bill = billResponse.data;
        setCustomers(customersResponse.data);
        setVehicles(vehiclesResponse.data);
        setServices(servicesResponse.data);
        setPaymentAccounts(Array.isArray(accountsResponse.data) ? accountsResponse.data : []);
        setForm({
          billNumber: bill.billNumber,
          customer: bill.customer?._id || bill.customer,
          vehicle: bill.vehicle?._id || bill.vehicle,
          service: bill.service?._id || bill.service || '',
          date: toDateInputValue(bill.date),
          items: bill.items.map(item => ({ description: item.description, itemDescription: item.itemDescription || '', quantity: item.quantity || 1, unitPrice: item.unitPrice || item.amount, amount: item.amount, type: item.type })),
          discount: bill.discount || 0,
          paidAmount: bill.paidAmount || 0,
          status: bill.status,
          paymentAccount: bill.paymentAccount?._id || bill.paymentAccount || ''
        });
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load this bill for editing.');
      } finally {
        setLoading(false);
      }
    };

    loadBillEditor();
  }, [id]);

  const customerVehicles = useMemo(
    () => vehicles.filter(vehicle => customerIdOf(vehicle) === form.customer),
    [vehicles, form.customer]
  );
  const vehicleServices = useMemo(
    () => services.filter(service => (service.vehicle?._id || service.vehicle) === form.vehicle),
    [services, form.vehicle]
  );
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalAmount = subtotal - (Number(form.discount) || 0);
  const effectivePaidAmount = form.status === 'Paid' ? totalAmount : form.status === 'Pending' ? 0 : Number(form.paidAmount);
  const selectedPaymentAccount = form.paymentAccount
    ? paymentAccounts.find(acc => acc._id === form.paymentAccount)
    : paymentAccounts.find(acc => acc.isDefault) || null;

  const accountDisplay = useMemo(() => {
    if (!selectedPaymentAccount) return null;
    const method = selectedPaymentAccount.paymentType || 'Payment Method';
    let name = (selectedPaymentAccount.name || '').trim();
    if (selectedPaymentAccount.paymentType) {
      const typeRegex = new RegExp(`^${selectedPaymentAccount.paymentType}\\s*`, 'i');
      if (typeRegex.test(name)) {
        name = name.replace(typeRegex, '').trim();
      } else {
        const typeRegexEnd = new RegExp(`\\s*${selectedPaymentAccount.paymentType}$`, 'i');
        if (typeRegexEnd.test(name)) {
          name = name.replace(typeRegexEnd, '').trim();
        }
      }
    }
    return {
      method,
      name: name || selectedPaymentAccount.name,
      upiId: selectedPaymentAccount.upiId
    };
  }, [selectedPaymentAccount]);

    const updateItem = (index, field, value) => {
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  };

  const handleCustomerChange = (customer) => {
    setForm(current => ({ ...current, customer, vehicle: '', service: '' }));
  };

  const handleVehicleChange = (vehicle) => {
    const selectedVehicle = vehicles.find(item => item._id === vehicle);
    setForm(current => ({
      ...current,
      vehicle,
      customer: selectedVehicle ? customerIdOf(selectedVehicle) : current.customer,
      service: ''
    }));
  };

  const handleStatusChange = (status) => {
    setForm(current => ({
      ...current,
      status,
      paidAmount: status === 'Paid' ? totalAmount : status === 'Pending' ? 0 : current.paidAmount
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const validItems = form.items.filter(item => item.description.trim() && Number(item.amount) > 0);

    if (!form.customer || !form.vehicle || validItems.length !== form.items.length) {
      setError('Select a customer and vehicle, and complete every bill item with a positive amount.');
      return;
    }
    if (Number(form.discount) < 0 || totalAmount < 0 || effectivePaidAmount < 0 || effectivePaidAmount > totalAmount) {
      setError('Please enter valid non-negative amounts. Paid amount cannot exceed the total.');
      return;
    }
    if (form.status === 'Partial' && (effectivePaidAmount <= 0 || effectivePaidAmount >= totalAmount)) {
      setError('A partial bill needs a paid amount greater than zero and less than the total.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/bills/${id}`, {
        ...form,
        items: validItems.map(item => ({ ...item, amount: Number(item.amount) })),
        discount: Number(form.discount),
        paidAmount: effectivePaidAmount,
        service: form.service || null,
        paymentAccount: form.paymentAccount || null
      });
      navigate('/bills', { state: { successMessage: 'Bill updated successfully.' } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update the bill. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center p-5">Loading bill...</div>;
  if (error && !form.billNumber) return <div className="alert alert-danger" role="alert">{error}</div>;

  return (
    <div className="gb-page">
      {/* ---------- Page header ---------- */}
      <div className="gb-header">
        <div className="gb-header-titles">
          <h2 className="gb-title">Edit Bill</h2>
          <p className="gb-subtitle">
            Update the customer, items and payment details for bill {form.billNumber}.
          </p>
        </div>
        <button type="button" className="gb-ghost-btn" onClick={handleBack}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* ---------- 01 — Customer & Vehicle ---------- */}
        <section className="gb-card">
          <div className="gb-step-head">
            <span className="gb-step-icon"><CalendarDays size={18} /></span>
            <div className="gb-step-text">
              <span className="gb-step-label">
                <span className="gb-step-num">01</span> — Customer &amp; Vehicle
              </span>
              <p className="gb-step-hint">These details will be printed on the updated invoice.</p>
            </div>
          </div>

          <div className="gb-form-grid">
            <div className="gb-field">
              <label className="gb-label" htmlFor="edit-bill-customer">Customer *</label>
              <select
                id="edit-bill-customer"
                className="gb-input"
                value={form.customer}
                onChange={event => handleCustomerChange(event.target.value)}
                required
              >
                <option value="">Select Customer</option>
                {customers.map(customer => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name} ({customer.mobile})
                  </option>
                ))}
              </select>
            </div>

            <div className="gb-field">
              <label className="gb-label" htmlFor="edit-bill-vehicle">Vehicle *</label>
              <select
                id="edit-bill-vehicle"
                className="gb-input"
                value={form.vehicle}
                onChange={event => handleVehicleChange(event.target.value)}
                required
                disabled={!form.customer}
              >
                <option value="">Select Vehicle</option>
                {customerVehicles.map(vehicle => (
                  <option key={vehicle._id} value={vehicle._id}>
                    {vehicle.vehicleNumber} — {vehicle.brand} {vehicle.model}
                  </option>
                ))}
              </select>
            </div>

            <div className="gb-field">
              <label className="gb-label" htmlFor="edit-bill-service">Service Record</label>
              <select
                id="edit-bill-service"
                className="gb-input"
                value={form.service}
                onChange={event => setForm(current => ({ ...current, service: event.target.value }))}
                disabled={!form.vehicle}
              >
                <option value="">No linked service record</option>
                {vehicleServices.map(service => (
                  <option key={service._id} value={service._id}>
                    {new Date(service.serviceDate).toLocaleDateString()} — {service.workPerformed}
                  </option>
                ))}
              </select>
            </div>

            <div className="gb-field">
              <label className="gb-label" htmlFor="edit-bill-date">Bill Date *</label>
              <input
                id="edit-bill-date"
                type="date"
                className="gb-input"
                value={form.date}
                onChange={event => setForm(current => ({ ...current, date: event.target.value }))}
                required
              />
            </div>

            <div className="gb-field-full">
              <div className="gb-payment-box">
                <div className="gb-payment-box-main">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <QrCode size={16} className="text-primary" />
                    <label className="gb-label mb-0" htmlFor="edit-bill-payment-account">
                      Payment Account / QR Code
                    </label>
                  </div>
                  <p className="gb-hint mb-2">
                    Choose which payment QR code and UPI details are attached to this bill.
                  </p>
                  <select
                    id="edit-bill-payment-account"
                    className="gb-input"
                    value={form.paymentAccount}
                    onChange={event => setForm(current => ({ ...current, paymentAccount: event.target.value }))}
                  >
                    <option value="">None / Default Primary</option>
                    {paymentAccounts.map(account => (
                      <option key={account._id} value={account._id}>
                        {account.name} ({account.paymentType}){account.upiId ? ` — UPI: ${account.upiId}` : ''}{account.isDefault ? ' [Default]' : ''}{!account.isActive ? ' (Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gb-payment-preview-card">
                  {selectedPaymentAccount && accountDisplay ? (
                    <div className="gb-payment-preview-content">
                      <div className="gb-pm-details">
                        <div className="gb-pm-method">{accountDisplay.method}</div>
                        <div className="gb-pm-name">{accountDisplay.name}</div>
                        {accountDisplay.upiId && (
                          <div className="gb-pm-upi">
                            <span className="gb-pm-upi-label">UPI ID:</span>{' '}
                            <span className="gb-pm-upi-val">{accountDisplay.upiId}</span>
                          </div>
                        )}
                      </div>
                      {selectedPaymentAccount.qrCodeUrl ? (
                        <div className="gb-pm-qr-col">
                          <button
                            type="button"
                            className="gb-pm-qr-btn"
                            onClick={() => setShowEnlargeQrModal(true)}
                            title="Click to enlarge QR code"
                          >
                            <img
                              src={getFullImageUrl(selectedPaymentAccount.qrCodeUrl)}
                              alt={`${selectedPaymentAccount.name} QR`}
                              className="gb-pm-qr-thumb"
                            />
                          </button>
                          <button
                            type="button"
                            className="gb-pm-view-qr"
                            onClick={() => setShowEnlargeQrModal(true)}
                          >
                            View QR
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="gb-payment-preview-empty">
                      <QrCode size={22} className="text-muted opacity-50" />
                      <span className="text-muted small">Default primary QR &amp; UPI will be printed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </section>

        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title mb-3">Bill Items</h5>
            <div className="table-responsive mb-3">
              <table className="table table-bordered">
                <thead className="table-light"><tr><th style={{ width: '40px' }}>#</th><th>Item / Service</th><th style={{ width: '120px' }}>Type</th><th style={{ width: '160px' }}>Item / Service Price (₹)</th><th style={{ width: '50px' }}></th></tr></thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td className="text-center text-muted">{index + 1}</td>
                      <td><input className="form-control form-control-sm" value={item.description} onChange={event => updateItem(index, 'description', event.target.value)} required /></td>
                      <td><select className="form-select form-select-sm" value={item.type} onChange={event => updateItem(index, 'type', event.target.value)}><option value="Service">Service</option><option value="Part">Part</option><option value="Labour">Labour</option><option value="Other">Other</option></select></td>
                      <td><input type="number" min="0" step="0.01" className="form-control form-control-sm text-end" value={item.amount} onChange={event => { const price = event.target.value; updateItem(index, 'amount', price); updateItem(index, 'unitPrice', price); updateItem(index, 'totalPrice', price); updateItem(index, 'quantity', 1); }} required /></td>
                      <td className="text-center"><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} disabled={form.items.length === 1}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary mb-4" onClick={() => setForm(current => ({ ...current, items: [...current.items, { description: '', itemDescription: '', quantity: 1, unitPrice: '', amount: '', type: 'Part' }] }))}><Plus size={16} /> Add Item</button>

            <div className="row justify-content-end"><div className="col-md-5">
              <div className="d-flex justify-content-between mb-2"><span>Subtotal:</span><span className="fw-bold">₹{subtotal.toFixed(2)}</span></div>
              <div className="d-flex justify-content-between mb-2 align-items-center"><span>Discount (₹):</span><input type="number" min="0" step="0.01" className="form-control form-control-sm text-end w-50" value={form.discount} onChange={event => setForm(current => ({ ...current, discount: event.target.value }))} /></div>
              <hr />
              <div className="d-flex justify-content-between mb-3 fs-5"><strong>Grand Total:</strong><strong className="text-primary">₹{totalAmount.toFixed(2)}</strong></div>
              <div className="d-flex justify-content-between mb-3 align-items-center"><span>Payment Status:</span><select className="form-select w-50" value={form.status} onChange={event => handleStatusChange(event.target.value)}><option value="Pending">Pending</option><option value="Partial">Partial</option><option value="Paid">Paid</option></select></div>
              <div className="d-flex justify-content-between mb-4 align-items-center"><span>Amount Paid (₹):</span><input type="number" min="0" step="0.01" className="form-control text-end w-50" value={form.status === 'Paid' ? totalAmount : form.paidAmount} disabled={form.status !== 'Partial'} onChange={event => setForm(current => ({ ...current, paidAmount: event.target.value }))} /></div>
              <div className="d-grid"><button type="submit" className="btn btn-success btn-lg" disabled={saving}>{saving ? 'Saving Changes...' : 'Save Changes'}</button></div>
            </div></div>
          </div>
        </div>
      </form>

      {/* Centered Enlarged QR Modal / Lightbox */}
      {showEnlargeQrModal && selectedPaymentAccount && selectedPaymentAccount.qrCodeUrl && (
        <div 
          className="modal show d-block" 
          tabIndex="-1" 
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged ${selectedPaymentAccount.name} QR code`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEnlargeQrModal(false);
            }
          }}
        >
          <div 
            className="modal-dialog modal-dialog-centered" 
            style={{ maxWidth: '440px', margin: '1.75rem auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-4 overflow-hidden">
              <div className="modal-header border-0 pb-0 pt-3 px-3 d-flex justify-content-between align-items-center">
                <span className="badge bg-light text-muted border small">QR Code Preview</span>
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center p-1"
                  onClick={() => setShowEnlargeQrModal(false)}
                  aria-label="Close QR modal"
                  style={{ width: '32px', height: '32px' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body text-center px-4 pt-2 pb-4">
                <h4 className="fw-bold text-dark mb-1">{selectedPaymentAccount.name}</h4>
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle mb-3">
                  {selectedPaymentAccount.paymentType}
                </span>

                <div 
                  className="p-3 bg-white rounded-3 border d-inline-block shadow-sm mb-3"
                  style={{ maxWidth: '100%' }}
                >
                  <img
                    src={getFullImageUrl(selectedPaymentAccount.qrCodeUrl)}
                    alt={`${selectedPaymentAccount.name} QR Code`}
                    className="img-fluid"
                    style={{
                      width: '100%',
                      maxWidth: '340px',
                      maxHeight: '340px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </div>

                {selectedPaymentAccount.upiId && (
                  <div className="bg-light p-2 rounded-3 border d-inline-block mb-2 px-3">
                    <span className="text-muted small me-1">UPI:</span>
                    <span className="font-monospace fw-bold fs-6 text-dark">{selectedPaymentAccount.upiId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditBill;