import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/* ------------------------------------------------------------------
   GcSelect — ONE shared GarageCare dropdown pattern (trigger + menu).
   UI ONLY: same contract as the native <select> it replaces
   (value / onChange(string) / options [{ value, label }]), so filters,
   stored values and page behaviour stay identical — only the look,
   the smooth 180ms pop-in motion and the positioning are new.
   The menu is rendered through a portal, so it is never clipped and
   never shifts the page while opening.
   ------------------------------------------------------------------ */
const GcSelect = ({ value, onChange, options = [], ariaLabel, className = '', id, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const selected = options.find((option) => option.value === value) || null;
  // Widest label keeps the trigger the same stable width a native
  // <select> had, so selecting a longer option never shifts the toolbar.
  const widestLabel = options.reduce(
    (widest, option) => ((option.label || '').length > widest.length ? (option.label || '') : widest),
    ''
  );

  const closeMenu = () => {
    setOpen(false);
    setMenuStyle(null);
  };

  // Float the menu next to the trigger and flip it upwards when the space
  // below is short, so options never overflow the viewport.
  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    if (!trigger) return undefined;

    const positionMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
      const spaceAbove = rect.top - gap - 12;
      const openUp = spaceBelow < 210 && spaceAbove > spaceBelow;
      setMenuUp(openUp);
      setMenuStyle({
        position: 'fixed',
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        maxHeight: Math.max(150, Math.min(300, openUp ? spaceAbove : spaceBelow)),
        transformOrigin: openUp ? 'bottom center' : 'top center',
        ...(openUp
          ? { bottom: Math.round(window.innerHeight - rect.top + gap) }
          : { top: Math.round(rect.bottom + gap) })
      });
    };

    positionMenu();

    const onDocMouseDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      closeMenu();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onReflow = () => positionMenu();

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  const optionButtons = () => Array.from(menuRef.current?.querySelectorAll('[data-gc-opt]') || []);

  const focusOption = (index) => {
    const buttons = optionButtons();
    if (!buttons.length) return;
    const target = index < 0 ? buttons.length - 1 : index % buttons.length;
    buttons[target]?.focus({ preventScroll: true });
  };

  const choose = (option) => {
    onChange(option.value);
    closeMenu();
    triggerRef.current?.focus({ preventScroll: true });
  };


  const onTriggerKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else focusOption(event.key === 'ArrowDown' ? 0 : -1);
    }
  };

  const onMenuKeyDown = (event) => {
    const buttons = optionButtons();
    const currentIndex = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(-1);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`gc-sel-btn ${className}`.trim()}
        onClick={() => (open ? closeMenu() : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        onBlur={(event) => {
          if (menuRef.current && !menuRef.current.contains(event.relatedTarget)) closeMenu();
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="gc-sel-value">
          <span className="gc-sel-value-text">{selected ? selected.label : (value ?? '')}</span>
          <span className="gc-sel-value-widest" aria-hidden="true">{widestLabel}</span>
        </span>
        <ChevronDown size={15} className={`gc-sel-chev ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          className={`gc-sel-menu ${menuUp ? 'up' : ''}`}
          style={menuStyle}
          role="listbox"
          aria-label={ariaLabel || 'Options'}
          onKeyDown={onMenuKeyDown}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                data-gc-opt="true"
                role="option"
                aria-selected={isSelected}
                className={`gc-sel-opt ${isSelected ? 'is-selected' : ''}`}
                onClick={() => choose(option)}
              >
                <span className="gc-sel-opt-text">{option.label}</span>
                {isSelected && <Check size={15} className="gc-sel-opt-check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

export default GcSelect;
