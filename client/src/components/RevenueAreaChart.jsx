import { useState, useId, useRef, useLayoutEffect } from 'react';

const inr = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

/**
 * Calculate round, clean Y-axis ticks (~4 intervals)
 */
function calculateYScale(maxVal) {
  if (!maxVal || maxVal <= 0) {
    return { maxY: 8000, ticks: [8000, 6000, 4000, 2000, 0] };
  }
  const rawStep = maxVal / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const fraction = rawStep / power;
  let niceFraction = 1;
  if (fraction > 5) niceFraction = 10;
  else if (fraction > 2) niceFraction = 5;
  else if (fraction > 1) niceFraction = 2;
  else niceFraction = 1;

  const step = niceFraction * power;
  const maxY = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let val = maxY; val >= 0; val -= step) {
    ticks.push(val);
  }
  return { maxY, ticks };
}

/**
 * Format tick labels (e.g. ₹0, ₹2k, ₹4k, ₹6k, ₹8k)
 */
function formatTick(val) {
  if (val === 0) return '₹0';
  if (val >= 1000) {
    const k = val / 1000;
    return Number.isInteger(k) ? `₹${k}k` : `₹${k.toFixed(1)}k`;
  }
  return `₹${val}`;
}

/**
 * Generate smooth cubic bezier curve path through points with baseline clamping
 */
function getSmoothPath(points, tension = 0.25, baseY) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    let cp1x = p1.x + (p2.x - p0.x) * tension;
    let cp1y = p1.y + (p2.y - p0.y) * tension;
    let cp2x = p2.x - (p3.x - p1.x) * tension;
    let cp2y = p2.y - (p3.y - p1.y) * tension;

    // Baseline clamping to prevent curve dipping below ₹0
    if (baseY !== undefined) {
      if (p1.y >= baseY && p2.y >= baseY) {
        cp1y = baseY;
        cp2y = baseY;
      } else {
        if (cp1y > baseY) cp1y = baseY;
        if (cp2y > baseY) cp2y = baseY;
      }
    }

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return path;
}

const RevenueAreaChart = ({
  series = [],
  period = '7d',
  totalRevenue = 0
}) => {
  const gradientId = useId();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(650);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || containerRef.current.getBoundingClientRect().width;
        if (w > 0) setContainerWidth(Math.round(w));
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const daysCount = period === '7d' ? 7 : period === '10d' ? 10 : 30;
  const maxRevenue = Math.max(...series.map(s => Number(s.total) || 0), 0);
  const { maxY, ticks } = calculateYScale(maxRevenue);

  // SVG Layout dimensions
  const svgWidth = Math.max(containerWidth, 260);
  const isMobile = svgWidth < 450;
  const svgHeight = 210;
  const paddingLeft = isMobile ? 38 : 44;
  const paddingRight = isMobile ? 14 : 20;
  const paddingTop = 48; // room for peak bubble tooltip
  const paddingBottom = 30;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;
  const baseY = svgHeight - paddingBottom;

  const n = series.length;
  const points = series.map((s, i) => {
    const x = paddingLeft + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const val = Number(s.total) || 0;
    const y = baseY - (maxY > 0 ? (val / maxY) * chartH : 0);
    return { x, y, data: s, index: i };
  });

  // Identify peak point (highest revenue day)
  let peakIndex = -1;
  let peakVal = 0;
  series.forEach((s, idx) => {
    const val = Number(s.total) || 0;
    if (val > peakVal) {
      peakVal = val;
      peakIndex = idx;
    }
  });

  const activeIndex = hoveredIdx !== null ? hoveredIdx : (peakVal > 0 ? peakIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] : null;

  // SVG Paths
  const linePath = points.length > 0 ? getSmoothPath(points, 0.25, baseY) : '';
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`
    : '';

  // Summary pills calculations
  const bestDayItem = peakIndex !== -1 ? series[peakIndex] : null;
  const bestDayLabel = bestDayItem && peakVal > 0
    ? `${bestDayItem.fullDateLabel || bestDayItem.label || 'Day'} · ${inr(peakVal)}`
    : '—';

  const avgPerDayStr = inr(Math.round((Number(totalRevenue) || 0) / (daysCount || 1)));
  const billingDaysCount = series.filter(s => (Number(s.total) || 0) > 0).length;
  const billingDaysStr = `${billingDaysCount} of ${daysCount}`;

  // Tooltip coordinates & boundary clamp
  const tooltipWidth = 96;
  const tooltipHeight = 42;
  let tooltipX = activePoint ? activePoint.x - tooltipWidth / 2 : 0;
  if (tooltipX < 10) tooltipX = 10;
  if (tooltipX + tooltipWidth > svgWidth - 10) {
    tooltipX = svgWidth - 10 - tooltipWidth;
  }
  const tooltipY = activePoint ? Math.max(activePoint.y - tooltipHeight - 11, 4) : 0;

  return (
    <div className="dash-revenue-area-wrap" ref={containerRef}>
      {/* SVG Smooth Area Chart */}
      <div className="dash-area-chart-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          height={svgHeight}
          className="dash-area-chart-svg"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (!rect.width) return;
            const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
            let closestIdx = 0;
            let minDist = Infinity;
            points.forEach((p, idx) => {
              const dist = Math.abs(p.x - mouseX);
              if (dist < minDist) {
                minDist = dist;
                closestIdx = idx;
              }
            });
            setHoveredIdx(closestIdx);
          }}
          onTouchMove={(e) => {
            if (!e.touches || !e.touches[0]) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (!rect.width) return;
            const touchX = ((e.touches[0].clientX - rect.left) / rect.width) * svgWidth;
            let closestIdx = 0;
            let minDist = Infinity;
            points.forEach((p, idx) => {
              const dist = Math.abs(p.x - touchX);
              if (dist < minDist) {
                minDist = dist;
                closestIdx = idx;
              }
            });
            setHoveredIdx(closestIdx);
          }}
          onMouseLeave={() => setHoveredIdx(null)}
          onTouchEnd={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
              <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {ticks.map((tickVal) => {
            const y = baseY - (maxY > 0 ? (tickVal / maxY) * chartH : 0);
            return (
              <g key={`y-${tickVal}`} className="dash-chart-grid-group">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="dash-chart-y-tick"
                >
                  {formatTick(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Baseline Gridline */}
          <line
            x1={paddingLeft}
            y1={baseY}
            x2={svgWidth - paddingRight}
            y2={baseY}
            stroke="#e2e8f0"
            strokeWidth="1"
          />

          {/* Area Fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              className="dash-area-fill"
            />
          )}

          {/* Smooth Curve Line (3px solid blue) */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dash-curve-line"
            />
          )}

          {/* Data Points: Non-zero dots + Peak glow ring */}
          {points.map((p) => {
            const isNonZero = (Number(p.data.total) || 0) > 0;
            const isPeak = p.index === peakIndex && isNonZero;
            const isActive = p.index === activeIndex;

            // Show dot if non-zero OR actively hovered
            if (!isNonZero && !isActive) return null;

            return (
              <g key={`pt-${p.data.key || p.index}`}>
                {/* Glow ring on Peak or Active point */}
                {(isPeak || (isActive && isNonZero)) && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8.5"
                    fill="rgba(37, 99, 235, 0.15)"
                    stroke="#2563eb"
                    strokeWidth="1.5"
                    strokeOpacity="0.45"
                    className="dash-peak-glow"
                  />
                )}
                {/* Core dot: blue with white ring */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="dash-point-dot"
                />
              </g>
            );
          })}

          {/* Dark Bubble Tooltip (Peak or Hovered point) */}
          {activePoint && (hoveredIdx !== null || (Number(activePoint.data.total) || 0) > 0) && (
            <g className="dash-chart-tooltip-group" pointerEvents="none">
              {/* Tooltip Box */}
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                ry="8"
                fill="#0f172a"
                className="dash-tooltip-box"
              />
              {/* Downward triangle arrow */}
              <path
                d={`M ${activePoint.x - 5} ${tooltipY + tooltipHeight} L ${activePoint.x} ${tooltipY + tooltipHeight + 5} L ${activePoint.x + 5} ${tooltipY + tooltipHeight} Z`}
                fill="#0f172a"
              />
              {/* Date Header (uppercase) */}
              <text
                x={tooltipX + tooltipWidth / 2}
                y={tooltipY + 16}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9.5"
                fontWeight="600"
                letterSpacing="0.4"
                className="dash-tooltip-date"
              >
                {(activePoint.data.fullDateLabel || activePoint.data.label || '').toUpperCase()}
              </text>
              {/* Amount Value */}
              <text
                x={tooltipX + tooltipWidth / 2}
                y={tooltipY + 33}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12.5"
                fontWeight="700"
                className="dash-tooltip-val"
              >
                {inr(activePoint.data.total)}
              </text>
            </g>
          )}

          {/* Interactive Hover Columns (Wide invisible touch targets) */}
          {points.map((p, i) => {
            const colWidth = chartW / Math.max(n - 1, 1);
            const targetX = p.x - colWidth / 2;
            return (
              <rect
                key={`hit-${p.data.key || i}`}
                x={Math.max(targetX, 0)}
                y={0}
                width={colWidth}
                height={svgHeight}
                fill="transparent"
                style={{ cursor: p.data.total > 0 ? 'pointer' : 'default' }}
                onMouseEnter={() => setHoveredIdx(i)}
              />
            );
          })}

          {/* X-Axis Date Labels */}
          {points.map((p) => {
            const isToday = p.data.isToday;
            // In 10d or 30d mode, allow smart skipping if small width
            let displayLabel = p.data.label;
            if (period === '10d' && svgWidth < 420 && p.index % 2 !== 0 && !isToday) {
              displayLabel = '';
            }
            if (isToday && !displayLabel) {
              displayLabel = p.data.fullDateLabel;
            }
            if (!displayLabel) return null;
            const cleanLabel = displayLabel.replace(/Sept\b/gi, 'Sep');

            return (
              <text
                key={`x-${p.data.key || p.index}`}
                x={p.x}
                y={baseY + 18}
                textAnchor="middle"
                className={`dash-chart-x-tick ${isToday ? 'dash-tick-today' : ''}`}
                fontWeight={isToday ? '700' : '500'}
                fill={isToday ? '#0f172a' : '#64748b'}
              >
                {cleanLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* 3 Summary Pills below chart */}
      <div className="dash-revenue-pills">
        <div className="dash-revenue-pill">
          <span className="dash-revenue-pill-label">Best day</span>
          <span className="dash-revenue-pill-value">{bestDayLabel}</span>
        </div>
        <div className="dash-revenue-pill">
          <span className="dash-revenue-pill-label">Avg per day</span>
          <span className="dash-revenue-pill-value">{avgPerDayStr}</span>
        </div>
        <div className="dash-revenue-pill">
          <span className="dash-revenue-pill-label">Billing days</span>
          <span className="dash-revenue-pill-value">{billingDaysStr}</span>
        </div>
      </div>
    </div>
  );
};

export default RevenueAreaChart;
