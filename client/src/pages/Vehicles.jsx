import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import {
  Plus, Edit, Trash2, Search, Shield, AlertTriangle,
  Car, Bike, ShieldCheck, ShieldAlert, X,
  AlertCircle, IdCard, UserRound, ChevronDown, Tag, Cog, CalendarClock, LoaderCircle, Check
} from 'lucide-react';
import './vehicles.css';
const twoWheelerBrands = [
  'Hero', 'Honda', 'TVS', 'Bajaj', 'Yamaha', 'Suzuki', 'Royal Enfield', 'KTM',
  'Jawa', 'Yezdi', 'Mahindra', 'BMW Motorrad', 'Triumph', 'Harley-Davidson',
  'Aprilia', 'Vespa', 'Piaggio', 'Ola Electric', 'Ather', 'Revolt',
  'Ultraviolette', 'Hero Electric', 'TVS iQube', 'Simple Energy', 'Vida',
  'Oben', 'River', 'Ampere', 'PURE EV', 'Lectrix EV', 'Okaya', 'Joy e-bike'
];
/* Search predicate for the customer selector: matches by name or phone number.
   A separate helper keeps the search logic identical for both modal modes. */
const matchesCustomerSearch = (customer, term) => {
  const name = (customer.name || '').toLowerCase();
  const phone = String(customer.mobile || '').toLowerCase();
  const digits = phone.replace(/\D/g, '');
  const termDigits = term.replace(/\D/g, '');
  return name.includes(term)
    || phone.includes(term)
    || (termDigits.length > 0 && digits.includes(termDigits));
};

/* ------------------------------------------------------------------
   Searchable customer selector.
   ONE shared component used by both the "Add New Vehicle" and the
   "Edit Vehicle" form — same UI, same behaviour, existing customer
   data only (no fake data, no API changes).
   ------------------------------------------------------------------ */
const CustomerSelect = ({ customers, value, onChange, disabled, inputId }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const selected = customers.find(c => c._id === value) || null;
  const term = query.trim().toLowerCase();
  const filtered = !term
    ? customers
    : customers.filter(c => matchesCustomerSearch(c, term));

  const closeMenu = () => {
    setOpen(false);
    setQuery('');
  };

  // Floats the list next to the field (never inside the scrollable modal body,
  // so it can never be clipped) and flips upwards when space below is short.
  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    if (!trigger) return undefined;

    const positionMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
      const spaceAbove = rect.top - gap - 12;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(150, Math.min(250, openUp ? spaceAbove : spaceBelow));
      setMenuStyle({
        position: 'fixed',
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        maxHeight,
        ...(openUp
          ? { bottom: Math.round(window.innerHeight - rect.top + gap) }
          : { top: Math.round(rect.bottom + gap) })
      });
    };

    positionMenu();

    const onDocMouseDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      closeMenu();
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') closeMenu(); };
    const onReflow = () => positionMenu();

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  const chooseCustomer = (id) => {
    onChange(id);
    closeMenu();
    triggerRef.current?.focus();
  };

  return (
    <div className="vh-input-wrap">
      <button
        ref={triggerRef}
        type="button"
        id={inputId}
        className={`vh-input vh-customer-trigger ${open ? 'is-open' : ''}`}
        onClick={() => (open ? closeMenu() : setOpen(true))}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="vh-customer-value">
            <span className="vh-customer-value-name">{selected.name}</span>
            {selected.mobile && <span className="vh-customer-value-phone">{selected.mobile}</span>}
          </span>
        ) : (
          <span className="vh-customer-placeholder">Select Customer</span>
        )}
      </button>
      <UserRound size={16} className="vh-input-icon" />
      <ChevronDown size={16} className={`vh-select-caret ${open ? 'is-open' : ''}`} />
      {/* Hidden mirror control — keeps the existing "Customer is required"
          rule and its native validation message while using the custom UI. */}
      <select
        className="vh-native-required"
        required
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={() => {}}
      >
        <option value="">Select Customer</option>
        {customers.map(c => (
          <option key={c._id} value={c._id}>{c.name} ({c.mobile})</option>
        ))}
      </select>

      {open && menuStyle && createPortal(
        <div className="vh-customer-menu" ref={menuRef} style={menuStyle}>
          <div className="vh-customer-search">
            <Search size={15} className="vh-customer-search-icon" />
            <input
              type="text"
              className="vh-customer-search-input"
              placeholder="Search customer by name or phone"
              value={query}
              autoFocus
              autoComplete="off"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  closeMenu();
                  triggerRef.current?.focus();
                } else if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  chooseCustomer(filtered[0]._id);
                }
              }}
            />
            {query && (
              <button
                type="button"
                className="vh-customer-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="vh-customer-list" role="listbox" aria-label="Customers">
            {filtered.length === 0 ? (
              <div className="vh-customer-empty">
                <UserRound size={16} />
                <span>No customers found</span>
              </div>
            ) : (
              filtered.map(c => {
                const isSelected = c._id === value;
                return (
                  <button
                    key={c._id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`vh-customer-option ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => chooseCustomer(c._id)}
                  >
                    <span className="vh-customer-option-avatar"><UserRound size={15} /></span>
                    <span className="vh-customer-option-text">
                      <span className="vh-customer-option-name">{c.name}</span>
                      {c.mobile && <span className="vh-customer-option-phone">{c.mobile}</span>}
                    </span>
                    {isSelected && <Check size={16} className="vh-customer-option-check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Helper to format ISO date to YYYY-MM-DD for date inputs
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  // Form state
  const [formData, setFormData] = useState({ 
    vehicleNumber: '', 
    vehicleType: '2 Wheeler', 
    brand: '', 
    model: '', 
    customer: '',
    insuranceExpiryDate: '',
    pucExpiryDate: '',
    nextServiceDate: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [validationMsg, setValidationMsg] = useState('');

  const fetchVehicles = async () => {
    try {
      const { data } = await api.get('/vehicles');
      setVehicles(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching vehicles', error);
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await api.get('/customers');
      setCustomers(data);
    } catch (error) {
      console.error('Error fetching customers', error);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchCustomers();
  }, []);

  // The page behind the modal must not scroll while the modal is open.
  useEffect(() => {
    if (!showModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  // Escape key closes the modal (disabled while a save is in flight).
  useEffect(() => {
    if (!showModal) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || saving) return;
      setModalClosing(true);
      window.setTimeout(() => {
        setModalClosing(false);
        setShowModal(false);
      }, 170);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showModal, saving]);

  // Single field updater shared by Add and Edit modes — keeps every other field
  // (including the edit pre-fill) untouched when one field changes.
  const setField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setValidationMsg('');
  };

  // Animated close — visual only, same end result as before.
  const closeModal = () => {
    if (saving) return;
    setModalClosing(true);
    window.setTimeout(() => {
      setModalClosing(false);
      setShowModal(false);
    }, 170);
  };

  // Live filter (partial match on vehicle number or customer name) + client-side filter tabs — defined in render below

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setValidationMsg('');
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/vehicles/${editingId}`, formData);
      } else {
        await api.post('/vehicles', formData);
      }
      setShowModal(false);
      resetForm();
      fetchVehicles();
    } catch (error) {
      alert(error.response?.data?.message || 'Error saving vehicle');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      vehicleNumber: '', 
      vehicleType: '2 Wheeler', 
      brand: '', 
      model: '', 
      customer: '',
      insuranceExpiryDate: '',
      pucExpiryDate: '',
      nextServiceDate: ''
    });
    setEditingId(null);
    setValidationMsg('');
  };

  const handleEdit = (vehicle) => {
    setFormData({
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType || '2 Wheeler',
      brand: vehicle.brand,
      model: vehicle.model,
      customer: vehicle.customer?._id || '',
      insuranceExpiryDate: formatDateForInput(vehicle.insuranceExpiryDate),
      pucExpiryDate: formatDateForInput(vehicle.pucExpiryDate),
      nextServiceDate: formatDateForInput(vehicle.nextServiceDate),
      ...(vehicle.currentKm !== undefined && vehicle.currentKm !== null ? { currentKm: vehicle.currentKm } : {})
    });
    setEditingId(vehicle._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      try {
        await api.delete(`/vehicles/${id}`);
        fetchVehicles();
      } catch (_error) {
        alert('Error deleting vehicle');
      }
    }
  };

  /* ---------- Insurance status helper (same threshold logic as before, reused for badges + filters) ---------- */
  const getInsuranceStatus = (dateStr) => {
    if (!dateStr) return 'none';
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((expDay - startOfToday) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring';
    return 'valid';
  };

  const getInsuranceBadge = (dateStr) => {
    const status = getInsuranceStatus(dateStr);
    if (status === 'none') {
      return <span className="vh-badge vh-badge-muted"><AlertTriangle size={11} /> Not Recorded</span>;
    }
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((expDay - startOfToday) / (1000 * 60 * 60 * 24));
    const formatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    if (status === 'expired') {
      return (
        <span className="vh-badge vh-badge-danger">
          <ShieldAlert size={11} /> Expired ({Math.abs(diffDays)}d ago)
        </span>
      );
    } else if (status === 'expiring') {
      return (
        <span className="vh-badge vh-badge-amber">
          <AlertTriangle size={11} /> Expiring in {diffDays}d
        </span>
      );
    } else {
      return (
        <span className="vh-badge vh-badge-success">
          <ShieldCheck size={11} /> Valid ({formatted})
        </span>
      );
    }
  };

  /* ---------- Summary cards (computed from existing data) + client-side filter toolbar ---------- */
  const [filterKey, setFilterKey] = useState('all');
  const isTwoWheeler = (v) => {
    const t = (v.vehicleType || '').toLowerCase();
    return t.includes('2') || t.includes('two');
  };
  const summary = (() => {
    const total = vehicles.length;
    let twoWheels = 0, valid = 0, expiring = 0;
    vehicles.forEach(v => {
      if (isTwoWheeler(v)) twoWheels++;
      const status = getInsuranceStatus(v.insuranceExpiryDate);
      if (status === 'valid') valid++;
      if (status === 'expiring') expiring++;
    });
    return { total, twoWheels, valid, expiring };
  })();

  const filterTabs = [
    { key: 'all', label: 'All Vehicles' },
    { key: 'two-wheeler', label: '2 Wheeler' },
    { key: 'insurance-valid', label: 'Insurance Valid' },
    { key: 'insurance-expiring', label: 'Expiring Soon' }
  ];
  const filterTabCounts = {
    all: summary.total,
    'two-wheeler': summary.twoWheels,
    'insurance-valid': summary.valid,
    'insurance-expiring': summary.expiring
  };

  // Live filter: partial match on vehicle number / customer name + active filter tab
  const filteredVehicles = vehicles.filter(vehicle => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const vehicleNumber = (vehicle.vehicleNumber || '').toLowerCase();
      const customerName = (vehicle.customer?.name || '').toLowerCase();
      if (!vehicleNumber.includes(query) && !customerName.includes(query)) return false;
    }
    if (filterKey === 'two-wheeler' && !isTwoWheeler(vehicle)) return false;
    if (filterKey === 'insurance-valid' && getInsuranceStatus(vehicle.insuranceExpiryDate) !== 'valid') return false;
    if (filterKey === 'insurance-expiring' && getInsuranceStatus(vehicle.insuranceExpiryDate) !== 'expiring') return false;
    return true;
  });

  const hasActiveSearchOrFilter = searchQuery.trim() !== '' || filterKey !== 'all';
  const TypeIcon = ({ vehicle }) => isTwoWheeler(vehicle) ? <Bike size={16} /> : <Car size={16} />;

  return (
    <div className="vh-page">
      {/* ---------- Page header (Matches Insurance Renewal style) ---------- */}
      <div className="vh-header">
        <div>
          <h2 className="vh-title">Vehicles</h2>
          <p className="vh-subtitle">Manage vehicle records, insurance policies, and service intervals</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <div className="vh-search">
            <Search size={16} className="vh-search-icon" />
            <input
              type="text"
              className="vh-search-input"
              placeholder="Search vehicle or customer (e.g. MH02)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="vh-search-clear" onClick={() => setSearchQuery('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className="btn btn-primary vh-btn-primary d-flex align-items-center gap-2"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
          >
            <Plus size={18} /> Add Vehicle
          </button>
        </div>
      </div>

      {/* ---------- Summary cards ---------- */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="vh-stat-card tone-blue">
            <div className="vh-stat-top">
              <span className="vh-stat-label">TOTAL VEHICLES</span>
              <span className="vh-stat-icon vh-tone-blue" aria-hidden="true">
                <Car size={20} />
              </span>
            </div>
            <div className="vh-stat-body">
              <div className="vh-stat-value">{summary.total}</div>
              <div className="vh-stat-sub">Registered fleet</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="vh-stat-card tone-purple">
            <div className="vh-stat-top">
              <span className="vh-stat-label">2 WHEELERS</span>
              <span className="vh-stat-icon vh-tone-purple" aria-hidden="true">
                <Bike size={20} />
              </span>
            </div>
            <div className="vh-stat-body">
              <div className="vh-stat-value">{summary.twoWheels}</div>
              <div className="vh-stat-sub">Bikes & scooters</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="vh-stat-card tone-green">
            <div className="vh-stat-top">
              <span className="vh-stat-label">INSURANCE VALID</span>
              <span className="vh-stat-icon vh-tone-green" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
            </div>
            <div className="vh-stat-body">
              <div className="vh-stat-value">{summary.valid}</div>
              <div className="vh-stat-sub">Active coverage</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="vh-stat-card tone-amber">
            <div className="vh-stat-top">
              <span className="vh-stat-label">EXPIRING SOON</span>
              <span className="vh-stat-icon vh-tone-amber" aria-hidden="true">
                <ShieldAlert size={20} />
              </span>
            </div>
            <div className="vh-stat-body">
              <div className="vh-stat-value">{summary.expiring}</div>
              <div className="vh-stat-sub">Due in 30 days</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Filter toolbar ---------- */}
      <div className="vh-toolbar d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div className="vh-filter-tabs d-flex flex-wrap align-items-center gap-2">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`vh-filter-tab ${filterKey === tab.key ? 'active' : ''}`}
              onClick={() => setFilterKey(tab.key)}
            >
              {tab.label}
              <span className="vh-filter-count">{filterTabCounts[tab.key]}</span>
            </button>
          ))}
        </div>
        <span className="vh-result-count">Showing {filteredVehicles.length} of {vehicles.length} vehicles</span>
      </div>

      {/* ---------- Vehicle table (desktop / tablet) ---------- */}
      <div className="vh-card">
        <div className="d-none d-lg-block">
          <div className="table-responsive">
            <table className="vh-table table align-middle mb-0">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Customer</th>
                <th>Brand &amp; Model</th>
                <th>Insurance</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-5 text-muted">Loading vehicles...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-5">
                    <div className="vh-empty">
                      <span className="vh-empty-icon"><Car size={26} /></span>
                      <h6 className="mb-1">No vehicles found</h6>
                      <p className="vh-empty-text mb-3">
                        {hasActiveSearchOrFilter
                          ? 'No vehicles match your search. Try a different number, customer, or filter.'
                          : 'Add your first vehicle to start tracking insurance and service reminders.'}
                      </p>
                      <button
                        className="btn btn-primary d-inline-flex align-items-center gap-2"
                        onClick={() => { resetForm(); setShowModal(true); }}
                      >
                        <Plus size={16} /> Add Vehicle
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map(vehicle => (
                  <tr key={vehicle._id} className="vh-row">
                    <td>
                      <span className="vh-vehicle-no">{vehicle.vehicleNumber}</span>
                    </td>
                    <td>
                      {vehicle.customer ? (
                        <>
                          <div className="vh-customer-name">{vehicle.customer.name}</div>
                          <small className="vh-muted-text">{vehicle.customer.mobile}</small>
                        </>
                      ) : 'N/A'}
                    </td>
                    <td><span className="vh-brand-model">{vehicle.brand} {vehicle.model}</span></td>
                    <td>{getInsuranceBadge(vehicle.insuranceExpiryDate)}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <button
                          className="vh-icon-btn"
                          onClick={() => handleEdit(vehicle)}
                          title="Edit vehicle & insurance details"
                          aria-label="Edit vehicle"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          className="vh-icon-btn vh-icon-danger"
                          onClick={() => handleDelete(vehicle._id)}
                          title="Delete vehicle"
                          aria-label="Delete vehicle"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ---------- Vehicle cards (mobile) ---------- */}
        <div className="d-lg-none p-3">
          {loading ? (
            <div className="vh-empty py-4"><span className="vh-empty-text">Loading vehicles...</span></div>
          ) : filteredVehicles.length === 0 ? (
            <div className="vh-empty py-4">
              <span className="vh-empty-icon"><Car size={26} /></span>
              <h6 className="mb-1">No vehicles found</h6>
              <p className="vh-empty-text mb-3">
                {hasActiveSearchOrFilter
                  ? 'No vehicles match your search. Try a different number, customer, or filter.'
                  : 'Add your first vehicle to start tracking insurance and service reminders.'}
              </p>
              <button
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                onClick={() => { resetForm(); setShowModal(true); }}
              >
                <Plus size={16} /> Add Vehicle
              </button>
            </div>
          ) : (
            <div className="vh-mobile-list">
              {filteredVehicles.map(vehicle => (
                <div key={vehicle._id} className="vh-mobile-card">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className="vh-vehicle-icon"><TypeIcon vehicle={vehicle} /></span>
                      <div>
                        <div className="vh-vehicle-no">{vehicle.vehicleNumber}</div>
                        <div className="vh-brand-model">{vehicle.brand} {vehicle.model}</div>
                      </div>
                    </div>
                    <span className="vh-type-badge"><TypeIcon vehicle={vehicle} /> {vehicle.vehicleType}</span>
                  </div>
                  <div className="mb-2">
                    {vehicle.customer ? (
                      <>
                        <div className="vh-customer-name">{vehicle.customer.name}</div>
                        <small className="vh-muted-text">{vehicle.customer.mobile}</small>
                      </>
                    ) : 'N/A'}
                  </div>
                  <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                    {getInsuranceBadge(vehicle.insuranceExpiryDate)}
                    <div className="d-flex gap-1">
                      <button
                        className="vh-icon-btn"
                        onClick={() => handleEdit(vehicle)}
                        title="Edit vehicle & insurance details"
                        aria-label="Edit vehicle"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        className="vh-icon-btn vh-icon-danger"
                        onClick={() => handleDelete(vehicle._id)}
                        title="Delete vehicle"
                        aria-label="Delete vehicle"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Modal for Add/Edit Vehicle — ONE shared premium form for both modes */}
      {showModal && (
        <div
          className={`modal show d-block vh-modal ${modalClosing ? 'vh-modal-closing' : ''}`}
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vh-modal-title"
        >
          <div className="modal-dialog vh-modal-dialog">
            <div className="modal-content vh-modal-content">
              <div className="vh-modal-header">
                <div className="vh-modal-heading">
                  <span className="vh-modal-icon"><Car size={18} /></span>
                  <div>
                    <h5 className="vh-modal-title" id="vh-modal-title">
                      {editingId ? 'Edit Vehicle' : 'Add New Vehicle'}
                    </h5>
                    <span className="vh-modal-subtitle">
                      {editingId
                        ? 'Update vehicle details and maintenance information'
                        : 'Add vehicle details and maintenance information'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="vh-modal-close"
                  onClick={closeModal}
                  disabled={saving}
                  title="Close"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="vh-modal-form"
                onSubmit={handleSubmit}
                onInvalid={() => setValidationMsg('Please complete all required fields below.')}
              >
                <div className="vh-modal-body">
                  {validationMsg && (
                    <div className="vh-form-alert" role="alert">
                      <AlertCircle size={15} /> {validationMsg}
                    </div>
                  )}

                  {/* ---------- Vehicle information (same layout in Add & Edit) ---------- */}
                  <section className="vh-section">
                    <div className="vh-section-head">
                      <h6 className="vh-section-title">Vehicle Information</h6>
                      <p className="vh-section-subtitle">Add the basic details of the vehicle</p>
                    </div>

                    <div className="vh-grid vh-grid-2">
                      <div className="vh-field">
                        <label className="vh-label" htmlFor="vh-vehicle-number">
                          Vehicle Number <span className="vh-req" aria-hidden="true">*</span>
                        </label>
                        <div className="vh-input-wrap">
                          <IdCard size={16} className="vh-input-icon" />
                          <input
                            id="vh-vehicle-number"
                            type="text"
                            className="vh-input"
                            required
                            autoComplete="off"
                            placeholder="e.g. MH02DM4014"
                            disabled={saving}
                            value={formData.vehicleNumber}
                            onChange={e => setField('vehicleNumber', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                          />
                        </div>
                        <small className="vh-hint">Registration number as printed on the plate</small>
                      </div>

                      <div className="vh-field">
                        <label className="vh-label" htmlFor="vh-customer">
                          Customer <span className="vh-req" aria-hidden="true">*</span>
                        </label>
                        <CustomerSelect
                          customers={customers}
                          value={formData.customer}
                          onChange={id => setField('customer', id)}
                          disabled={saving}
                          inputId="vh-customer"
                        />
                        <small className="vh-hint">Link this vehicle to its owner</small>
                      </div>
                    </div>
                    <div className="vh-grid vh-grid-3">
                      <div className="vh-field">
                        <label className="vh-label" htmlFor="vh-vehicle-type">
                          Vehicle Type <span className="vh-req" aria-hidden="true">*</span>
                        </label>
                        <div className="vh-input-wrap">
                          {formData.vehicleType === '4 Wheeler' ? (
                            <Car size={16} className="vh-input-icon" />
                          ) : (
                            <Bike size={16} className="vh-input-icon" />
                          )}
                          <select
                            id="vh-vehicle-type"
                            className="vh-input vh-select"
                            required
                            disabled={saving}
                            value={formData.vehicleType}
                            onChange={e => setField('vehicleType', e.target.value)}
                          >
                            <option value="2 Wheeler">2 Wheeler</option>
                            <option value="4 Wheeler">4 Wheeler</option>
                            <option value="Other">Other</option>
                          </select>
                          <ChevronDown size={16} className="vh-select-caret" />
                        </div>
                        <small className="vh-hint">Select vehicle category</small>
                      </div>

                      <div className="vh-field">
                        <label className="vh-label" htmlFor="vh-brand">
                          Brand <span className="vh-req" aria-hidden="true">*</span>
                        </label>
                        <div className="vh-input-wrap">
                          <Tag size={16} className="vh-input-icon" />
                          <input
                            id="vh-brand"
                            type="text"
                            className="vh-input"
                            required
                            autoComplete="off"
                            list="two-wheeler-brand-options"
                            placeholder="Type or choose a brand"
                            disabled={saving}
                            value={formData.brand}
                            onChange={e => setField('brand', e.target.value)}
                          />
                        </div>
                        <datalist id="two-wheeler-brand-options">
                          {twoWheelerBrands.map(brand => <option key={brand} value={brand} />)}
                        </datalist>
                        <small className="vh-hint">Type manually or pick from the list</small>
                      </div>

                      <div className="vh-field">
                        <label className="vh-label" htmlFor="vh-model">
                          Model <span className="vh-req" aria-hidden="true">*</span>
                        </label>
                        <div className="vh-input-wrap">
                          <Cog size={16} className="vh-input-icon" />
                          <input
                            id="vh-model"
                            type="text"
                            className="vh-input"
                            required
                            autoComplete="off"
                            placeholder="e.g. Activa, Splendor"
                            disabled={saving}
                            value={formData.model}
                            onChange={e => setField('model', e.target.value)}
                          />
                        </div>
                        <small className="vh-hint">Model name as per registration</small>
                      </div>
                    </div>
                  </section>

                  {/* ---------- Maintenance & renewal (separated section) ---------- */}
                  <section className="vh-section">
                    <div className="vh-section-head">
                      <h6 className="vh-section-title">Maintenance &amp; Renewal</h6>
                      <p className="vh-section-subtitle">Set expiry and service dates for automatic reminders</p>
                    </div>

                    {/* PUC Expiry Date is intentionally not part of the vehicle forms */}
                    <div className="vh-grid vh-grid-2">
                      <div className="vh-date-card">
                        <div className="vh-date-head">
                          <span className="vh-date-icon"><Shield size={15} /></span>
                          <label className="vh-label" htmlFor="vh-insurance-date">Insurance Expiry Date</label>
                        </div>
                        <input
                          id="vh-insurance-date"
                          type="date"
                          className="vh-input vh-input-date"
                          disabled={saving}
                          value={formData.insuranceExpiryDate}
                          onChange={e => setField('insuranceExpiryDate', e.target.value)}
                        />
                        <small className="vh-hint">Auto-synced with Insurance Renewal Hub</small>
                      </div>

                      <div className="vh-date-card">
                        <div className="vh-date-head">
                          <span className="vh-date-icon"><CalendarClock size={15} /></span>
                          <label className="vh-label" htmlFor="vh-next-service-date">Next Service Due Date</label>
                        </div>
                        <input
                          id="vh-next-service-date"
                          type="date"
                          className="vh-input vh-input-date"
                          disabled={saving}
                          value={formData.nextServiceDate}
                          onChange={e => setField('nextServiceDate', e.target.value)}
                        />
                        <small className="vh-hint">Periodic service schedule</small>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="vh-modal-footer">
                  <span className="vh-foot-note">
                    Fields marked <span className="vh-req" aria-hidden="true">*</span> are required
                  </span>
                  <div className="vh-foot-actions">
                    <button
                      type="button"
                      className="vh-btn-ghost"
                      onClick={closeModal}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="vh-btn-save" disabled={saving}>
                      {saving ? <LoaderCircle size={16} className="vh-spin" /> : <Check size={16} />}
                      {saving
                        ? (editingId ? 'Updating...' : 'Saving...')
                        : (editingId ? 'Update Vehicle' : 'Save Vehicle')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vehicles;
