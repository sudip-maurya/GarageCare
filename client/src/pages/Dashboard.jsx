import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import {
  Users,
  Car,
  Check,
  Wrench,
  Bell,
  Receipt,
  CreditCard,
  Download,
  ArrowRight,
  Plus,
  AlertTriangle,
  ShieldCheck,
  FileCheck,
  IndianRupee,
  Clock
} from 'lucide-react';
import '../dashboard.css';

const inr = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Progress-ring geometry for the finance cards (display only; r = 16.5 in the 40x40 SVG viewBox)
const RING_CIRCUMFERENCE = Number((2 * Math.PI * 16.5).toFixed(2));

const Dashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalVehicles: 0,
    todaysServices: 0,
    thisMonthsServices: 0,
    pendingBills: 0,
    totalOutstanding: 0,
    totalPaid: 0,
    totalRevenue: 0,
    urgentRemindersCount: 0,
    recentServices: [],
    recentBills: []
  });
  const [bills, setBills] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [revPeriod, setRevPeriod] = useState('7d');
  const [attentionHorizon, setAttentionHorizon] = useState(30);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  /* ---------- Sliding active indicator for revenue period buttons (visual only) ---------- */
  const segRef = useRef(null);
  const [segIndicator, setSegIndicator] = useState({ left: 0, width: 0, ready: false });
  useLayoutEffect(() => {
    const update = () => {
      const group = segRef.current;
      if (!group) return;
      const btns = Array.from(group.querySelectorAll('button'));
      const activeIndex = { '7d': 0, '10d': 1, '30d': 2 }[revPeriod] ?? 0;
      const btn = btns[activeIndex];
      if (btn) setSegIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [revPeriod]);

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .catch(requestError => setError(requestError.response?.data?.message || 'Unable to load dashboard statistics. Please try again.'))
      .finally(() => setLoading(false));

    api.get('/bills')
      .then(res => {
        const raw = res.data;
        setBills(Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []));
      })
      .catch(() => setBills([]));

    api.get('/reminders')
      .then(res => {
        const raw = res.data;
        setReminders(Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []));
      })
      .catch(() => setReminders([]));

    // Reminder "due soon" threshold from existing settings (fallback 30 days)
    api.get('/settings')
      .then(res => {
        const rules = res.data?.reminders || {};
        const values = [rules.service, rules.insurance, rules.puc].filter(Array.isArray).flat();
        setAttentionHorizon(values.length ? Math.max(...values) : 30);
      })
      .catch(() => setAttentionHorizon(30));
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get('/dashboard/export-report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `GarageCare_Billing_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export CSV report');
    } finally {
      setExporting(false);
    }
  };

  const cardValue = (value) => (loading ? '...' : value);
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  /* ---------- Revenue series (real bill data, filtered by period) ---------- */
  const safeBills = Array.isArray(bills) ? bills : [];
  const revenueBills = safeBills.filter(b => b && b.date);
  const buildRevenueSeries = (mode) => {
    const today = startOfDay(new Date());
    const days = mode === '7d' ? 7 : mode === '10d' ? 10 : 30;
    const buckets = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dayIndex = days - 1 - i;
      const label = mode === '30d'
        ? (dayIndex % 5 === 0 ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '')
        : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      buckets.push({ key: dayKey(d), label, total: 0 });
    }

    revenueBills.forEach(bill => {
      const bd = new Date(bill.date);
      if (isNaN(bd.getTime())) return;
      const bStart = startOfDay(bd);
      if (bStart > today) return;
      if (Math.round((today - bStart) / 86400000) >= days) return;
      const bucket = buckets.find(x => x.key === dayKey(bd));
      if (bucket) bucket.total += Number(bill.totalAmount) || 0;
    });

    return buckets;
  };
  const revenueSeries = buildRevenueSeries(revPeriod);
  const maxRevenue = Math.max(...revenueSeries.map(s => s.total), 0);
  const periodRevenue = revenueSeries.reduce((sum, s) => sum + s.total, 0);

  /* ---------- Today's priority (existing reminders + bills) ---------- */
  const todayStart = startOfDay(new Date());
  const typeTone = { Service: 'type-primary', Insurance: 'type-info', Payment: 'type-success', PUC: 'type-secondary' };
  const safeReminders = Array.isArray(reminders) ? reminders : [];
  const priorities = safeReminders.slice(0, 5).map(r => {
    const type = r.type || 'Service';
    let due = { text: 'Today', tone: 'due-warning' };
    if (type === 'Payment') {
      due = { text: inr(r.metadata?.outstanding), tone: 'due-danger' };
    } else if (r.dueDate) {
      const days = Math.round((startOfDay(new Date(r.dueDate)).getTime() - todayStart.getTime()) / 86400000);
      due = days < 0
        ? { text: 'Overdue', tone: 'due-danger' }
        : days === 0
          ? { text: 'Today', tone: 'due-warning' }
          : { text: `${days}d`, tone: 'due-info' };
    }
    return {
      id: r._id,
      type,
      typeTone: typeTone[type] || 'type-primary',
      customer: r.customer?.name || 'Customer',
      vehicle: r.vehicle?.vehicleNumber || r.vehicle?.brand || '',
      due
    };
  });

  /* ---------- Vehicles requiring attention (existing reminder data) ---------- */
  const attentionVehicles = (() => {
    const mapped = safeReminders
      .filter(r => r && ['Service', 'Insurance', 'PUC'].includes(r.type) && r.vehicle?._id)
      .map(r => {
        const days = r.dueDate
          ? Math.round((startOfDay(new Date(r.dueDate)).getTime() - todayStart.getTime()) / 86400000)
          : null;
        const isService = r.type === 'Service';
        return {
          key: `${String(r.vehicle._id)}|${r.type}`,
          vehicleId: r.vehicle._id,
          vehicleNumber: r.vehicle.vehicleNumber || 'N/A',
          brandModel: [r.vehicle.brand, r.vehicle.model].filter(Boolean).join(' '),
          customer: r.customer?.name || 'Customer',
          type: r.type,
          typeLabel: isService ? 'Service Due' : (r.type === 'Insurance' ? 'Insurance Expiry' : 'PUC Expiry'),
          typeTone: isService ? 'type-primary' : (r.type === 'Insurance' ? 'type-info' : 'type-secondary'),
          days,
          dueText: days === null
            ? ''
            : (isService
                ? (days < 0 ? 'Overdue' : days === 0 ? 'Due Today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`)
                : (days < 0 ? 'Expired' : days === 0 ? 'Expires Today' : days === 1 ? 'Expires tomorrow' : `Expires in ${days} days`))
        };
      })
      .filter(v => v.days !== null && v.days <= attentionHorizon);

    const seen = new Set();
    return [...mapped]
      .sort((a, b) => a.days - b.days)
      .filter(v => {
        if (seen.has(v.vehicleId)) return false;
        seen.add(v.vehicleId);
        return true;
      });
  })();

  /* ---------- Financial / outstanding (existing bill data) ---------- */
  const uniqueCustomerCount = new Set(bills.map(b => String(b.customer?._id || b.customer))).size;
  const outstandingBills = bills
    .filter(b => (Number(b.outstanding) || 0) > 0)
    .slice(0, 6);
  const billStatusInfo = (b) => {
    const paid = (Number(b.outstanding) || 0) <= 0;
    if (paid || b.paymentStatus === 'Paid') return { label: 'PAID', tone: 'dash-status-success' };
    if (Number(b.totalPaid) > 0 || b.paymentStatus === 'Partially Paid') return { label: 'PARTIAL', tone: 'dash-status-warning' };
    return { label: 'UNPAID', tone: 'dash-status-danger' };
  };

  const totalRevenue = Number(stats.totalRevenue) || 0;
  const collectionPct = totalRevenue > 0 ? Math.min(Math.round(((Number(stats.totalPaid) || 0) / totalRevenue) * 100), 100) : 0;
  const outstandingPct = totalRevenue > 0 ? Math.min(Math.round(((Number(stats.totalOutstanding) || 0) / totalRevenue) * 100), 100) : 0;
  const billCustomerName = (b) => b.customer?.name || b.customerDetails?.name || 'Customer';
  const initialsOf = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || 'C') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  const avatarTone = (statusTone) => (statusTone === 'dash-status-danger' ? 'tone-danger' : statusTone === 'dash-status-warning' ? 'tone-warning' : 'tone-success');

  const kpiCards = [
    {
      label: 'Total Customers',
      value: cardValue(stats.totalCustomers),
      support: 'Client accounts on record',
      icon: Users,
      tone: 'dash-kpi-blue',
      to: '/customers'
    },
    {
      label: 'Total Vehicles',
      value: cardValue(stats.totalVehicles),
      support: 'Vehicles on record',
      icon: Car,
      tone: 'dash-kpi-green',
      to: '/vehicles'
    },
    {
      label: 'Services This Month',
      value: cardValue(stats.thisMonthsServices),
      support: `Today: ${cardValue(stats.todaysServices)}`,
      icon: Wrench,
      tone: 'dash-kpi-purple',
      to: '/services'
    },
    {
      label: 'Active Reminders',
      value: cardValue(stats.urgentRemindersCount),
      support: Number(stats.urgentRemindersCount) > 0 ? 'Due within 7 days' : 'All clear',
      icon: Bell,
      tone: 'dash-kpi-amber',
      to: '/reminders'
    }
  ];

  return (
    <div className="container-fluid py-3 text-start">
      {/* Welcome banner */}
      <div className="dash-welcome">
        <div className="dash-welcome-text">
          <h2 className="dash-welcome-title">Welcome Sir,</h2>
          <p className="dash-welcome-sub">Here&apos;s your garage overview. Let&apos;s keep everything running smoothly.</p>
          <span className="dash-welcome-date"><Clock size={13} /> {todayLabel}</span>
        </div>
        <div className="dash-welcome-art" aria-hidden="true">
          <svg viewBox="0 0 220 150" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* soft backdrop */}
            <circle cx="110" cy="78" r="66" fill="#dbe7fd" />
            {/* garage building */}
            <rect x="52" y="56" width="116" height="62" rx="6" fill="#f6f9ff" />
            <path d="M42 58 L110 24 L178 58 Z" fill="#0d6efd" />
            <rect x="42" y="56" width="136" height="6" rx="3" fill="#1f4fd8" />
            {/* door opening */}
            <rect x="68" y="72" width="84" height="46" rx="5" fill="#e2ecfe" />
            {/* car */}
            <path d="M78 104 q3 -12 15 -12 h22 q12 0 16 12 l2 8 h-58 z" fill="#0d6efd" />
            <path d="M96 95 h14 q7 0 10 7 h-32 q3 -7 8 -7 z" fill="#bfd7fb" />
            <circle cx="90" cy="110" r="6" fill="#1f4fd8" />
            <circle cx="90" cy="110" r="2.5" fill="#e2ecfe" />
            <circle cx="126" cy="110" r="6" fill="#1f4fd8" />
            <circle cx="126" cy="110" r="2.5" fill="#e2ecfe" />
            {/* ground */}
            <rect x="40" y="116" width="140" height="4" rx="2" fill="#c4d7f8" />
            {/* accents */}
            <circle cx="188" cy="46" r="4" fill="#9dbdf5" />
            <circle cx="34" cy="88" r="3" fill="#9dbdf5" />
            <path d="M186 96 l4 0" stroke="#9dbdf5" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-3" role="alert">{error}</div>}

      {/* Quick actions */}
      <div className="d-flex flex-wrap gap-2 mt-2 mb-4">
        <Link to="/customers" className="dash-action dash-action-customer"><Plus size={15} /> Add Customer</Link>
        <Link to="/vehicles" className="dash-action dash-action-vehicle"><Car size={15} /> Add Vehicle</Link>
        <button type="button" className="dash-action dash-action-service" onClick={() => navigate('/services', { state: { addService: true } })}>
          <Wrench size={15} /> Add Service
        </button>
        <Link to="/bills/generate" className="dash-action dash-action-bill"><Receipt size={15} /> Create Bill</Link>
        <Link to="/payments" className="dash-action dash-action-payment"><CreditCard size={15} /> Record Payment</Link>
        <button type="button" className="dash-action dash-action-export" onClick={handleExportCsv} disabled={exporting}>
          <Download size={15} /> {exporting ? 'Exporting...' : 'Export Excel/CSV'}
        </button>
      </div>

      {/* Urgent reminders banner */}
      {!loading && Number(stats.urgentRemindersCount) > 0 && (
        <div className="alert dash-urgent-banner d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4">
          <div className="d-flex align-items-center gap-2">
            <AlertTriangle className="text-warning-emphasis flex-shrink-0" size={22} />
            <div>
              <strong className="d-block">{stats.urgentRemindersCount} urgent reminder(s)</strong>
              Vehicle(s) with periodic service, insurance, or PUC due within the next 7 days.
            </div>
          </div>
          <Link to="/reminders" className="btn btn-sm btn-warning fw-semibold d-inline-flex align-items-center gap-1">
            <Bell size={14} /> View Reminders <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI cards */}
      <div className="row g-3 mb-4">
        {kpiCards.map(kpi => {
          const Icon = kpi.icon;
          return (
            <div className="col-lg-3 col-md-6" key={kpi.label}>
              <div className={`dash-card dash-kpi ${kpi.tone}`}>
                <div className="dash-kpi-top">
                  <span className="dash-kpi-support">{kpi.label}</span>
                  <span className="dash-kpi-icon"><Icon size={18} /></span>
                </div>
                <div className="dash-kpi-value">{kpi.value}</div>
                <div className="dash-kpi-foot">
                  <small className="text-muted">{kpi.support}</small>
                  <Link to={kpi.to} className="dash-kpi-link" aria-label={`View ${kpi.label}`}>
                    View <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue overview + Today's priority */}
      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="dash-card h-100">
            <div className="dash-card-head">
              <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
                <span className="dash-head-icon dash-head-blue"><IndianRupee size={15} /></span>
                Revenue Overview
              </h6>
              <div ref={segRef} className="btn-group btn-group-sm dash-seg" role="group" aria-label="Revenue period">
                  <span
                    className="dash-seg-indicator"
                    style={{
                      transform: `translateX(${segIndicator.left}px)`,
                      width: `${segIndicator.width}px`,
                      opacity: segIndicator.ready ? 1 : 0
                    }}
                    aria-hidden="true"
                  />
                  {[['7d', '7 Days'], ['10d', '10 Days'], ['30d', '30 Days']].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn btn-sm ${revPeriod === value ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setRevPeriod(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            <div className="dash-card-body">
              <div className="dash-revenue-total">{inr(periodRevenue)}</div>
              <small className="text-muted">Total Invoiced Revenue</small>

              {revenueBills.length === 0 ? (
                <div className="dash-empty">
                  <span className="dash-empty-icon"><IndianRupee size={20} /></span>
                  <strong>No revenue recorded yet</strong>
                  <small className="text-muted">Bills generated will appear here.</small>
                </div>
              ) : (
                <div className="dash-chart">
                  {revenueSeries.map(s => (
                    <div className="dash-chart-col" key={s.key}>
                      <div className="dash-chart-bar-wrap">
                        <div
                          className={`dash-chart-bar ${s.total > 0 ? '' : 'zero'}`}
                          style={{ height: `${s.total > 0 ? Math.max((s.total / (maxRevenue || 1)) * 100, 4) : 2}%` }}
                          title={s.label ? `${s.label}: ${inr(s.total)}` : inr(s.total)}
                        />
                      </div>
                      <div className="dash-chart-label">{s.label || '\u00A0'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="dash-card h-100">
            <div className="dash-card-head">
              <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
                <span className="dash-head-icon dash-head-amber"><AlertTriangle size={15} /></span>
                Today&apos;s Priority
              </h6>
              <Link to="/reminders" className="btn btn-sm btn-link text-decoration-none">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="dash-card-body">
              {priorities.length === 0 ? (
                <div className="dash-empty dash-empty-success">
                  <span className="dash-empty-icon"><ShieldCheck size={22} /></span>
                  <strong>All Clear</strong>
                  <small className="text-muted">No urgent reminders right now.</small>
                  <Link to="/reminders" className="btn btn-sm btn-outline-primary rounded-pill">View Reminders</Link>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {priorities.map(p => {
                    const PriorityIcon = p.type === 'Service' ? Wrench : (p.type === 'Insurance' ? ShieldCheck : p.type === 'PUC' ? FileCheck : CreditCard);
                    return (
                      <Link to="/reminders" className="dash-priority-row" key={p.id} title={`${p.type} — ${p.customer}`}>
                        <span className={`dash-priority-icon ${p.typeTone}`}><PriorityIcon size={15} /></span>
                        <span className="dash-priority-main">
                          <span className="dash-priority-title">{p.customer}</span>
                          <span className="dash-priority-sub">{p.vehicle || '—'}</span>
                        </span>
                        <span className="dash-priority-side">
                          <span className={`dash-priority-type ${p.typeTone}`}>{p.type}</span>
                          <span className={`dash-priority-due ${p.due.tone}`}>{p.due.text}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial summary + Outstanding details */}
      <div className="row g-3 mb-4">
        <div className="col-lg-8">
          <div className="row g-3 h-100">
            <div className="col-md-4">
              <div className="dash-finance dash-finance-primary">
                <div className="dash-finance-main">
                  <span className="dash-finance-icon"><IndianRupee size={16} /></span>
                  <div className="dash-finance-info">
                    <span className="dash-finance-label">Total Invoiced</span>
                    <div className="dash-finance-value">{loading ? '...' : inr(stats.totalRevenue)}</div>
                    <small className="dash-finance-desc">{uniqueCustomerCount} customers • {bills.length} bills</small>
                  </div>
                  <div className="dash-finance-ring">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <circle className="dash-finance-ring-track" cx="20" cy="20" r="16.5" />
                      <circle
                        className="dash-finance-ring-bar bar-primary"
                        cx="20"
                        cy="20"
                        r="16.5"
                        style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE * (1 - (loading ? 0 : collectionPct) / 100) }}
                      />
                    </svg>
                    <span className="dash-finance-pct">{loading ? '—' : `${collectionPct}%`}</span>
                  </div>
                </div>
                <small className="dash-finance-note">{loading ? '—' : `${collectionPct}% collected`}</small>
                <Link to="/bills" className="dash-finance-action">View Invoices <ArrowRight size={13} /></Link>
              </div>
            </div>
            <div className="col-md-4">
              <div className="dash-finance dash-finance-success">
                <div className="dash-finance-main">
                  <span className="dash-finance-icon"><CreditCard size={16} /></span>
                  <div className="dash-finance-info">
                    <span className="dash-finance-label">Total Collected</span>
                    <div className="dash-finance-value">{loading ? '...' : inr(stats.totalPaid)}</div>
                    <small className="dash-finance-desc">Received payments</small>
                  </div>
                  <div className="dash-finance-ring">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <circle className="dash-finance-ring-track" cx="20" cy="20" r="16.5" />
                      <circle
                        className="dash-finance-ring-bar bar-success"
                        cx="20"
                        cy="20"
                        r="16.5"
                        style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE * (1 - (loading ? 0 : collectionPct) / 100) }}
                      />
                    </svg>
                    <span className="dash-finance-pct">{loading ? '—' : `${collectionPct}%`}</span>
                  </div>
                </div>
                <small className="dash-finance-note">{loading ? '—' : `Collection rate ${collectionPct}%`}</small>
                <Link to="/payments" className="dash-finance-action">View Payments <ArrowRight size={13} /></Link>
              </div>
            </div>
            <div className="col-md-4">
              <div className="dash-finance dash-finance-danger">
                <div className="dash-finance-main">
                  <span className="dash-finance-icon"><AlertTriangle size={16} /></span>
                  <div className="dash-finance-info">
                    <span className="dash-finance-label">Outstanding</span>
                    <div className="dash-finance-value">{loading ? '...' : inr(stats.totalOutstanding)}</div>
                    <small className="dash-finance-desc">{stats.pendingBills} bills with dues</small>
                  </div>
                  <div className="dash-finance-ring">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <circle className="dash-finance-ring-track" cx="20" cy="20" r="16.5" />
                      <circle
                        className="dash-finance-ring-bar bar-danger"
                        cx="20"
                        cy="20"
                        r="16.5"
                        style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE * (1 - (loading ? 0 : outstandingPct) / 100) }}
                      />
                    </svg>
                    <span className="dash-finance-pct">{loading ? '—' : `${outstandingPct}%`}</span>
                  </div>
                </div>
                <small className="dash-finance-note">{loading ? '—' : `${outstandingPct}% of invoiced`}</small>
                <Link to="/payments" className="dash-finance-action">View Ledger <ArrowRight size={13} /></Link>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="dash-card dash-card-prominent h-100">
            <div className="dash-card-head">
              <div className="d-flex align-items-center gap-2">
                <span className="dash-head-icon dash-head-danger"><CreditCard size={15} /></span>
                <div>
                  <h6 className="mb-0 fw-bold">Outstanding Details</h6>
                  <small className="text-muted">Bills with pending dues</small>
                </div>
              </div>
              <Link to="/payments" className="btn btn-sm btn-link text-decoration-none">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="dash-card-body">
              {outstandingBills.length === 0 ? (
                <div className="dash-empty dash-empty-success">
                  <span className="dash-empty-icon"><ShieldCheck size={22} /></span>
                  <strong>All Settled</strong>
                  <small className="text-muted">No outstanding dues.</small>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {outstandingBills.map(b => {
                    const info = billStatusInfo(b);
                    const name = billCustomerName(b);
                    return (
                      <div className="dash-outstanding-row" key={b._id}>
                        <span className={`dash-mini-avatar ${avatarTone(info.tone)}`}>{initialsOf(name)}</span>
                        <div className="dash-outstanding-main">
                          <span className="dash-outstanding-name">{name}</span>
                          <small className="text-muted">{b.billNumber}</small>
                        </div>
                        <div className="dash-outstanding-side">
                          <span className="fw-semibold text-danger">{inr(b.outstanding)}</span>
                          <span className={`dash-status ${info.tone}`}>{info.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="dash-card h-100">
            <div className="dash-card-head">
              <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
                <span className="dash-head-icon dash-head-blue"><Car size={15} /></span>
                Vehicles Requiring Attention
              </h6>
              <Link to="/reminders" className="btn btn-sm btn-link text-decoration-none">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="dash-card-body">
              {loading && reminders.length === 0 ? (
                <div className="dash-empty">Loading attention items...</div>
              ) : attentionVehicles.length === 0 ? (
                <div className="dash-empty dash-empty-success">
                  <span className="dash-empty-icon dash-empty-icon-lg"><Check size={26} /></span>
                  <strong>All Clear</strong>
                  <small className="text-muted">All vehicles are up to date.</small>
                </div>
              ) : (
                <div className="dash-attention-list">
                  {attentionVehicles.map(v => {
                    const TypeIcon = v.type === 'Service' ? Wrench : (v.type === 'Insurance' ? ShieldCheck : FileCheck);
                    const pill = v.days < 0
                      ? { label: 'Overdue', tone: 'due-danger' }
                      : v.days === 0
                        ? { label: 'Due Today', tone: 'due-warning' }
                        : v.days <= 3
                          ? { label: 'Due Soon', tone: 'due-warning' }
                          : { label: `Due in ${v.days}d`, tone: 'due-info' };
                    return (
                      <Link to="/reminders" className="dash-attention-card" key={v.key} title={`${v.vehicleNumber} — ${v.typeLabel} — ${v.dueText}`}>
                        <span className={`dash-vehicle-badge ${v.typeTone}`}><TypeIcon size={16} /></span>
                        <span className="dash-vehicle-info">
                          <span className="dash-vehicle-no">{v.vehicleNumber}</span>
                          {v.brandModel && <span className="dash-vehicle-model">{v.brandModel}</span>}
                          <span className="dash-vehicle-customer"><Users size={11} /> {v.customer}</span>
                        </span>
                        <span className="dash-vehicle-meta">
                          <span className={`dash-priority-type ${v.typeTone}`}>{v.typeLabel}</span>
                          <span className={`dash-priority-due ${pill.tone}`}>{pill.label}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="dash-card h-100">
            <div className="dash-card-head">
              <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
                <span className="dash-head-icon dash-head-success"><Receipt size={15} /></span>
                Recent Invoices &amp; Bills
              </h6>
              <Link to="/bills" className="btn btn-sm btn-link text-decoration-none">View All <ArrowRight size={13} /></Link>
            </div>
            <div className="dash-card-body p-0">
              {loading ? (
                <div className="dash-empty m-3">Loading bills...</div>
              ) : (stats.recentBills || []).length === 0 ? (
                <div className="dash-empty dash-empty-success m-3">
                  <span className="dash-empty-icon"><Receipt size={20} /></span>
                  <strong>No bills generated yet</strong>
                  <small className="text-muted">Invoices created from the Bills page will appear here.</small>
                </div>
              ) : (
                <div className="table-responsive dash-recent-bills-wrap">
                  <table className="table dash-table align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="col-bill-no ps-3">Bill No.</th>
                        <th className="col-customer">Customer</th>
                        <th className="col-amount text-end">Amount</th>
                        <th className="col-status text-end pe-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentBills.map(bill => {
                        const info = billStatusInfo(bill);
                        const vehicleNum = bill.vehicle?.vehicleNumber || bill.vehicleDetails?.vehicleNumber;
                        const vehicleModel = [bill.vehicle?.brand, bill.vehicle?.model].filter(Boolean).join(' ');
                        const vehicleText = [vehicleNum, vehicleModel].filter(Boolean).join(' • ');
                        const billDateStr = bill.date
                          ? new Date(bill.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '';

                        return (
                          <tr
                            key={bill._id}
                            className="dash-bill-row"
                            onClick={() => navigate('/bills')}
                            role="button"
                            title={`View Bill ${bill.billNumber}`}
                          >
                            <td className="ps-3">
                              <div className="dash-bill-cell">
                                <span className="dash-bill-no">{bill.billNumber}</span>
                                {billDateStr && <span className="dash-bill-date">{billDateStr}</span>}
                              </div>
                            </td>
                            <td>
                              <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                                <span className={`dash-mini-avatar ${avatarTone(info.tone)}`}>
                                  {initialsOf(billCustomerName(bill))}
                                </span>
                                <div className="dash-bill-customer-info">
                                  <span className="dash-bill-customer-name">
                                    {billCustomerName(bill)}
                                  </span>
                                  {vehicleText && (
                                    <span className="dash-bill-vehicle-text">
                                      {vehicleText}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-end">
                              <div className="dash-bill-amount">{inr(bill.totalAmount)}</div>
                              {Number(bill.outstanding) > 0 ? (
                                <span className="dash-bill-due text-danger">Due: {inr(bill.outstanding)}</span>
                              ) : (
                                <span className="dash-bill-due text-muted">Paid in full</span>
                              )}
                            </td>
                            <td className="text-end pe-3">
                              <span className={`dash-status ${info.tone}`}>{info.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;