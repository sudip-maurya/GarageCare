import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ExcelJS from 'exceljs';
import api from '../utils/api';
import InsuranceOverview from '../components/InsuranceOverview';
import GcSelect from '../components/GcSelect';
import './insurance.css';
import {
  ShieldCheck,
  Phone,
  MessageCircle,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  Send,
  Download,
  Filter,
  X
} from 'lucide-react';

const getDaysDiff = (expiryDate) => {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  return Math.round((expDay - startOfToday) / (1000 * 60 * 60 * 24));
};

const InsuranceRenewal = () => {
  const [vehicles, setVehicles] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    overdue: 0,
    in30Days: 0,
    in60Days: 0,
    valid: 0,
    notRecorded: 0
  });
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState({ type: '', text: '' });
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const tableRef = useRef(null);

  // Fetch Insurance Agent settings
  useEffect(() => {
    api.get('/settings/insurance-agent')
      .then(({ data }) => setAgent(data || null))
      .catch(() => setAgent(null));
  }, []);

  // Fetch live insurance records and counts
  const fetchInsuranceReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/insurance');
      setVehicles(data?.vehicles || []);
      setCounts(data?.counts || {});
    } catch (err) {
      console.error('Failed to load insurance report:', err);
      setVehicles([]);
      setCounts({});
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    fetchInsuranceReport();
  }, [fetchInsuranceReport]);

  // Compute live stats for Insurance Overview
  const overviewStats = useMemo(() => {
    let active = 0;
    let renewingSoon = 0;
    let expired = 0;

    vehicles.forEach(v => {
      const diff = v.diffDays !== undefined && v.diffDays !== null
        ? v.diffDays
        : getDaysDiff(v.insuranceExpiryDate);

      if (diff === null) return;

      if (diff < 0) {
        expired++;
      } else {
        active++;
        if (diff <= 30) {
          renewingSoon++;
        }
      }
    });

    const nextRenewal = vehicles.find(v => {
      const diff = v.diffDays !== undefined && v.diffDays !== null
        ? v.diffDays
        : getDaysDiff(v.insuranceExpiryDate);
      return diff !== null && diff >= 0;
    }) || null;

    return {
      valid: active || counts?.valid || 0,
      in30Days: renewingSoon || counts?.in30Days || 0,
      overdue: expired || counts?.overdue || 0,
      nextRenewal
    };
  }, [vehicles, counts]);

  // Scroll to table and filter by due in 30 days
  const handleViewRenewals = () => {
    setFilterType('due30');
    requestAnimationFrame(() => {
      const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      tableRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  // Search + Filter working together dynamically
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(item => {
      const diff = item.diffDays !== undefined && item.diffDays !== null
        ? item.diffDays
        : getDaysDiff(item.insuranceExpiryDate);

      // 1. Expiry Window Filter (Expired records MUST NOT appear in 7/15/30-day filters)
      if (filterType === 'expired') {
        if (diff === null || diff >= 0) return false;
      } else if (filterType === 'due7') {
        if (diff === null || diff < 0 || diff > 7) return false;
      } else if (filterType === 'due15') {
        if (diff === null || diff < 0 || diff > 15) return false;
      } else if (filterType === 'due30') {
        if (diff === null || diff < 0 || diff > 30) return false;
      }

      // 2. Search Query (Vehicle Number, Customer Name, Mobile, Model)
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const vNum = (item.vehicleNumber || '').toLowerCase();
        const cName = (item.customer?.name || '').toLowerCase();
        const cMobile = (item.customer?.mobile || '').toLowerCase();
        const model = ([item.brand, item.model].filter(Boolean).join(' ') || item.vehicleType || '').toLowerCase();

        if (!vNum.includes(q) && !cName.includes(q) && !cMobile.includes(q) && !model.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [vehicles, filterType, search]);

  // Export complete report to Excel
  const handleExportExcel = async () => {
    setExporting(true);
    setExportMessage({ type: '', text: '' });
    try {
      const { data } = await api.get('/reports/insurance');
      const insuranceRecords = (data?.vehicles || [])
        .filter(vehicle => vehicle.insuranceExpiryDate)
        .sort((left, right) => new Date(left.insuranceExpiryDate) - new Date(right.insuranceExpiryDate));

      if (!insuranceRecords.length) {
        setExportMessage({ type: 'warning', text: 'No insurance records available to export.' });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'GarageCare';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Insurance Renewals', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
      worksheet.columns = [
        { header: 'Insurance Expiry Date', key: 'expiryDate', width: 22, style: { numFmt: 'dd-mm-yyyy' } },
        { header: 'Status', key: 'status', width: 23 },
        { header: 'Vehicle Number', key: 'vehicleNumber', width: 18 },
        { header: 'Customer Name', key: 'customerName', width: 26 },
        { header: 'Customer Mobile', key: 'customerMobile', width: 20 },
        { header: 'Vehicle Type', key: 'vehicleType', width: 16 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Model', key: 'model', width: 20 }
      ];

      insuranceRecords.forEach(vehicle => {
        worksheet.addRow({
          expiryDate: new Date(vehicle.insuranceExpiryDate),
          status: vehicle.insuranceLabel || 'Not Recorded',
          vehicleNumber: vehicle.vehicleNumber || '',
          customerName: vehicle.customer?.name || '',
          customerMobile: vehicle.customer?.mobile || '',
          vehicleType: vehicle.vehicleType || '',
          brand: vehicle.brand || '',
          model: vehicle.model || ''
        });
      });

      const header = worksheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D6EFD' } };
      header.alignment = { vertical: 'middle' };
      header.height = 22;
      worksheet.autoFilter = { from: 'A1', to: 'H1' };
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { vertical: 'middle' };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const link = document.createElement('a');
      const downloadUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      link.href = downloadUrl;
      link.download = `GarageCare_Insurance_Renewals_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setExportMessage({
        type: 'success',
        text: `Exported ${insuranceRecords.length} insurance record${insuranceRecords.length === 1 ? '' : 's'} to Excel.`
      });
    } catch (error) {
      console.error('Failed to export insurance records:', error);
      setExportMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Unable to export insurance records. Please try again.'
      });
    } finally {
      setExporting(false);
    }
  };

  const formatWhatsAppNumber = (num) => {
    if (!num) return '';
    const digits = String(num).replace(/\D/g, '');
    return digits.length === 10 ? `91${digits}` : digits;
  };

  // WhatsApp Agent regarding customer's vehicle
  const handleSendToAgent = (item) => {
    if (!agent?.whatsapp) {
      alert('Insurance Agent WhatsApp is not configured. Add it in Garage Profile settings first.');
      return;
    }

    const agentPhone = formatWhatsAppNumber(agent.whatsapp);
    const cName = item.customer?.name || 'Customer';
    const cMobile = item.customer?.mobile || 'N/A';
    const vNum = item.vehicleNumber;
    const vDesc = [item.brand, item.model].filter(Boolean).join(' ') || item.vehicleType;
    const expDate = item.insuranceExpiryDate
      ? new Date(item.insuranceExpiryDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      : 'Unknown';

    const lines = [
      `Hello ${agent.name},`,
      '',
      'Requesting an Insurance Renewal quote from GarageCare:',
      '',
      `Vehicle Number: ${vNum}`,
      `Vehicle Model: ${vDesc}`,
      `Customer Name: ${cName}`,
      `Customer Mobile: ${cMobile}`,
      `Policy Expiry Date: ${expDate}`,
      '',
      'Please check available renewal policies/discounts and coordinate with the customer.',
      '',
      `Thank you,`,
      'GarageCare'
    ];

    const url = `https://wa.me/${agentPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  };

  // WhatsApp Customer renewal reminder
  const handleRemindCustomer = (item) => {
    const mobile = item.customer?.mobile;
    if (!mobile) {
      alert('Customer does not have a recorded mobile number.');
      return;
    }

    const phone = formatWhatsAppNumber(mobile);
    const cName = item.customer?.name || 'Customer';
    const vNum = item.vehicleNumber;
    const vDesc = [item.brand, item.model].filter(Boolean).join(' ') || 'vehicle';
    const expDate = item.insuranceExpiryDate
      ? new Date(item.insuranceExpiryDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      : 'soon';

    const lines = [
      `Hello ${cName},`,
      '',
      'Important Insurance Notice from GarageCare:',
      '',
      `The motor insurance for your vehicle (${vDesc} - ${vNum}) is due to expire on ${expDate}.`,
      '',
      'OUR INSURANCE AGENT WILL DO EVERYTHING FOR YOU!',
      'We will handle the renewal process, paperwork, and ensure maximum No-Claim Bonus (NCB) discount for your vehicle.',
      '',
      agent?.phone ? `Call our Insurance Agent: ${agent.phone}` : '',
      agent?.whatsapp ? `WhatsApp Insurance Desk: ${agent.whatsapp}` : '',
      '',
      'Drive Safe & Stay Protected!',
      'GarageCare'
    ].filter(Boolean);

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  };

  const getStatusBadge = (item) => {
    const diff = item.diffDays !== undefined && item.diffDays !== null
      ? item.diffDays
      : getDaysDiff(item.insuranceExpiryDate);

    if (diff === null) {
      return <span className="badge bg-secondary ins-pill">Not Recorded</span>;
    }
    if (diff < 0) {
      return (
        <span className="badge bg-danger ins-pill d-inline-flex align-items-center gap-1">
          <AlertTriangle size={12} /> Expired ({Math.abs(diff)}d ago)
        </span>
      );
    }
    if (diff <= 7) {
      return (
        <span className="badge bg-warning ins-pill d-inline-flex align-items-center gap-1">
          <Clock size={12} /> Due in {diff}d
        </span>
      );
    }
    if (diff <= 30) {
      return (
        <span className="badge bg-warning ins-pill d-inline-flex align-items-center gap-1">
          <Clock size={12} /> Due in {diff}d
        </span>
      );
    }
    if (diff <= 60) {
      return (
        <span className="badge bg-info ins-pill d-inline-flex align-items-center gap-1">
          <Clock size={12} /> Due in {diff}d
        </span>
      );
    }
    return (
      <span className="badge bg-success ins-pill d-inline-flex align-items-center gap-1">
        <ShieldCheck size={12} /> Valid Policy
      </span>
    );
  };

  const filterLabels = {
    all: 'All',
    expired: 'Expired / Overdue',
    due7: 'Due in 7 Days',
    due15: 'Due in 15 Days',
    due30: 'Due in 30 Days'
  };

  return (
    <div className="gc-page ins-page">
      {/* Page Header (Matches Services header style) */}
      <div className="ins-header">
        <div>
          <h2 className="ins-title">Insurance Renewal</h2>
          <p className="ins-subtitle">Track insurance expiry and manage vehicle renewal reminders.</p>
        </div>
      </div>

      {/* Insurance Overview */}
      <InsuranceOverview
        counts={overviewStats}
        nextRenewal={overviewStats.nextRenewal}
        ready={ready}
        onViewRenewals={handleViewRenewals}
        onSelectFilter={(key) => setFilterType(key)}
        activeFilter={filterType}
      />

      {/* Export Feedback Alert */}
      {exportMessage.text && (
        <div className={`alert alert-${exportMessage.type} py-2 mb-3`} role="alert">
          {exportMessage.text}
        </div>
      )}

      {/* 3. Renewal Table Card with Search & Filter Toolbar */}
      <div className="gc-table-card ins-table-card" ref={tableRef}>
        <div className="ins-toolbar">
          <div className="ins-toolbar-left">
            {/* Search Input */}
            <div className="ins-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search vehicle, customer, mobile..."
                aria-label="Search insurance records"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="ins-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Dropdown beside Search */}
            <div className="ins-filter-wrap">
              <Filter size={14} className="ins-filter-icon" aria-hidden="true" />
              <GcSelect
                className="ins-filter-select"
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'expired', label: 'Expired / Overdue' },
                  { value: 'due7', label: 'Due in 7 Days' },
                  { value: 'due15', label: 'Due in 15 Days' },
                  { value: 'due30', label: 'Due in 30 Days' }
                ]}
                ariaLabel="Filter policies by expiry window"
              />
            </div>

            {/* Dynamic Showing X records badge */}
            <span className="ins-badge-records">
              Showing <span className="ins-badge-count">{filteredVehicles.length}</span> {filteredVehicles.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="ins-toolbar-actions">
            <button
              type="button"
              className="btn btn-outline-secondary ins-btn-refresh"
              onClick={fetchInsuranceReport}
              disabled={loading}
              title="Reload the insurance list"
            >
              <RefreshCw size={14} className={loading ? 'ins-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="btn btn-success ins-btn-export"
              onClick={handleExportExcel}
              disabled={exporting}
              title="Export the complete insurance report to Excel"
            >
              <Download size={14} className={exporting ? 'ins-spin' : ''} />
              <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        <div className="gc-table-scroll">
          <table className="table table-hover align-middle mb-0 ins-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Customer</th>
                <th>Policy Expiry</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5">
                    <div className="ins-loading">
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Loading insurance records...
                    </div>
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="ins-empty">
                      <span className="ins-empty-icon" aria-hidden="true">
                        <ShieldCheck size={26} />
                      </span>
                      <div className="ins-empty-title">No vehicles found</div>
                      <p className="ins-empty-text">
                        No records found matching &ldquo;{filterLabels[filterType] || filterType}&rdquo;
                        {search ? ` and search "${search}"` : ''}.
                      </p>
                      {(search || filterType !== 'all') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary ins-empty-clear"
                          onClick={() => {
                            setSearch('');
                            setFilterType('all');
                          }}
                        >
                          <X size={13} className="me-1" /> Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map(item => (
                  <tr key={item._id}>
                    <td>
                      <div className="ins-vnum">{item.vehicleNumber}</div>
                      <span className="ins-vsub">
                        {[item.brand, item.model].filter(Boolean).join(' ') || item.vehicleType}
                      </span>
                    </td>
                    <td>
                      <div className="ins-cname">{item.customer?.name || 'Customer'}</div>
                      <span className="ins-cmob">
                        <Phone size={12} /> {item.customer?.mobile || 'No Mobile'}
                      </span>
                    </td>
                    <td>
                      <div className="ins-expiry">
                        {item.insuranceExpiryDate
                          ? new Date(item.insuranceExpiryDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })
                          : <span className="ins-exp-none">Not Recorded</span>}
                      </div>
                    </td>
                    <td>{getStatusBadge(item)}</td>
                    <td className="text-end ins-actions-cell">
                      <div className="gc-actions">
                        <button
                          type="button"
                          className="ins-act-btn ins-act-agent"
                          onClick={() => handleSendToAgent(item)}
                          title="Forward vehicle details to Insurance Agent via WhatsApp"
                          aria-label="Send to Agent"
                        >
                          <Send size={15} />
                        </button>
                        <button
                          type="button"
                          className="ins-act-btn ins-act-customer"
                          onClick={() => handleRemindCustomer(item)}
                          title="Send renewal reminder to Customer via WhatsApp"
                          aria-label="Remind Customer"
                        >
                          <MessageCircle size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InsuranceRenewal;
