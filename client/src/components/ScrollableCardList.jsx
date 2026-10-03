import { useRef, useLayoutEffect } from 'react';

/**
 * Reusable scrollable container for dashboard card lists.
 * Follows the "Vehicles Requiring Attention" scroll pattern:
 * - When items <= maxItems: displays without vertical scrollbar (overflow-y: hidden, maxHeight: none).
 * - When items > maxItems: caps height at exactly `maxItems` and scrolls internally (overflow-y: auto).
 * - Keeps page scroll stable and scrollbars subtle.
 */
const ScrollableCardList = ({
  children,
  maxItems,
  className = '',
  style = {},
  ...props
}) => {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    if (!maxItems || !containerRef.current) return;

    const updateMaxHeight = () => {
      const container = containerRef.current;
      if (!container) return;

      const isTableWrap = container.classList.contains('table-responsive');
      const items = isTableWrap
        ? container.querySelectorAll('tbody tr')
        : container.querySelectorAll(':scope > *');

      if (items.length > maxItems) {
        let total = 0;
        const thead = container.querySelector('thead');
        if (thead) {
          total += thead.getBoundingClientRect().height;
        }

        for (let i = 0; i < maxItems; i++) {
          if (items[i]) {
            total += items[i].getBoundingClientRect().height;
          }
        }

        if (!isTableWrap) {
          const compStyle = window.getComputedStyle(container);
          const gapVal = parseFloat(compStyle.gap || compStyle.rowGap) || 8;
          total += gapVal * (maxItems - 1);
        }

        container.style.maxHeight = `${Math.ceil(total) + 2}px`;
        container.style.overflowY = 'auto';
      } else {
        container.style.maxHeight = 'none';
        container.style.overflowY = 'hidden';
      }
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    return () => window.removeEventListener('resize', updateMaxHeight);
  }, [children, maxItems]);

  return (
    <div
      ref={containerRef}
      className={`dash-scrollable-list ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
};

export default ScrollableCardList;
