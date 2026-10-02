import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import api from '../utils/api';
import { getReminderWhatsAppUrl } from '../utils/whatsapp';
import GcSelect from '../components/GcSelect';
import './reminders.css';
import {
  Bell,
  Calendar,
  AlertCircle,
  Clock,
  Search,
  RefreshCw,
  XCircle,
  Shield,
  Wrench,
  CreditCard,
  CheckCircle2,
  CalendarClock,
  RotateCcw,
  MessageCircle,
  X
} from 'lucide-react';

// Type filter tabs tracked on this page (PUC is not tracked here)
const TYPE_TABS = ['All', 'Service', 'Insurance', 'Payment'];

// Same dropdown options the page always had — values and labels unchanged.
const TIMEFRAME_OPTIONS = [
  { value: 'All', label: 'All Dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'upcoming7', label: 'Due Next 7 Days' },
  { value: 'upcoming30', label: 'Due Next 30 Days' }
];

const STATUS_OPTIONS = [
  { value: 'All', label: 'All Active (Pending + Sent)' },
  { value: 'Pending', label: 'Pending Only' },
  { value: 'Sent', label: 'Sent Only' },
  { value: 'Dismissed', label: 'Dismissed' },
  { value: 'Completed', label: 'Completed' }
];

const Reminders = () => {
  const [reminders, setReminders] = useState([]);
  const [stats, setStats] = useState({
    overdueCount: 0,
    todayCount: 0,
    dueWeekCount: 0,
    totalActive: 0,
    sentThisMonth: 0
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [garageName, setGarageName] = useState('My Garage');
  const [garageContact, setGarageContact] = useState('');

  // Filters
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [timeframeFilter, setTimeframeFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Shared sliding indicator for the type filter tabs
  const typeSegRef = useRef(null);
  const [typeSegPill, setTypeSegPill] = useState({ left: 0, width: 0 });

  // Fetch garage name and contact from settings
  useEffect(() => {
    api.get('/settings')
      .then(res => {
        if (res.data?.garageName) setGarageName(res.data.garageName);
        if (res.data?.garageContact) setGarageContact(res.data.garageContact);
      })
      .catch(() => {});
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/reminders/stats');
      setStats(data);
    } catch {
      // ignore stats error
    }
  };

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (typeFilter !== 'All') params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (timeframeFilter !== 'All') params.timeframe = timeframeFilter;
      if (search.trim()) params.search = search.trim();

      const { data } = await api.get('/reminders', { params });
      // Defensive: this page tracks Service, Insurance and Payment reminders only.
      const filtered = Array.isArray(data) ? data.filter(r => r.type !== 'PUC') : [];
      setReminders(filtered);
      await fetchStats();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, timeframeFilter, search]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Keep one shared blue pill aligned with the active type tab so it can slide
  // smoothly between tabs instead of each tab painting its own background.
  useLayoutEffect(() => {
    const container = typeSegRef.current;
    if (!container) return undefined;

    const measure = () => {
      const active = container.querySelector('.rem-type-btn.is-active');
      if (!active) return;
      const containerBox = container.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      // getBoundingClientRect is border-box based while absolutely positioned
      // children start at the padding box, so drop the container border width.
      const left = activeBox.left - containerBox.left - container.clientLeft;
      const width = activeBox.width;
      setTypeSegPill(prev => (
        Math.abs(prev.left - left) < 0.5 && Math.abs(prev.width - width) < 0.5
          ? prev
          : { left, width }
      ));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [typeFilter]);

  const handleManualSync = async () => {
    setSyncing(true);
    setError('');
    try {
      await api.post('/reminders/sync');
      setSuccessMsg('Reminders synchronized with current vehicle & billing dates!');
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchReminders();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sync reminders');
    } finally {
      setSyncing(false);
    }
  };

  const handleSendWhatsApp = async (reminder) => {
    const result = getReminderWhatsAppUrl(reminder, garageName, garageContact);
    if (result.error) {
      alert(result.error);
      return;
    }

    // Open WhatsApp
    window.open(result.url, '_blank');

    // Auto update status to Sent
    try {
      const { data } = await api.patch(`/reminders/${reminder._id}/status`, { status: 'Sent' });
      setReminders(prev => {
        if (statusFilter !== 'All' && statusFilter !== 'Sent') {
          return prev.filter(r => r._id !== reminder._id);
        }
        return prev.map(r => r._id === reminder._id ? data : r);
      });
      await fetchStats();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { data } = await api.patch(`/reminders/${id}/status`, { status: newStatus });
      setReminders(prev => {
        if (statusFilter !== 'All' && statusFilter !== newStatus) {
          return prev.filter(r => r._id !== id);
        }
        return prev.map(r => r._id === id ? data : r);
      });
      await fetchStats();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update reminder status');
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'Service':
        return (
          <span className="rem-type-pill type-service">
            <Wrench size={13} /> Service Due
          </span>
        );
      case 'Insurance':
        return (
          <span className="rem-type-pill type-insurance">
            <Shield size={13} /> Insurance
          </span>
        );
      case 'Payment':
        return (
          <span className="rem-type-pill type-payment">
            <CreditCard size={13} /> Payment Due
          </span>
        );
      default:
        return <span className="badge bg-secondary">{type}</span>;
    }
  };

  const getDueBadge = (dueDate) => {
    if (!dueDate) return <span className="text-muted">No Date</span>;
    const due = new Date(dueDate);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueStart - startOfToday) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="rem-due-badge due-overdue">
          <AlertCircle size={12} /> Overdue by {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? 'day' : 'days'}
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="rem-due-badge due-today">
          <Clock size={12} /> Due Today
        </span>
      );
    } else if (diffDays <= 7) {
      return (
        <span className="rem-due-badge due-week">
          <Clock size={12} /> In {diffDays} {diffDays === 1 ? 'day' : 'days'}
        </span>
      );
    } else {
      return (
        <span className="rem-due-badge due-future">
          <Calendar size={12} /> In {diffDays} days
        </span>
      );
    }
  };

  // True while a filter change is re-fetching but rows are already on screen:
  // the old rows stay mounted (no layout collapse) and are dimmed instead.
  const isRefreshing = loading && reminders.length > 0;

  return (
    <div className="container-fluid py-2 gc-page rem-page">
      {/* Page Header (Matches Insurance/Services header style) */}
      <header className="rem-header">
        <div>
          <h2 className="rem-title">Reminders</h2>
          <p className="rem-subtitle">
            Automatically track periodic services, insurance expiries, and overdue payments with 1-click WhatsApp alerts.
          </p>
        </div>
        <div className="rem-header-actions">
          <button
            type="button"
            className="rem-btn-sync"
            onClick={handleManualSync}
            disabled={syncing}
            aria-label="Sync Reminders with vehicles and bills"
          >
            <RefreshCw size={16} className={`rem-sync-icon ${syncing ? 'rem-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Reminders'}</span>
          </button>
        </div>
      </header>

      {error && <div className="alert alert-danger mb-4" role="alert">{error}</div>}
      {successMsg && <div className="alert alert-success mb-4" role="alert">{successMsg}</div>}

      {/* 2. Top Summary KPI Cards */}
      <div className="rem-kpi-grid" role="group" aria-label="Reminders Summary">
        {/* Card 1: Overdue */}
        <button
          type="button"
          className={`rem-kpi-card tone-danger ${timeframeFilter === 'overdue' ? 'is-active' : ''}`}
          onClick={() => { setTimeframeFilter('overdue'); setStatusFilter('Pending'); }}
          aria-pressed={timeframeFilter === 'overdue'}
          title="Filter overdue reminders needing urgent attention"
        >
          <div className="rem-kpi-top">
            <span className="rem-kpi-label">OVERDUE REMINDERS</span>
            <span className="rem-kpi-icon" aria-hidden="true">
              <AlertCircle size={22} />
            </span>
          </div>
          <div>
            <div className="rem-kpi-value">{stats.overdueCount || 0}</div>
            <div className="rem-kpi-sub">Urgent attention needed</div>
          </div>
        </button>

        {/* Card 2: Due Today */}
        <button
          type="button"
          className={`rem-kpi-card tone-warning ${timeframeFilter === 'today' ? 'is-active' : ''}`}
          onClick={() => { setTimeframeFilter('today'); setStatusFilter('Pending'); }}
          aria-pressed={timeframeFilter === 'today'}
          title="Filter reminders scheduled for today"
        >
          <div className="rem-kpi-top">
            <span className="rem-kpi-label">DUE TODAY</span>
            <span className="rem-kpi-icon" aria-hidden="true">
              <Clock size={22} />
            </span>
          </div>
          <div>
            <div className="rem-kpi-value">{stats.todayCount || 0}</div>
            <div className="rem-kpi-sub">Scheduled for today</div>
          </div>
        </button>

        {/* Card 3: Due in Next 7 Days */}
        <button
          type="button"
          className={`rem-kpi-card tone-primary ${timeframeFilter === 'upcoming7' ? 'is-active' : ''}`}
          onClick={() => { setTimeframeFilter('upcoming7'); setStatusFilter('Pending'); }}
          aria-pressed={timeframeFilter === 'upcoming7'}
          title="Filter reminders upcoming this week"
        >
          <div className="rem-kpi-top">
            <span className="rem-kpi-label">DUE IN NEXT 7 DAYS</span>
            <span className="rem-kpi-icon" aria-hidden="true">
              <CalendarClock size={22} />
            </span>
          </div>
          <div>
            <div className="rem-kpi-value">{stats.dueWeekCount || 0}</div>
            <div className="rem-kpi-sub">Upcoming this week</div>
          </div>
        </button>

        {/* Card 4: Sent This Month */}
        <button
          type="button"
          className={`rem-kpi-card tone-success ${statusFilter === 'Sent' ? 'is-active' : ''}`}
          onClick={() => { setStatusFilter('Sent'); setTimeframeFilter('All'); }}
          aria-pressed={statusFilter === 'Sent'}
          title="Filter WhatsApp reminders sent this month"
        >
          <div className="rem-kpi-top">
            <span className="rem-kpi-label">SENT THIS MONTH</span>
            <span className="rem-kpi-icon" aria-hidden="true">
              <CheckCircle2 size={22} />
            </span>
          </div>
          <div>
            <div className="rem-kpi-value">{stats.sentThisMonth || 0}</div>
            <div className="rem-kpi-sub">WhatsApp reminders sent</div>
          </div>
        </button>
      </div>

      {/* 4. Modernized Filter Bar */}
      <div className="rem-toolbar-card">
        <div className="rem-toolbar">
          {/* Type Filter Tabs: All | Service | Insurance | Payment */}
          <div
            className="rem-type-seg"
            role="group"
            aria-label="Reminder type filter"
            ref={typeSegRef}
          >
            <span
              className="rem-type-seg-pill"
              aria-hidden="true"
              style={{
                transform: `translateX(${typeSegPill.left}px)`,
                width: `${typeSegPill.width}px`,
                opacity: typeSegPill.width ? 1 : 0
              }}
            />
            {TYPE_TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`rem-type-btn ${typeFilter === t ? 'is-active' : ''}`}
                onClick={() => setTypeFilter(t)}
                aria-pressed={typeFilter === t}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Timeframe Dropdown */}
          <div className="rem-select-wrap">
            <GcSelect
              className="rem-select"
              value={timeframeFilter}
              onChange={setTimeframeFilter}
              options={TIMEFRAME_OPTIONS}
              ariaLabel="Filter by due date"
            />
          </div>

          {/* Status Dropdown */}
          <div className="rem-select-wrap">
            <GcSelect
              className="rem-select"
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              ariaLabel="Filter by reminder status"
            />
          </div>

          {/* Search Box */}
          <div className="rem-search-wrap">
            <Search size={15} className="rem-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="rem-search-input"
              placeholder="Search vehicle number, customer, mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search reminders"
            />
            {search && (
              <button
                type="button"
                className="rem-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. Reminder Table */}
      <div className="rem-table-card">
        <div className="rem-table-scroll">
          <table
            className={`rem-table align-middle ${isRefreshing ? 'is-updating' : ''}`}
            aria-busy={loading}
          >
            <thead>
              <tr>
                <th scope="col">Vehicle</th>
                <th scope="col">Customer</th>
                <th scope="col">Reminder Type</th>
                <th scope="col">Due Date</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-end pe-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && reminders.length === 0 ? (
                /* 6. Loading State (same reserved height as the table/empty state) */
                <tr className="rem-loading-row">
                  <td colSpan="6" className="rem-loading-cell">
                    <div className="rem-loading-box" role="status">
                      <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
                      <span>Loading reminders...</span>
                    </div>
                  </td>
                </tr>
              ) : reminders.length === 0 ? (
                /* 7. Empty State (kept inside the table so headers stay visible) */
                <tr className="rem-empty-row">
                  <td colSpan="6" className="rem-empty-cell">
                    <div className="rem-empty-box">
                      <div className="rem-empty-icon-wrap" aria-hidden="true">
                        <Bell size={28} />
                      </div>
                      <h3 className="rem-empty-title">No Reminders Found</h3>
                      <p className="rem-empty-desc">
                        No reminders match this filter yet. Sync with your vehicles and bills to generate the latest ones.
                      </p>
                      <button
                        type="button"
                        className="rem-empty-cta"
                        onClick={handleManualSync}
                        disabled={syncing}
                        aria-label="Sync Reminders with vehicles and bills"
                      >
                        <RefreshCw size={15} className={`rem-sync-icon ${syncing ? 'rem-spin' : ''}`} />
                        <span>{syncing ? 'Syncing...' : 'Sync with Vehicles & Bills'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                reminders.map((rem) => {
                  const isSent = rem.status === 'Sent';
                  const isDismissed = rem.status === 'Dismissed';
                  const formattedDueDate = rem.dueDate
                    ? new Date(rem.dueDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'N/A';

                  return (
                    <tr key={rem._id} className={`rem-row ${isDismissed ? 'is-dismissed' : ''}`}>
                      <td>
                        <div className="rem-veh-badge">{rem.vehicle?.vehicleNumber || 'N/A'}</div>
                        <div className="rem-veh-desc">
                          {[rem.vehicle?.brand, rem.vehicle?.model].filter(Boolean).join(' ') || rem.vehicle?.vehicleType || 'Vehicle'}
                        </div>
                      </td>
                      <td>
                        <div className="rem-cust-name">{rem.customer?.name || rem.customerDetails?.name || 'Customer'}</div>
                        <div className="rem-cust-mobile">{rem.customer?.mobile || rem.customerDetails?.mobile || 'No Mobile'}</div>
                      </td>
                      <td>
                        {getTypeBadge(rem.type)}
                        {rem.type === 'Payment' && rem.metadata?.outstanding && (
                          <div className="rem-outstanding-note">
                            ₹{Number(rem.metadata.outstanding).toLocaleString('en-IN')} Due
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="rem-date-str">{formattedDueDate}</div>
                        <div>{getDueBadge(rem.dueDate)}</div>
                      </td>
                      <td>
                        {isSent ? (
                          <div>
                            <span className="rem-status-badge status-sent">
                              <CheckCircle2 size={12} /> Sent
                            </span>
                            {rem.lastSentAt && (
                              <div className="rem-sent-date">
                                {new Date(rem.lastSentAt).toLocaleDateString('en-IN')}
                              </div>
                            )}
                          </div>
                        ) : isDismissed ? (
                          <span className="rem-status-badge status-dismissed">Dismissed</span>
                        ) : rem.status === 'Completed' ? (
                          <span className="rem-status-badge status-completed">Completed</span>
                        ) : (
                          <span className="rem-status-badge status-pending">Pending</span>
                        )}
                      </td>
                      <td className="text-end pe-3">
                        <div className="rem-actions">
                          <button
                            type="button"
                            className="rem-btn-wa"
                            onClick={() => handleSendWhatsApp(rem)}
                            title="Send WhatsApp Reminder and mark as Sent"
                            aria-label="Send WhatsApp Reminder"
                          >
                            <MessageCircle size={14} />
                            <span>WhatsApp</span>
                          </button>

                          {isDismissed ? (
                            <button
                              type="button"
                              className="rem-act-btn act-restore"
                              onClick={() => handleStatusChange(rem._id, 'Pending')}
                              title="Restore Reminder"
                              aria-label="Restore Reminder"
                            >
                              <RotateCcw size={13} />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rem-act-btn act-danger"
                              onClick={() => handleStatusChange(rem._id, 'Dismissed')}
                              title="Dismiss Reminder"
                              aria-label="Dismiss Reminder"
                            >
                              <XCircle size={15} />
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
    </div>
  );
};

export default Reminders;
