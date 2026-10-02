import { ArrowRight, CalendarDays, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';

const formatRenewalDate = (value) => new Date(value).toLocaleDateString('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

/**
 * Insurance Overview — matching the visual style of the Reminder KPI cards:
 * - Same card proportions, padding (20px), and rounded corners (18px)
 * - 3px top colored accent bar
 * - Top-right 44x44px soft-colored icon container
 * - Typography hierarchy: label → large value → small description
 * - Green (Active), Amber (Soon), Red (Expired), Blue (Next)
 */
const InsuranceOverview = ({
  counts,
  nextRenewal,
  ready = false,
  onViewRenewals,
  onSelectFilter,
  activeFilter
}) => {
  const nextRenewalValue = nextRenewal?.insuranceExpiryDate ? formatRenewalDate(nextRenewal.insuranceExpiryDate) : '—';
  const nextRenewalMeta = !ready
    ? 'Loading…'
    : nextRenewal
      ? (nextRenewal.vehicleNumber || 'Nearest policy')
      : 'No upcoming renewal';

  const stats = [
    {
      key: 'active',
      tone: 'green',
      filterKey: 'all',
      label: 'ACTIVE POLICIES',
      value: counts?.valid ?? 0,
      meta: 'Currently valid',
      icon: ShieldCheck
    },
    {
      key: 'soon',
      tone: 'amber',
      filterKey: 'due30',
      label: 'RENEWING SOON',
      value: counts?.in30Days ?? 0,
      meta: 'Due within 30 days',
      icon: Clock
    },
    {
      key: 'expired',
      tone: 'red',
      filterKey: 'expired',
      label: 'EXPIRED',
      value: counts?.overdue ?? 0,
      meta: 'Past expiry date',
      icon: ShieldAlert
    },
    {
      key: 'next',
      tone: 'blue',
      filterKey: 'due30',
      label: 'NEXT RENEWAL',
      value: nextRenewalValue,
      meta: nextRenewalMeta,
      icon: CalendarDays,
      isDate: true
    }
  ];

  return (
    <section className="ins-overview" aria-labelledby="ins-overview-title">
      <div className="ins-ov-head">
        <div className="ins-ov-head-main">
          <span className="ins-ov-ic" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div className="ins-ov-titles">
            <h3 className="ins-ov-title" id="ins-overview-title">Insurance Overview</h3>
            <p className="ins-ov-subtitle">Track upcoming renewals and expired policies at a glance.</p>
          </div>
        </div>
        <button
          type="button"
          className="ins-ov-view"
          onClick={onViewRenewals}
          title="Filter by policies due in 30 days and scroll to list"
        >
          <span>View Renewals</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="ins-ov-grid" role="group" aria-label="Insurance summary cards">
        {stats.map(({ key, tone, filterKey, label, value, meta, icon: Icon, isDate }) => {
          const isSelected = activeFilter === filterKey;
          return (
            <button
              type="button"
              key={key}
              className={`ins-ov-card tone-${tone} ${isSelected ? 'is-active' : ''}`}
              onClick={() => onSelectFilter && onSelectFilter(filterKey)}
              aria-pressed={isSelected}
              title={`Click to filter by ${label}`}
            >
              <div className="ins-ov-card-top">
                <span className="ins-ov-label">{label}</span>
                <span className="ins-ov-card-ic" aria-hidden="true">
                  <Icon size={22} />
                </span>
              </div>
              <div className="ins-ov-card-body">
                <div className={`ins-ov-value${isDate ? ' is-date' : ''}`}>{value}</div>
                <div className="ins-ov-sub">{meta}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default InsuranceOverview;
