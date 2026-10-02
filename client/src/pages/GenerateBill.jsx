import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { getFullImageUrl } from '../utils/api';
import {
  Plus, Trash2, QrCode, CheckCircle2, X, Maximize2, RefreshCw,
  Search, Receipt, CalendarDays
} from 'lucide-react';
import './generate-bill.css';

const QUICK_ADD_SERVICES = [
  { name: 'Diesel Wash', type: 'Other' },
  { name: 'Engine Oil', type: 'Part' },
  { name: 'Gear Oil', type: 'Part' },
  { name: 'Brake Oil', type: 'Part' },
  { name: 'Oil Filter', type: 'Part' },
  { name: 'Air Filter', type: 'Part' },
  { name: 'WD40 Spray', type: 'Part' },
  { name: 'Chain Lube and Cleaning', type: 'Part' },
  { name: 'Brake Linear FR', type: 'Part' },
  { name: 'Brake Linear RR', type: 'Part' },
  { name: 'Barring', type: 'Part' },
  { name: 'Shockup Bush', type: 'Part' },
  { name: 'Link Bush', type: 'Part' },
  { name: 'Labour Charge', type: 'Service' },
  { name: 'Polish', type: 'Part' },
  { name: 'Service Charge', type: 'Service' }
];

const GenerateBill = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const serviceId = queryParams.get('service') || queryParams.get('serviceId') || location.state?.serviceId || location.state?.service?._id || location.state?.service;

  const [searchQuery, setSearchQuery] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const searchInput = useRef(null);
  
  const [items, setItems] = useState([
    { description: '', itemDescription: '', quantity: 1, unitPrice: '', amount: '', type: 'Service' }
  ]);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [serviceDoc, setServiceDoc] = useState(null);

  // Payment Accounts state
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showEnlargeQrModal, setShowEnlargeQrModal] = useState(false);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showEnlargeQrModal) {
        setShowEnlargeQrModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEnlargeQrModal]);

  const fetchAllVehicles = async () => {
    try {
      const { data } = await api.get('/vehicles');
      setAllVehicles(data);
    } catch (err) {
      console.error('Error loading vehicles', err);
    }
  };

  const fetchPaymentAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data } = await api.get('/payment-accounts?active=true');
      const list = Array.isArray(data) ? data : [];
      setPaymentAccounts(list);
      if (list.length > 0) {
        const defaultAcc = list.find(a => a.isDefault) || list[0];
        setSelectedAccountId(defaultAcc._id);
      }
    } catch (err) {
      console.error('Error loading payment accounts', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchPaymentAccounts();
    fetchAllVehicles();
  }, []);

  const loadServiceData = async (id) => {
    try {
      const { data } = await api.get(`/services/${id}`);
      setServiceDoc(data);
      setVehicle(data.vehicle);
      
      // Auto-populate items from service
      setItems([
        { 
          description: data.workPerformed, 
          itemDescription: data.workPerformed, 
          quantity: 1, 
          unitPrice: data.serviceAmount, 
          amount: data.serviceAmount, 
          type: 'Service' 
        }
      ]);
    } catch (error) {
      console.error('Error loading service', error);
    }
  };

  useEffect(() => {
    if (serviceId) {
      loadServiceData(serviceId);
    }
  }, [serviceId]);

  const handleSearchVehicle = (queryOverride) => {
    const rawQuery = queryOverride !== undefined ? queryOverride : searchQuery;
    const query = rawQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults([]);
      setSearchMessage('');
      return;
    }
    const results = allVehicles.filter(v => {
      const vehicleNumber = (v.vehicleNumber || '').toLowerCase();
      const customerName = (v.customer?.name || '').toLowerCase();
      return vehicleNumber.includes(query) || customerName.includes(query);
    });
    setSearchResults(results);
    setSearchMessage(results.length === 0 ? `No vehicles found matching '${rawQuery.trim()}'.` : '');
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', itemDescription: '', quantity: 1, unitPrice: '', amount: '', type: 'Part' }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handlePriceChange = (index, value) => {
    const newItems = [...items];
    const price = Number(value) || 0;
    newItems[index].amount = value;
    newItems[index].unitPrice = value;
    newItems[index].totalPrice = price;
    newItems[index].quantity = 1;
    setItems(newItems);
  };

  const handleQuickAddToggle = (service) => {
    setItems(current => {
      const exists = current.some(item => item.description === service.name);
      if (exists) {
        return current.filter(item => item.description !== service.name);
      }
      return [...current, { description: service.name, itemDescription: '', quantity: 1, unitPrice: '', amount: 0, type: service.type }];
    });
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalAmount = subtotal - Number(discount);

  const selectedCustomerName = () => vehicle.customer?.name || serviceDoc?.customer?.name || '';

  const selectedVehicleName = () => {
    const brand = (vehicle?.brand || '').toString().trim();
    const model = (vehicle?.model || '').toString().trim();
    return [brand, model].filter(Boolean).join(' ');
  };

  const handleSelectVehicle = async (v) => {
    setVehicle(v);
    setSearchResults([]);
    setSearchMessage('');
    if (!serviceDoc && !serviceId && v?._id) {
      try {
        const { data: vehicleServices } = await api.get(`/services/vehicle/${v._id}`);
        if (Array.isArray(vehicleServices) && vehicleServices.length > 0) {
          const billResults = await Promise.all(
            vehicleServices.map(svc =>
              api.get(`/bills/service/${svc._id}`).catch(() => ({ data: [] }))
            )
          );
          const firstUnbilledIndex = billResults.findIndex(res => {
            const bills = res?.data;
            return !bills || (Array.isArray(bills) ? bills.length === 0 : !bills);
          });
          if (firstUnbilledIndex !== -1) {
            setServiceDoc(vehicleServices[firstUnbilledIndex]);
          }
        }
      } catch (err) {
        console.error('Could not check vehicle services:', err);
      }
    }
  };

  const handleChangeVehicle = () => {
    setVehicle(null);
    if (!serviceId) {
      setServiceDoc(null);
    }
    setSearchQuery('');
    setSearchResults([]);
    setSearchMessage('');
    searchInput.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vehicle) {
      alert('Please search and select a customer and vehicle first.');
      return;
    }
    if (!billDate) {
      alert('Please select a bill date.');
      return;
    }
    
    // Validate items
    const validItems = items.filter(item => item.description.trim() !== '' && Number(item.amount) > 0);
    if (validItems.length === 0) {
      alert('Please add at least one valid item to the bill.');
      return;
    }
    
    try {
      const payload = {
        customer: vehicle.customer._id || vehicle.customer,
        vehicle: vehicle._id,
        date: billDate,
        service: serviceDoc ? serviceDoc._id : (serviceId || undefined),
        items: validItems,
        discount: Number(discount),
        paidAmount: Number(paidAmount),
        paymentAccount: selectedAccountId || undefined
      };
      
      const { data } = await api.post('/bills', payload);
      alert('Bill Generated Successfully!');
      navigate(`/bills/view/${data._id}`);
      
    } catch (error) {
      alert(error.response?.data?.message || 'Error generating bill');
    }
  };

  const selectedAccount = paymentAccounts.find(a => a._id === selectedAccountId);

  return (
    <div className="gb-page">
      {/* ---------- Page header (left aligned) ---------- */}
      <div className="gb-header">
        <div className="gb-header-titles">
          <h2 className="gb-title">Generate Bill</h2>
          <p className="gb-subtitle">
            Select a customer &amp; vehicle, add the items and generate the invoice.
          </p>
        </div>
        {vehicle && (
          <span className="gb-header-chip">
            <CheckCircle2 size={14} /> Ready to generate
          </span>
        )}
      </div>

      {!serviceDoc && (
        <section className="gb-card">
          <div className="gb-step-head">
            <span className="gb-step-icon"><Search size={18} /></span>
            <div className="gb-step-text">
              <span className="gb-step-label">Search Customer / Vehicle</span>
              <p className="gb-step-hint">Search by customer name or vehicle number to continue.</p>
            </div>
          </div>

          <div>
            <label className="gb-label" htmlFor="bill-search-customer-vehicle">Customer or vehicle</label>
            <div className="gb-search">
              <Search size={18} />
              <input
                ref={searchInput}
                id="bill-search-customer-vehicle"
                type="text"
                className="gb-input gb-search-input"
                placeholder="Search by customer name or vehicle number"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  handleSearchVehicle(e.target.value);
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
              />
            </div>

            {searchMessage && (
              <p className="gb-search-message">{searchMessage}</p>
            )}

            {searchResults.length > 0 && (
              <div className="gb-results">
                {searchResults.map(v => (
                  <button
                    key={v._id}
                    type="button"
                    className="gb-result-item"
                    onClick={() => handleSelectVehicle(v)}
                  >
                    <span className="gb-result-main">
                      <span className="gb-result-name">{v.customer?.name || 'Customer'}</span>
                    </span>
                    <span className="gb-result-vehicle">{v.vehicleNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {vehicle && (
        <section className="gb-card gb-card-selected">
          <div className="gb-step-head">
            <span className="gb-step-icon gb-step-icon-green"><CheckCircle2 size={18} /></span>
            <div className="gb-step-text">
              <span className="gb-step-label">Selected Customer &amp; Vehicle</span>
              <p className="gb-step-hint">These details will be printed on the generated invoice.</p>
            </div>
            {!serviceDoc && (
              <div className="gb-step-action">
                <button type="button" className="gb-ghost-btn" onClick={handleChangeVehicle}>
                  <RefreshCw size={14} /> Change Vehicle
                </button>
              </div>
            )}
          </div>

          <div className="gb-info-grid">
            <div className="gb-info-tile">
              <span className="gb-info-label">Customer Name</span>
              <span className="gb-info-value">{selectedCustomerName()}</span>
            </div>
            <div className="gb-info-tile">
              <span className="gb-info-label">Vehicle Number</span>
              <span className="gb-plate">{vehicle.vehicleNumber}</span>
            </div>
            <div className="gb-info-tile gb-info-tile-wide">
              <span className="gb-info-label">Vehicle Name / Model</span>
              <span className="gb-info-value">{selectedVehicleName()}</span>
            </div>
          </div>
        </section>
      )}

      {vehicle && (
        <section className="gb-card">
          <div className="gb-step-head">
            <span className="gb-step-icon"><CalendarDays size={18} /></span>
            <div className="gb-step-text">
              <span className="gb-step-label">
                <span className="gb-step-num">02</span> — Bill Details
              </span>
              <p className="gb-step-hint">Choose the date that should appear on the invoice.</p>
            </div>
          </div>

          <div className="gb-form-grid">
            <div>
              <label className="gb-label" htmlFor="bill-date">Bill Date *</label>
              <input
                id="bill-date"
                type="date"
                className="gb-input"
                required
                value={billDate}
                onChange={e => setBillDate(e.target.value)}
              />
            </div>
          </div>
        </section>
      )}

      {vehicle && (
        <>
          {/* Payment Account Selection Card */}
          <section className="gb-card">
            <div className="gb-step-head">
              <span className="gb-step-icon"><QrCode size={18} /></span>
              <div className="gb-step-text">
                <span className="gb-step-label">Customer Payment Account / QR Code</span>
                <p className="gb-step-hint">Pick the account (UPI / QR) that will be printed on this bill.</p>
              </div>
              {paymentAccounts.length > 0 && (
                <div className="gb-step-action">
                  <span className="badge bg-secondary">
                    {paymentAccounts.length} Account{paymentAccounts.length > 1 ? 's' : ''} Configured
                  </span>
                </div>
              )}
            </div>
            <div>
              {loadingAccounts ? (
                <div className="text-muted small">Loading payment accounts...</div>
              ) : paymentAccounts.length === 0 ? (
                <div className="alert alert-warning py-2 small mb-0">
                  No payment accounts configured yet. Configure up to 4 accounts in <strong>Payments {'>'} Payment Accounts Settings</strong>.
                </div>
              ) : (
                <div className="gb-form-grid">
                  <div>
                    <label className="gb-label">Choose which payment account / QR code this bill will display</label>
                    <div className="gb-account-list">
                      {paymentAccounts.map((acc) => {
                        const isSelected = selectedAccountId === acc._id;
                        return (
                          <div
                            key={acc._id}
                            onClick={() => setSelectedAccountId(acc._id)}
                            className={`gb-account-option${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="gb-account-main">
                              <input
                                type="radio"
                                name="paymentAccountOption"
                                checked={isSelected}
                                onChange={() => setSelectedAccountId(acc._id)}
                                className="gb-account-check"
                              />
                              <div>
                                <span className="gb-account-name">{acc.name}</span>{' '}
                                <span className="badge bg-secondary small">{acc.paymentType}</span>
                                {acc.isDefault && <span className="badge bg-success ms-1 small">Default</span>}
                                {acc.upiId && <div className="gb-account-upi">{acc.upiId}</div>}
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 size={18} className="gb-account-check" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Account Live Preview Box */}
                  <div>
                    {selectedAccount ? (
                      <div className="gb-preview">
                        <div className="gb-preview-title">Live Account Preview</div>
                        <div className="gb-preview-name">{selectedAccount.name}</div>
                        <div><span className="badge bg-secondary small">{selectedAccount.paymentType}</span></div>
                        
                        {selectedAccount.qrCodeUrl ? (
                          <>
                            <button
                              type="button"
                              className="gb-preview-qr-btn"
                              onClick={() => setShowEnlargeQrModal(true)}
                              title={`View ${selectedAccount.name} QR code - Click to enlarge`}
                              aria-label={`View ${selectedAccount.name} QR code enlarged`}
                            >
                              <img
                                src={getFullImageUrl(selectedAccount.qrCodeUrl)}
                                alt={`${selectedAccount.name} QR Preview`}
                              />
                              <span className="gb-preview-zoom"><Maximize2 size={12} /></span>
                            </button>
                            <button
                              type="button"
                              className="gb-preview-link"
                              onClick={() => setShowEnlargeQrModal(true)}
                            >
                              Click QR to enlarge
                            </button>
                          </>
                        ) : (
                          <div className="gb-preview-empty">No QR Image (UPI ID only)</div>
                        )}

                        {selectedAccount.upiId && (
                          <div className="gb-preview-upi">{selectedAccount.upiId}</div>
                        )}

                        {selectedAccount.instructions && (
                          <div className="gb-preview-note">"{selectedAccount.instructions}"</div>
                        )}
                      </div>
                    ) : (
                      <div className="gb-preview-empty">No account selected.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Centered Enlarged QR Modal / Lightbox */}
          {showEnlargeQrModal && selectedAccount && selectedAccount.qrCodeUrl && (
            <div 
              className="modal show d-block" 
              tabIndex="-1" 
              role="dialog"
              aria-modal="true"
              aria-label={`Enlarged ${selectedAccount.name} QR code`}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
              onClick={(e) => {
                // Click outside modal card closes it
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
                    {/* Account Name Header */}
                    <h4 className="fw-bold text-dark mb-1">{selectedAccount.name}</h4>
                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle mb-3">
                      {selectedAccount.paymentType}
                    </span>

                    {/* Sharp, Large QR Container */}
                    <div 
                      className="p-3 bg-white rounded-3 border d-inline-block shadow-sm mb-3"
                      style={{ maxWidth: '100%' }}
                    >
                      <img
                        src={getFullImageUrl(selectedAccount.qrCodeUrl)}
                        alt={`${selectedAccount.name} QR Code`}
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

                    {/* UPI ID */}
                    {selectedAccount.upiId && (
                      <div className="bg-light p-2 rounded-3 border d-inline-block mb-2 px-3">
                        <span className="text-muted small me-1">UPI:</span>
                        <span className="font-monospace fw-bold fs-6 text-dark">{selectedAccount.upiId}</span>
                      </div>
                    )}

                    {/* Instructions */}
                    {selectedAccount.instructions && (
                      <div className="text-muted small mt-1 fst-italic px-3">
                        "{selectedAccount.instructions}"
                      </div>
                    )}
                  </div>

                  <div className="modal-footer border-0 pt-0 pb-3 justify-content-center">
                    <button
                      type="button"
                      className="btn btn-secondary px-4 rounded-pill"
                      onClick={() => setShowEnlargeQrModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bill Items Card */}
          <section className="gb-card">
            <div className="gb-step-head">
              <span className="gb-step-icon"><Receipt size={18} /></span>
              <div className="gb-step-text">
                <span className="gb-step-label">
                  <span className="gb-step-num">03</span> — Bill Items
                </span>
                <p className="gb-step-hint">Tick a quick-add service below, or add items manually.</p>
              </div>
            </div>

              {/* Quick Add Basic Services */}
              <div className="gb-section-gap">
                <label className="gb-label">Quick Add Basic Services</label>
                <div className="gb-chips">
                  {QUICK_ADD_SERVICES.map(service => {
                    const checked = items.some(item => item.description === service.name);
                    const checkboxId = `quick-add-${service.name.replace(/\s+/g, '-')}`;
                    return (
                      <label className={`gb-chip${checked ? ' is-on' : ''}`} htmlFor={checkboxId} key={service.name}>
                        <input
                          type="checkbox"
                          id={checkboxId}
                          checked={checked}
                          onChange={() => handleQuickAddToggle(service)}
                        />
                        {service.name}
                      </label>
                    );
                  })}
                </div>
              </div>
              
              <div className="gb-items-wrap">
                <table className="gb-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Item / Service</th>
                      <th style={{ width: '120px' }}>Type</th>
                      <th style={{ width: '160px' }}>Item / Service Price (₹)</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="text-center"><span className="gb-table-num">{index + 1}</span></td>
                        <td>
                          <input
                            type="text"
                            className="gb-table-input"
                            placeholder="Item / Service name"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <select
                            className="gb-table-select"
                            value={item.type}
                            onChange={(e) => handleItemChange(index, 'type', e.target.value)}
                          >
                            <option value="Service">Service</option>
                            <option value="Part">Part</option>
                            <option value="Labour">Labour</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="gb-table-input is-amount"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={(e) => handlePriceChange(index, e.target.value)}
                            required
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="gb-row-del"
                            onClick={() => handleRemoveItem(index)}
                            disabled={items.length === 1}
                            title="Remove item"
                            aria-label="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className="gb-add-item" onClick={handleAddItem}>
                <Plus size={16} /> Add Item
              </button>

              <h6 className="gb-label gb-summary-heading" style={{ fontSize: '12px' }}>
                <span className="gb-step-num">04</span> — Payment &amp; Summary
              </h6>

              <div className="gb-summary">
                <div className="gb-summary-rows">
                  <div className="gb-summary-row">
                    <span className="gb-summary-row-label">Subtotal</span>
                    <span className="gb-summary-value">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="gb-summary-row">
                    <span className="gb-summary-row-label">Discount (₹)</span>
                    <input
                      type="number"
                      className="gb-input"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                  <div className="gb-summary-row is-divided">
                    <span className="gb-summary-row-label">Amount Paid Now (₹)</span>
                    <input
                      type="number"
                      className="gb-input"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                    />
                  </div>
                  <p className="gb-summary-hint">
                    Outstanding balance is calculated as Grand Total minus the amount paid now.
                  </p>
                </div>
                <div className="gb-summary-total">
                  <div className="gb-summary-total-label">Grand Total</div>
                  <div className="gb-summary-total-value">₹{totalAmount.toFixed(2)}</div>
                  <button type="button" className="gb-submit-btn" onClick={handleSubmit}>
                    Generate Bill
                  </button>
                </div>
              </div>
          </section>
        </>
      )}
    </div>
  );
};

export default GenerateBill;