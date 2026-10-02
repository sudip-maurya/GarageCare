import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Plus, Search, Eye, Trash2, Wrench, CalendarDays, CalendarRange, Clock
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AddService from './AddService';
import './services.css';

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const Services = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(() => Boolean(location.state?.addService));
  const [success, setSuccess] = useState('');

  const fetchServices = async () => {
    try {
      const { data } = await api.get('/services');
      setServices(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching services', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // Auto-dismiss the success notification 3 seconds after it appears.
  // The timer restarts whenever a new success message is set.
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  // Same matching logic: partial + case-insensitive on BOTH
  // vehicle number and customer name (e.g. "MH02" or "Awadhesh").
  const filteredServices = services.filter(service => {
    if (!searchQuery) return true;
    const vNo = service.vehicle?.vehicleNumber?.toLowerCase() || '';
    const cName = service.customer?.name?.toLowerCase() || '';
    const q = searchQuery.trim().toLowerCase();
    return vNo.includes(q) || cName.includes(q);
  });

  const closeModal = () => {
    setShowModal(false);
    if (location.state?.addService) navigate('/services', { replace: true, state: null });
  };

  const handleSaved = (service) => {
    setServices(current => [service, ...current]);
    setSearchQuery('');
    setSuccess('Service added successfully!');
    closeModal();
    fetchServices();
  };

  // Delete a single service record (uses the existing DELETE /services/:id endpoint)
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      try {
        await api.delete(`/services/${id}`);
        fetchServices();
      } catch (error) {
        console.error('Error deleting service', error);
        alert('Error deleting service');
      }
    }
  };

  // Summary stats — computed from the already-fetched services list (no extra API calls)
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const monthCount = services.filter(s => {
    const d = new Date(s.serviceDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const weekCount = services.filter(s => new Date(s.serviceDate) >= weekAgo).length;
  const todayCount = services.filter(s => {
    const d = new Date(s.serviceDate);
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  }).length;

  return (
    <div className="svc-page">
      {/* Page header */}
      <div className="svc-header">
        <div>
          <h2 className="svc-title">Services</h2>
          <p className="svc-subtitle">Track service history and manage vehicle maintenance records.</p>
        </div>
        <div className="svc-header-actions">
          <div className="svc-search">
            <Search size={18} />
            <input
              id="svc-search-input"
              name="searchQuery"
              type="text"
              placeholder="Search vehicle or customer"
              aria-label="Search vehicle or customer"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            />
          </div>
          <button type="button" onClick={() => { setSuccess(''); setShowModal(true); }} className="btn btn-primary svc-add-btn d-flex align-items-center gap-2">
            <Plus size={18} /> Add Service
          </button>
        </div>
      </div>

      {/* Summary KPI cards (4 equal-width cards in one row) */}
      <div className="svc-stats">
        <div className="svc-stat tone-blue">
          <div className="svc-stat-top">
            <span className="svc-stat-label">TOTAL SERVICES</span>
            <span className="svc-stat-icon" aria-hidden="true">
              <Wrench size={20} />
            </span>
          </div>
          <div className="svc-stat-body">
            <div className="svc-stat-value">{loading ? '—' : services.length}</div>
            <div className="svc-stat-sub">All time recorded</div>
          </div>
        </div>
        <div className="svc-stat tone-green">
          <div className="svc-stat-top">
            <span className="svc-stat-label">SERVICES THIS MONTH</span>
            <span className="svc-stat-icon" aria-hidden="true">
              <CalendarDays size={20} />
            </span>
          </div>
          <div className="svc-stat-body">
            <div className="svc-stat-value">{loading ? '—' : monthCount}</div>
            <div className="svc-stat-sub">Logged this month</div>
          </div>
        </div>
        <div className="svc-stat tone-purple">
          <div className="svc-stat-top">
            <span className="svc-stat-label">THIS WEEK</span>
            <span className="svc-stat-icon" aria-hidden="true">
              <CalendarRange size={20} />
            </span>
          </div>
          <div className="svc-stat-body">
            <div className="svc-stat-value">{loading ? '—' : weekCount}</div>
            <div className="svc-stat-sub">Last 7 days</div>
          </div>
        </div>
        <div className="svc-stat tone-amber">
          <div className="svc-stat-top">
            <span className="svc-stat-label">SERVICES TODAY</span>
            <span className="svc-stat-icon" aria-hidden="true">
              <Clock size={20} />
            </span>
          </div>
          <div className="svc-stat-body">
            <div className="svc-stat-value">{loading ? '—' : todayCount}</div>
            <div className="svc-stat-sub">Recorded today</div>
          </div>
        </div>
      </div>

      {success && <div className="svc-success-note" role="status">{success}</div>}

      {/* Service table */}
      <div className="svc-table-card">
        {loading ? (
          <div className="svc-loading">Loading services...</div>
        ) : filteredServices.length === 0 ? (
          <div className="svc-empty">
            <span className="svc-empty-icon"><Wrench size={28} /></span>
            {searchQuery ? (
              <>
                <p className="svc-empty-title">No services found</p>
                <p className="svc-empty-text">No services found for this customer or vehicle.</p>
              </>
            ) : (
              <>
                <p className="svc-empty-title">No service records found</p>
                <p className="svc-empty-text">Add a service record to start building your service history.</p>
                <button type="button" onClick={() => { setSuccess(''); setShowModal(true); }} className="btn btn-primary d-inline-flex align-items-center gap-2">
                  <Plus size={18} /> Add Service
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="svc-table-wrapper">
            <table className="svc-table">
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Customer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map(service => {
                  const brandModel = [service.vehicle?.brand, service.vehicle?.model].filter(Boolean).join(' ');
                  return (
                    <tr key={service._id}>
                      <td>
                        <span className="svc-date">{formatDate(service.serviceDate)}</span>
                      </td>
                      <td>
                        <div className="svc-vehicle-number">{service.vehicle?.vehicleNumber || 'N/A'}</div>
                        {brandModel && <div className="svc-vehicle-model">{brandModel}</div>}
                      </td>
                      <td className="svc-customer">{service.customer?.name || 'N/A'}</td>
                      <td>
                        <div className="svc-actions">
                          <Link to={`/services/view/${service._id}`} className="svc-view-btn">
                            <Eye size={14} /> View
                          </Link>
                          <button
                            type="button"
                            className="svc-icon-btn svc-icon-danger"
                            onClick={() => handleDelete(service._id)}
                            title="Delete service"
                            aria-label="Delete service"
                          >
                            <Trash2 size={15} />
                          </button>
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
      {showModal && <AddService onClose={closeModal} onSaved={handleSaved} />}
    </div>
  );
};

export default Services;
