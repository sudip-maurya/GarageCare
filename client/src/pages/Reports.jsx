import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import './reports.css';
import {
  Download,
  Search,
  RefreshCw,
  Layers,
  Receipt,
  Car,
  Wrench,
  CreditCard,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';

const TABS = [
  { id: 'master', label: 'Master Garage Report', icon: Layers },
  { id: 'billing', label: 'Billing & Revenue', icon: Receipt },
  { id: 'vehicles', label: 'Vehicle Fleet & Compliance', icon: Car },
  { id: 'services', label: 'Service Logs', icon: Wrench },
  { id: 'outstanding', label: 'Outstanding Balances', icon: CreditCard }
];

const renderInsuranceStatus = (status) => {
  if (!status || status === 'Not Recorded') {
    return <span className="rep-pill rep-pill-neutral">{status || 'Not Recorded'}</span>;
  }
  const s = String(status).toLowerCase();
  if (s.includes('expired') || s.includes('overdue')) {
    return <span className="rep-pill rep-pill-expired">{status}</span>;
  }
  if (s.includes('expiring')) {
    return <span className="rep-pill rep-pill-warning">{status}</span>;
  }
  if (s.includes('active') || s.includes('valid')) {
    return <span className="rep-pill rep-pill-valid">{status}</span>;
  }
  return <span className="rep-pill rep-pill-neutral">{status}</span>;
};

const Reports = () => {
  const [reportType, setReportType] = useState('master');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState('');
  const tabsContainerRef = useRef(null);
  const tabButtonRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  const [summaryStats, setSummaryStats] = useState({
    totalBilled: 0,
    totalPaid: 0,
    outstanding: 0,
    totalVehicles: 0,
    loading: true
  });

  const fetchSummaryStats = async () => {
    try {
      const res = await api.get('/reports/master');
      const records = res.data || [];
      const totalBilled = records.reduce((sum, r) => sum + (Number(r.totalBilled) || 0), 0);
      const totalPaid = records.reduce((sum, r) => sum + (Number(r.totalPaid) || 0), 0);
      const outstanding = records.reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0);
      setSummaryStats({
        totalBilled,
        totalPaid,
        outstanding,
        totalVehicles: records.length,
        loading: false
      });
    } catch (err) {
      console.error('Failed to fetch summary stats:', err);
      setSummaryStats(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchReportPreview = async (type) => {
    setLoading(true);
    try {
      if (type === 'master') {
        const res = await api.get('/reports/master');
        setData(res.data || []);
      } else if (type === 'billing') {
        const res = await api.get('/bills');
        setData(res.data || []);
      } else if (type === 'vehicles') {
        const res = await api.get('/vehicles');
        setData(res.data || []);
      } else if (type === 'services') {
        const res = await api.get('/services');
        setData(res.data || []);
      } else if (type === 'outstanding') {
        const res = await api.get('/bills');
        const dueBills = (res.data || []).filter(b => (b.outstanding || 0) > 0);
        setData(dueBills);
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaryStats();
  }, []);

  const updateIndicator = useCallback(() => {
    const activeEl = tabButtonRefs.current[reportType];
    const containerEl = tabsContainerRef.current;
    if (activeEl && containerEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        top: activeEl.offsetTop,
        width: activeEl.offsetWidth,
        height: activeEl.offsetHeight,
        ready: true
      });
    }
  }, [reportType]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateIndicator);
    }

    let ro;
    if (typeof ResizeObserver !== 'undefined' && tabsContainerRef.current) {
      ro = new ResizeObserver(handleResize);
      ro.observe(tabsContainerRef.current);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, [updateIndicator]);

  useEffect(() => {
    fetchReportPreview(reportType);
    setSearch('');
  }, [reportType]);

  const handleRefresh = () => {
    fetchReportPreview(reportType);
    fetchSummaryStats();
  };

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const response = await api.get(`/reports/export?type=${reportType}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GarageCare_${reportType.toUpperCase()}_Report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // Filter preview by search
  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const str = JSON.stringify(item).toLowerCase();
    return str.includes(q);
  });

  return (
    <div className="rep-page gc-page">
      {/* 1. Header with modern blue icon tile and Export Report button */}
      <div className="rep-header">
        <div className="rep-header-main">
          <div className="rep-header-icon" aria-hidden="true">
            <FileSpreadsheet size={20} />
          </div>
          <div className="rep-header-text">
            <h1 className="rep-title">Reports & Excel Export</h1>
            <p className="rep-subtitle">
              Preview, filter, and export comprehensive spreadsheets for accounts, compliance, services, and fleet.
            </p>
          </div>
        </div>
        <div className="rep-header-actions">
          <button
            type="button"
            className="rep-btn-export"
            onClick={handleDownloadCsv}
            disabled={downloading}
            title="Export Report"
          >
            <Download size={16} className={downloading ? 'rep-spin' : ''} />
            <span>{downloading ? 'Exporting...' : 'Export Report'}</span>
          </button>
        </div>
      </div>

      {/* 2. Compact 4 Summary Cards */}
      <div className="rep-kpi-grid" role="region" aria-label="Reports Summary">
        <div className="rep-kpi-card tone-blue">
          <div className="rep-kpi-top">
            <span className="rep-kpi-label">TOTAL BILLED</span>
            <span className="rep-kpi-icon" aria-hidden="true">
              <Receipt size={18} />
            </span>
          </div>
          <div className="rep-kpi-body">
            <div className="rep-kpi-value">
              {summaryStats.loading ? '—' : `₹${summaryStats.totalBilled.toLocaleString('en-IN')}`}
            </div>
            <div className="rep-kpi-sub">Gross revenue billed</div>
          </div>
        </div>

        <div className="rep-kpi-card tone-green">
          <div className="rep-kpi-top">
            <span className="rep-kpi-label">TOTAL PAID</span>
            <span className="rep-kpi-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="rep-kpi-body">
            <div className="rep-kpi-value">
              {summaryStats.loading ? '—' : `₹${summaryStats.totalPaid.toLocaleString('en-IN')}`}
            </div>
            <div className="rep-kpi-sub">Collected payments</div>
          </div>
        </div>

        <div className="rep-kpi-card tone-amber">
          <div className="rep-kpi-top">
            <span className="rep-kpi-label">OUTSTANDING</span>
            <span className="rep-kpi-icon" aria-hidden="true">
              <CreditCard size={18} />
            </span>
          </div>
          <div className="rep-kpi-body">
            <div className="rep-kpi-value">
              {summaryStats.loading ? '—' : `₹${summaryStats.outstanding.toLocaleString('en-IN')}`}
            </div>
            <div className="rep-kpi-sub">Pending receivables</div>
          </div>
        </div>

        <div className="rep-kpi-card tone-purple">
          <div className="rep-kpi-top">
            <span className="rep-kpi-label">TOTAL VEHICLES</span>
            <span className="rep-kpi-icon" aria-hidden="true">
              <Car size={18} />
            </span>
          </div>
          <div className="rep-kpi-body">
            <div className="rep-kpi-value">
              {summaryStats.loading ? '—' : summaryStats.totalVehicles.toLocaleString('en-IN')}
            </div>
            <div className="rep-kpi-sub">Registered fleet</div>
          </div>
        </div>
      </div>

      {/* 2. Modern Segmented SaaS Tabs with Smooth Sliding Pill */}
      <div className="rep-tabs-wrap">
        <div className="rep-tabs" role="tablist" aria-label="Report Categories" ref={tabsContainerRef}>
          {indicatorStyle.ready && (
            <span
              className="rep-tab-indicator"
              style={{
                transform: `translate3d(${indicatorStyle.left}px, ${indicatorStyle.top}px, 0)`,
                width: `${indicatorStyle.width}px`,
                height: `${indicatorStyle.height}px`
              }}
              aria-hidden="true"
            />
          )}
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = reportType === tab.id;
            return (
              <button
                key={tab.id}
                ref={el => { tabButtonRefs.current[tab.id] = el; }}
                role="tab"
                aria-selected={isActive}
                className={`rep-tab-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => setReportType(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Modern Toolbar: Search & Records Stats */}
      <div className="rep-toolbar-card">
        <div className="rep-toolbar">
          <div className="rep-search-box">
            <Search size={16} className="rep-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="rep-search-input"
              placeholder="Search records..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search records"
            />
            {search && (
              <button
                type="button"
                className="rep-search-clear"
                onClick={() => setSearch('')}
                title="Clear filter"
                aria-label="Clear filter"
              >
                ×
              </button>
            )}
          </div>

          <div className="rep-toolbar-meta">
            <span className="rep-badge-records">
              Showing <span className="rep-badge-count">{filteredData.length}</span> records
            </span>
            <button
              type="button"
              className="rep-btn-refresh"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh report records"
            >
              <RefreshCw size={13} className={loading ? 'rep-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Polished Preview Table Card */}
      <div className="rep-table-card">
        {loading ? (
          <div className="rep-state-card">
            <div className="rep-state-icon">
              <RefreshCw size={24} className="rep-spin" style={{ color: 'var(--gc-blue, #2563eb)' }} />
            </div>
            <div className="rep-state-title">Loading report preview...</div>
            <p className="rep-state-desc">
              Compiling live data, calculations, and compliance information.
            </p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="rep-state-card">
            <div className="rep-state-icon">
              <Search size={24} />
            </div>
            <div className="rep-state-title">No matching records found</div>
            <p className="rep-state-desc">
              {search
                ? `No records matching "${search}". Try adjusting or clearing your filter.`
                : 'No data available for this report type at the moment.'}
            </p>
          </div>
        ) : (
          <div className="rep-table-scroll">
            <table className="rep-table">
              {/* Table Headers */}
              <thead>
                {reportType === 'master' && (
                  <tr>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>Vehicle</th>
                    <th>Model</th>
                    <th>Current KM</th>
                    <th>Insurance Status</th>
                    <th>PUC Expiry</th>
                    <th>Last Service</th>
                    <th className="rep-th-num">Total Billed</th>
                    <th className="rep-th-num">Total Paid</th>
                    <th className="rep-th-num">Outstanding</th>
                  </tr>
                )}
                {reportType === 'billing' && (
                  <tr>
                    <th>Bill Number</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Payment Method</th>
                    <th className="rep-th-num">Total Amount</th>
                    <th className="rep-th-num">Paid Amount</th>
                    <th className="rep-th-num">Outstanding</th>
                    <th>Status</th>
                  </tr>
                )}
                {reportType === 'vehicles' && (
                  <tr>
                    <th>Vehicle Number</th>
                    <th>Type</th>
                    <th>Brand & Model</th>
                    <th>Current KM</th>
                    <th>Customer</th>
                    <th>Insurance Expiry</th>
                    <th>PUC Expiry</th>
                    <th>Next Service</th>
                  </tr>
                )}
                {reportType === 'services' && (
                  <tr>
                    <th>Service Date</th>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>KM Reading</th>
                    <th>Work Performed</th>
                    <th>Oil Changed</th>
                    <th className="rep-th-num">Amount</th>
                  </tr>
                )}
                {reportType === 'outstanding' && (
                  <tr>
                    <th>Bill Number</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>Vehicle</th>
                    <th className="rep-th-num">Total Amount</th>
                    <th className="rep-th-num">Paid Amount</th>
                    <th className="rep-th-num">Outstanding Due</th>
                  </tr>
                )}
              </thead>

              {/* Table Body */}
              <tbody>
                {reportType === 'master' &&
                  filteredData.map(item => (
                    <tr key={item._id}>
                      <td>
                        <span className="rep-customer-name">{item.customer?.name || 'Customer'}</span>
                      </td>
                      <td>{item.customer?.mobile || 'N/A'}</td>
                      <td>
                        <span className="rep-vehicle-badge">{item.vehicleNumber}</span>
                      </td>
                      <td>{[item.brand, item.model].filter(Boolean).join(' ') || '—'}</td>
                      <td>{(item.currentKm || 0).toLocaleString('en-IN')} KM</td>
                      <td>{renderInsuranceStatus(item.insuranceStatus)}</td>
                      <td>
                        {item.pucExpiryDate ? new Date(item.pucExpiryDate).toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td>
                        {item.lastServiceDate ? new Date(item.lastServiceDate).toLocaleDateString('en-IN') : 'None'}
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-billed">₹{(item.totalBilled || 0).toLocaleString('en-IN')}</span>
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-paid">₹{(item.totalPaid || 0).toLocaleString('en-IN')}</span>
                      </td>
                      <td className="rep-td-num">
                        {(item.outstanding || 0) > 0 ? (
                          <span className="rep-amount-due">₹{(item.outstanding || 0).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="rep-amount-zero">₹{(item.outstanding || 0).toLocaleString('en-IN')}</span>
                        )}
                      </td>
                    </tr>
                  ))}

                {reportType === 'billing' &&
                  filteredData.map(item => {
                    const isPaid = (item.outstanding || 0) <= 0;
                    return (
                      <tr key={item._id}>
                        <td>
                          <span className="rep-bill-badge">{item.billNumber}</span>
                        </td>
                        <td>{item.date ? new Date(item.date).toLocaleDateString('en-IN') : '—'}</td>
                        <td>
                          <span className="rep-customer-name">
                            {item.customer?.name || item.customerDetails?.name || 'Customer'}
                          </span>
                        </td>
                        <td>
                          <span className="rep-vehicle-badge">
                            {item.vehicle?.vehicleNumber || item.vehicleDetails?.vehicleNumber || 'N/A'}
                          </span>
                        </td>
                        <td>{item.paymentAccountDetails?.name || 'Standard'}</td>
                        <td className="rep-td-num">
                          <span className="rep-amount-billed">
                            ₹{Number(item.totalAmount || 0).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="rep-td-num">
                          <span className="rep-amount-paid">
                            ₹{Number(item.totalPaid || 0).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="rep-td-num">
                          {(item.outstanding || 0) > 0 ? (
                            <span className="rep-amount-due">
                              ₹{Number(item.outstanding || 0).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="rep-amount-zero">
                              ₹{Number(item.outstanding || 0).toLocaleString('en-IN')}
                            </span>
                          )}
                        </td>
                        <td>
                          {isPaid ? (
                            <span className="rep-pill rep-pill-valid">PAID IN FULL</span>
                          ) : (item.totalPaid || 0) > 0 ? (
                            <span className="rep-pill rep-pill-warning">PARTIAL</span>
                          ) : (
                            <span className="rep-pill rep-pill-expired">UNPAID</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                {reportType === 'vehicles' &&
                  filteredData.map(item => (
                    <tr key={item._id}>
                      <td>
                        <span className="rep-vehicle-badge">{item.vehicleNumber}</span>
                      </td>
                      <td>{item.vehicleType}</td>
                      <td>{[item.brand, item.model].filter(Boolean).join(' ') || '—'}</td>
                      <td>{(item.currentKm || 0).toLocaleString('en-IN')} KM</td>
                      <td>
                        <span className="rep-customer-name">{item.customer?.name || 'Customer'}</span>
                      </td>
                      <td>
                        {item.insuranceExpiryDate
                          ? new Date(item.insuranceExpiryDate).toLocaleDateString('en-IN')
                          : 'N/A'}
                      </td>
                      <td>
                        {item.pucExpiryDate
                          ? new Date(item.pucExpiryDate).toLocaleDateString('en-IN')
                          : 'N/A'}
                      </td>
                      <td>
                        {item.nextServiceDate
                          ? new Date(item.nextServiceDate).toLocaleDateString('en-IN')
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}

                {reportType === 'services' &&
                  filteredData.map(item => (
                    <tr key={item._id}>
                      <td>
                        {item.serviceDate
                          ? new Date(item.serviceDate).toLocaleDateString('en-IN')
                          : '—'}
                      </td>
                      <td>
                        <span className="rep-vehicle-badge">
                          {item.vehicle?.vehicleNumber || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className="rep-customer-name">{item.customer?.name || 'Customer'}</span>
                      </td>
                      <td>{(item.vehicleKm || 0).toLocaleString('en-IN')} KM</td>
                      <td>
                        <span
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: '240px' }}
                          title={item.workPerformed}
                        >
                          {item.workPerformed || '—'}
                        </span>
                      </td>
                      <td>
                        {item.oilChanged ? (
                          <span className="rep-pill rep-pill-sky">Yes</span>
                        ) : (
                          <span className="rep-pill rep-pill-neutral">No</span>
                        )}
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-billed">
                          ₹{Number(item.serviceAmount || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                    </tr>
                  ))}

                {reportType === 'outstanding' &&
                  filteredData.map(item => (
                    <tr key={item._id}>
                      <td>
                        <span className="rep-bill-badge">{item.billNumber}</span>
                      </td>
                      <td>
                        {item.date ? new Date(item.date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td>
                        <span className="rep-customer-name">
                          {item.customer?.name || item.customerDetails?.name || 'Customer'}
                        </span>
                      </td>
                      <td>{item.customer?.mobile || item.customerDetails?.mobile || 'N/A'}</td>
                      <td>
                        <span className="rep-vehicle-badge">
                          {item.vehicle?.vehicleNumber || item.vehicleDetails?.vehicleNumber || 'N/A'}
                        </span>
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-billed">
                          ₹{Number(item.totalAmount || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-paid">
                          ₹{Number(item.totalPaid || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="rep-td-num">
                        <span className="rep-amount-due">
                          ₹{Number(item.outstanding || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
