import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { useSmartBack } from '../utils/navigation';
import { ArrowLeft, Clock, Receipt, Eye, IndianRupee, Wallet, Trash2, SlidersHorizontal, Calendar, Wrench } from 'lucide-react';
import GcSelect from '../components/GcSelect';
import './service-details.css';

const BILL_SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'older', label: 'Older' }
];

const ServiceDetails = () => {
  const { id } = useParams();
  const handleBack = useSmartBack('/services');
  const [service, setService] = useState(null);
  const [serviceHistory, setServiceHistory] = useState([]);
  const [relatedBills, setRelatedBills] = useState([]);
  const [sortOrder, setSortOrder] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [billsError, setBillsError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setBillsError('');

      const svcPromise = api.get('/services/' + id);
      const billsPromise = api.get('/bills/service/' + id);

      let svc;
      try {
        svc = await svcPromise;
      } catch (err) {
        console.error('Failed to load service:', err);
        setError('Failed to load');
        setLoading(false);
        return;
      }

      const currentService = svc.data;
      setService(currentService);

      let billsArray = [];
      try {
        const billsRes = await billsPromise;
        const rawBills = billsRes.data;
        if (Array.isArray(rawBills)) {
          billsArray = rawBills;
        } else if (rawBills && typeof rawBills === 'object') {
          billsArray = [rawBills];
        }
      } catch (billsErr) {
        console.error('Failed to load linked bills:', billsErr);
        setBillsError('Failed to load linked bills');
      }
      setRelatedBills(billsArray);

      // Safe extraction of vehicle ID whether populated object or string ID
      const vehicleId = currentService?.vehicle?._id || (typeof currentService?.vehicle === 'string' ? currentService.vehicle : null);

      let historyList = [];
      if (vehicleId) {
        try {
          const hist = await api.get('/services/vehicle/' + vehicleId);
          if (Array.isArray(hist.data)) {
            historyList = hist.data;
          }
        } catch (err) {
          console.error('Failed to fetch vehicle service history:', err);
        }
      }

      // Consolidate & deduplicate services for this vehicle
      // Requirement: Service History me har linked bill ke liye ek entry dikhni chahiye,
      // bill date ke saath, bill date ke order me (latest first).
      const serviceMap = new Map();

      // 1. First, map an entry for every linked bill using the bill's exact date and items
      for (const b of billsArray) {
        if (!b || !b._id) continue;
        const linkedServiceId = b.service?._id || (typeof b.service === 'string' ? b.service : null);
        const mapKey = linkedServiceId ? String(linkedServiceId) : `bill_${b._id}`;

        const workText = (Array.isArray(b.items) && b.items.length > 0)
          ? b.items.map(i => i.description || i.itemDescription).filter(Boolean).join(', ')
          : (b.service?.workPerformed || 'Service');

        serviceMap.set(mapKey, {
          _id: linkedServiceId || b._id,
          billId: b._id,
          serviceDate: b.date,
          workPerformed: workText || 'Service'
        });
      }

      // 2. Add currentService if not already represented by a bill
      if (currentService && currentService._id) {
        const curId = String(currentService._id);
        if (!serviceMap.has(curId)) {
          const matchingBill = billsArray.find(b => String(b.service?._id || b.service) === curId);
          if (matchingBill) {
            const workText = (Array.isArray(matchingBill.items) && matchingBill.items.length > 0)
              ? matchingBill.items.map(i => i.description || i.itemDescription).filter(Boolean).join(', ')
              : (currentService.workPerformed || 'Service');
            serviceMap.set(curId, {
              ...currentService,
              serviceDate: matchingBill.date,
              workPerformed: workText || 'Service'
            });
          } else {
            serviceMap.set(curId, { ...currentService });
          }
        }
      }

      // 3. Add any standalone services from historyList not already mapped
      for (const s of historyList) {
        if (!s || !s._id) continue;
        const sId = String(s._id);
        if (!serviceMap.has(sId)) {
          const matchingBill = billsArray.find(b => String(b.service?._id || b.service) === sId);
          if (matchingBill) {
            const workText = (Array.isArray(matchingBill.items) && matchingBill.items.length > 0)
              ? matchingBill.items.map(i => i.description || i.itemDescription).filter(Boolean).join(', ')
              : (s.workPerformed || 'Service');
            serviceMap.set(sId, {
              ...s,
              serviceDate: matchingBill.date,
              workPerformed: workText || 'Service'
            });
          } else {
            serviceMap.set(sId, { ...s });
          }
        }
      }

      // 4. Sort services by service date, newest/latest first
      const sortedHistory = Array.from(serviceMap.values()).sort((a, b) => {
        const timeA = new Date(a.serviceDate || a.date || a.createdAt || 0).getTime();
        const timeB = new Date(b.serviceDate || b.date || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        const createA = new Date(a.createdAt || 0).getTime();
        const createB = new Date(b.createdAt || 0).getTime();
        return createB - createA;
      });

      // Display ONLY the latest 6 service records
      setServiceHistory(sortedHistory.slice(0, 6));
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to load');
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setService(null);
    setServiceHistory([]);
    setRelatedBills([]);
    setBillsError('');
    loadData();
  }, [loadData]);

  const fmt = (d) => {
    if (!d) return 'Not available';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'Not available';
    }
  };

  const formatServiceDate = (d) => {
    if (!d) return { date: 'Not available', day: '' };
    try {
      const dateObj = new Date(d);
      if (isNaN(dateObj.getTime())) return { date: 'Not available', day: '' };
      const date = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const day = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
      return { date, day };
    } catch {
      return { date: 'Not available', day: '' };
    }
  };

  // 1. Sort all related bills by bill date / creation date (newest first).
  // 2. Limit display to a MAXIMUM of 6 related bills (latest 6).
  // 3. Respect user's sortOrder ('latest' or 'older') for display order.
  const latestSixBills = [...relatedBills]
    .sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;
      const createA = new Date(a.createdAt || 0).getTime();
      const createB = new Date(b.createdAt || 0).getTime();
      return createB - createA;
    })
    .slice(0, 6);

  const sortedBills = sortOrder === 'older'
    ? [...latestSixBills].reverse()
    : latestSixBills;

  const getStatusClass = (statusStr) => {
    const s = String(statusStr || '').toLowerCase().trim();
    if (s === 'paid' || s === 'fully paid') return 'status-paid';
    if (s === 'partial' || s === 'partially paid') return 'status-partial';
    return 'status-pending';
  };

  // A bill may only be deleted when nothing is outstanding and the
  // payment status is fully paid (mirrors the backend validation).
  const isBillPaid = (bill) => {
    const billStatus = String(bill?.paymentStatus || bill?.status || '').toLowerCase();
    const outstanding = Number(bill?.outstanding ?? (Number(bill?.totalAmount || 0) - Number(bill?.paidAmount || 0)));
    return outstanding <= 0 && (billStatus === 'paid' || billStatus === 'fully paid');
  };

  const handleDeleteBill = async (bill) => {
    if (!bill || deletingId) return;
    if (!isBillPaid(bill)) {
      window.alert('Bill cannot be deleted until it is fully paid.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete bill #${bill.billNumber}?`)) return;
    try {
      setDeletingId(bill._id);
      await api.delete('/bills/' + bill._id);
      await loadData();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || 'Unable to delete this bill.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error || !service) {
    return <div className="alert alert-warning">{error || 'Service not found'}</div>;
  }

  return (
    <div className="sd-page">
      {/* ---------- Page Header ---------- */}
      <div className="sd-header">
        <div className="sd-header-text">
          <h1 className="sd-title">Service Details</h1>
          <p className="sd-subtitle">View service information, history and related billing details.</p>
        </div>
        <button type="button" onClick={handleBack} className="sd-back-btn" style={{ font: 'inherit', cursor: 'pointer' }}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="sd-cards">
        {/* ---------- Related Bill Card ---------- */}
        <div className="sd-card sd-card-bill">
          <div className="sd-card-header sd-card-header-bill">
            <div className="sd-card-header-left">
              <span className="sd-card-icon sd-card-icon-blue"><Receipt size={17} /></span>
              <h2 className="sd-card-title">Linked Bills</h2>
            </div>
            <div className="sd-card-header-right">
              <div className="sd-filter-wrap">
                <SlidersHorizontal size={13} className="sd-filter-icon" aria-hidden="true" />
                <GcSelect
                  className="sd-filter-select"
                  value={sortOrder}
                  onChange={setSortOrder}
                  options={BILL_SORT_OPTIONS}
                  ariaLabel="Sort linked bills"
                />
              </div>
            </div>
          </div>
          <div className="sd-card-body">
            {billsError ? (
              <div className="alert alert-warning py-2 mb-0">{billsError}</div>
            ) : sortedBills.length === 0 ? (
              <p className="sd-empty-text">No related bills found</p>
            ) : (
              <div className="sd-bills-list">
                {sortedBills.map((bill) => {
                  const canDelete = isBillPaid(bill);
                  const isDeleting = deletingId === bill._id;
                  return (
                    <div key={bill._id} className="sd-bill">
                      <div className="sd-bill-field">
                        <div className="sd-info-label"><Receipt size={13} /> Bill Date</div>
                        <div className="sd-bill-number">{fmt(bill.date)}</div>
                      </div>
                      <div className="sd-bill-field">
                        <div className="sd-info-label"><Receipt size={13} /> Bill Number</div>
                        <div className="sd-bill-number">#{bill.billNumber}</div>
                      </div>
                      <div className="sd-bill-field">
                        <div className="sd-info-label"><IndianRupee size={13} /> Total Amount</div>
                        <div className="sd-bill-total">₹{Number(bill.totalAmount || 0).toFixed(2)}</div>
                      </div>
                      <div className="sd-bill-field sd-bill-field-status">
                        <div className="sd-bill-status-wrap">
                          <div className="sd-info-label"><Wallet size={13} /> Payment Status</div>
                          <span className={`sd-bill-status ${getStatusClass(bill.paymentStatus || bill.status)}`}>
                            {bill.paymentStatus || bill.status || 'Pending'}
                          </span>
                        </div>
                      </div>
                      <div className="sd-bill-actions">
                        <Link
                          to={'/bills/view/' + bill._id}
                          state={{ from: `/services/view/${id}` }}
                          className="sd-view-bill-btn"
                        >
                          <Eye size={16} /> View Bill
                        </Link>
                        <button
                          type="button"
                          className={`sd-delete-bill-btn${canDelete ? '' : ' is-disabled'}`}
                          onClick={() => handleDeleteBill(bill)}
                          disabled={isDeleting}
                          aria-disabled={!canDelete}
                          aria-label={`Delete Bill #${bill.billNumber}`}
                          title={canDelete ? 'Delete Bill' : 'Bill cannot be deleted until it is fully paid.'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Service History Card ---------- */}
        <div className="sd-card sd-card-history">
          <div className="sd-card-header sd-card-header-history">
            <span className="sd-card-icon sd-card-icon-blue"><Clock size={17} /></span>
            <div className="sd-card-title-group">
              <h2 className="sd-card-title">Service History</h2>
              <span className="sd-card-subtitle">Last 6 service records</span>
            </div>
          </div>
          <div className="sd-card-body">
            {serviceHistory.length === 0 ? (
              <p className="sd-empty-text">No previous service history available.</p>
            ) : (
              <div className="sd-history-list">
                {serviceHistory.map((svc) => {
                  const { date, day } = formatServiceDate(svc.serviceDate || svc.createdAt);
                  return (
                    <div key={svc._id} className="sd-history-row">
                      <div className="sd-history-cal-box" aria-hidden="true">
                        <Calendar size={17} />
                      </div>
                      <div className="sd-history-date-col">
                        <span className="sd-history-date">{date}</span>
                        {day ? <span className="sd-history-day">{day}</span> : null}
                      </div>
                      <div className="sd-history-divider" aria-hidden="true" />
                      <div className="sd-history-work-col">
                        <Wrench size={16} className="sd-history-wrench" aria-hidden="true" />
                        <span className="sd-history-work-text">{svc.workPerformed || 'Service'}</span>
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
  );
};

export default ServiceDetails;