import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { Search, Wrench, X, ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const pad2 = (n) => String(n).padStart(2, '0');

// Date object → ISO (YYYY-MM-DD)
const toISO = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// ISO (YYYY-MM-DD) → display (DD-MM-YYYY)
const formatDisplay = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad2(d)}-${pad2(m)}-${y}`;
};

// Accepts DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY and YYYY-MM-DD.
// Returns a real Date object only when the calendar date is valid (rejects e.g. 31-02-2026).
const parseDateInput = (text) => {
  const value = (text || '').trim();
  if (!value) return null;
  let d, m, y;
  let match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else {
    match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
};

// Modal form used by the Services page ("Add New Service").
// The service is always connected to an existing Vehicle (and its Customer),
// so the customer/vehicle fields are read-only and populated from a search result.
const AddService = ({ onClose, onSaved }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchInput = useRef(null);
  const [formData, setFormData] = useState(() => ({
    serviceDate: getToday(),
    workPerformed: '',
    nextServiceDate: ''
  }));

  // Manual date entry — formData.serviceDate always holds the canonical ISO
  // value (YYYY-MM-DD); dateInput is what the user sees/types (DD-MM-YYYY).
  const [dateInput, setDateInput] = useState(() => formatDisplay(getToday()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerView, setPickerView] = useState(() => new Date());
  const datePickerWrap = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    searchInput.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Close the calendar popover when clicking anywhere outside the field.
  useEffect(() => {
    if (!datePickerOpen) return undefined;
    const onDocMouseDown = (e) => {
      if (datePickerWrap.current && !datePickerWrap.current.contains(e.target)) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [datePickerOpen]);

  // Live search as the user types (customer name or vehicle number, partial match).
  useEffect(() => {
    if (!searchQuery.trim() || vehicle) return;

    // Ignore stale responses when the query changes or the modal closes.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/vehicles/search/${encodeURIComponent(searchQuery.trim())}`, {
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        const results = (Array.isArray(data) ? data : []).filter(
          result => result._id && result.vehicleNumber && result.customer?._id && result.customer?.name
        );
        setSearchResults(results);
        setSearchMessage(results.length ? '' : 'No matching customer or vehicle found.');
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchMessage(err.response?.status === 404
          ? 'No matching customer or vehicle found.'
          : 'Unable to search vehicles. Please try again.');
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, vehicle]);

  // Manual typing: keep the raw text for display and mirror the canonical
  // ISO date into formData only when it parses to a valid calendar date.
  const handleDateInput = (e) => {
    const text = e.target.value;
    setDateInput(text);
    const parsed = parseDateInput(text);
    setFormData(prev => ({ ...prev, serviceDate: parsed ? toISO(parsed) : '' }));
  };

  const openDatePicker = () => {
    const base = parseDateInput(dateInput) || new Date();
    setPickerView(new Date(base.getFullYear(), base.getMonth(), 1));
    setDatePickerOpen(true);
  };

  const shiftPickerMonth = (delta) => {
    setPickerView(new Date(pickerView.getFullYear(), pickerView.getMonth() + delta, 1));
  };

  const selectPickerDate = (day) => {
    const iso = toISO(new Date(pickerView.getFullYear(), pickerView.getMonth(), day));
    setFormData(prev => ({ ...prev, serviceDate: iso }));
    setDateInput(formatDisplay(iso));
    setDatePickerOpen(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!vehicle?._id || !vehicle?.customer?._id || !vehicle?.customer?.name || !vehicle?.vehicleNumber) {
      setError('Please select a customer and vehicle.');
      searchInput.current?.focus();
      return;
    }
    if (!formData.serviceDate) {
      setError('Please enter a valid service date (DD-MM-YYYY) or pick one from the calendar.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/services', {
        vehicle: vehicle._id,
        customer: vehicle.customer._id,
        serviceDate: formData.serviceDate,
        workPerformed: formData.workPerformed,
        ...(formData.nextServiceDate && { nextServiceDate: formData.nextServiceDate })
      });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving service');
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block asm-modal" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }} role="dialog" aria-modal="true" aria-labelledby="add-service-title" onKeyDown={e => { if (e.key === 'Escape' && !saving) onClose(); }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="asm-head">
            <span className="asm-head-icon"><Wrench size={20} /></span>
            <div className="asm-head-text">
              <h5 className="modal-title asm-head-title" id="add-service-title">Add New Service</h5>
              <p className="asm-head-subtitle">Create a service record for a customer and vehicle.</p>
            </div>
            <button type="button" className="asm-close" aria-label="Close" onClick={onClose} disabled={saving}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-search">Search Customer / Vehicle</label>
                  <div className="asm-search">
                    <Search size={18} />
                    <input
                      ref={searchInput}
                      id="service-search"
                      type="text"
                      className="form-control asm-input asm-search-input"
                      placeholder="Search by customer name or vehicle number"
                      autoComplete="off"
                      value={searchQuery}
                      disabled={saving}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setVehicle(null);
                        setSearchResults([]);
                        setSearchMessage(e.target.value.trim() ? 'Searching...' : '');
                        setError('');
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                    />
                  </div>
                  {searchMessage && <div className="asm-search-message">{searchMessage}</div>}
                  {searchResults.length > 0 && (
                    <div className="asm-results">
                      {searchResults.map(result => (
                        <button key={result._id} type="button" className="asm-result-item" disabled={saving} onClick={() => {
                          setVehicle(result);
                          setSearchQuery(result.vehicleNumber);
                          setSearchResults([]);
                          setSearchMessage('');
                          setError('');
                        }}>
                          <span className="asm-result-name">{result.customer.name}</span>
                          <span className="asm-result-vehicle">{result.vehicleNumber}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-customer">Customer Name</label>
                  <input id="service-customer" className="form-control asm-input asm-readonly" value={vehicle?.customer?.name || ''} readOnly tabIndex={-1} />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-vehicle">Vehicle Number</label>
                  <input id="service-vehicle" className="form-control asm-input asm-readonly" value={vehicle?.vehicleNumber || ''} readOnly tabIndex={-1} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-date">Service Date *</label>
                  <div className="asm-date-wrap" ref={datePickerWrap}>
                    <input
                      id="service-date"
                      type="text"
                      inputMode="numeric"
                      placeholder="DD-MM-YYYY"
                      className="form-control asm-input asm-date"
                      required
                      disabled={saving}
                      value={dateInput}
                      onChange={handleDateInput}
                    />
                    <button
                      type="button"
                      className="asm-date-toggle"
                      onClick={() => (datePickerOpen ? setDatePickerOpen(false) : openDatePicker())}
                      disabled={saving}
                      aria-label="Open calendar"
                      title="Open calendar"
                    >
                      <CalendarDays size={16} />
                    </button>
                    {datePickerOpen && (
                      <div className="asm-date-popover">
                        <div className="asm-date-pop-head">
                          <button type="button" className="asm-date-nav" onClick={() => shiftPickerMonth(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
                          <span className="asm-date-pop-title">
                            {pickerView.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                          </span>
                          <button type="button" className="asm-date-nav" onClick={() => shiftPickerMonth(1)} aria-label="Next month"><ChevronRight size={15} /></button>
                        </div>
                        <div className="asm-date-grid">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                            <span key={day} className="asm-date-dow">{day}</span>
                          ))}
                          {(() => {
                            const year = pickerView.getFullYear();
                            const month = pickerView.getMonth();
                            const firstDay = new Date(year, month, 1).getDay();
                            const totalDays = new Date(year, month + 1, 0).getDate();
                            const [selY, selM, selD] = (formData.serviceDate || '').split('-').map(Number);
                            const today = new Date();
                            const cells = [];
                            for (let i = 0; i < firstDay; i++) cells.push(null);
                            for (let day = 1; day <= totalDays; day++) cells.push(day);
                            return cells.map((day, index) => {
                              if (day === null) return <span key={`empty-${index}`} className="asm-date-day is-empty" />;
                              const isSelected = selY === year && selM === month + 1 && selD === day;
                              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`asm-date-day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                                  onClick={() => selectPickerDate(day)}
                                >
                                  {day}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-work">Service Type / Work Performed</label>
                  <div className="asm-select-wrap">
                    <select id="service-work" className="form-select asm-input asm-select" disabled={saving} value={formData.workPerformed} onChange={e => setFormData({ ...formData, workPerformed: e.target.value })}>
                      <option value="">Select Service Type (Optional)</option>
                      {['General Service', 'Oil Change', 'Repair', 'Washing', 'Other'].map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <ChevronDown size={17} className="asm-select-chevron" />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold asm-label" htmlFor="service-next-date">Next Service Due Date</label>
                  <input id="service-next-date" type="date" className="form-control asm-input asm-date" disabled={saving} value={formData.nextServiceDate} onChange={e => setFormData({ ...formData, nextServiceDate: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer asm-foot">
              <button type="button" className="btn asm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="btn asm-btn-save" disabled={saving}>{saving ? 'Saving...' : 'Save Service'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddService;