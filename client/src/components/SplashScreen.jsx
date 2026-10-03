import { useState, useEffect } from 'react';
import { Building2, Clock, AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import './splashScreen.css';

const GARAGECARE_LOGO = '/images/garagecare-logo.jpeg';

const ROTATING_MESSAGES = [
  'Garage khul raha hai... 🔧',
  'Tools taiyaar ho rahe hain... 🛠️',
  'Engine start ho raha hai... 🚗',
  'Server ko jaga rahe hain... 😴'
];

/**
 * Branded Splash Screen for cold-start server wakeups
 * Matches the GarageCare dark blue SaaS theme.
 */
const SplashScreen = ({
  garageName,
  isTimeout = false,
  onRetry
}) => {
  const [currentMsgIndex, setCurrentMsgIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  // Rotate messages every 3 seconds while loading
  useEffect(() => {
    if (isTimeout) return;

    const interval = setInterval(() => {
      setCurrentMsgIndex((prev) => (prev + 1) % ROTATING_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isTimeout]);

  // Dynamic garage name fallback from localStorage if not provided via props
  const resolvedGarageName =
    garageName ||
    (() => {
      try {
        return (
          localStorage.getItem('gc_garage_name') ||
          localStorage.getItem('garage_name') ||
          'Maurya Automobile'
        );
      } catch (_) {
        return 'Maurya Automobile';
      }
    })();

  return (
    <div className="splash-container" role="status" aria-live="polite">
      <div className="splash-bg-glow" aria-hidden="true" />

      <div className="splash-card">
        {/* Brand header */}
        <div className="splash-brand-block">
          <div className="splash-logo-wrap">
            {!imgError ? (
              <img
                src={GARAGECARE_LOGO}
                alt="GarageCare"
                className="splash-logo-img"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="splash-logo-fallback">
                <Wrench size={32} />
              </div>
            )}
          </div>

          <h1 className="splash-title">
            Garage<span>Care</span>
          </h1>

          <div className="splash-garage-badge" title={resolvedGarageName}>
            <Building2 size={13} />
            <span>{resolvedGarageName}</span>
          </div>
        </div>

        {/* Animated Loader stage */}
        <div className="splash-loader-stage" aria-hidden="true">
          <div className="splash-spinner-track" />
          <div className="splash-spinner-ring" />
          <span className="splash-wrench-icon">🔧</span>
        </div>

        {/* Dynamic messages or Timeout / Retry state */}
        {!isTimeout ? (
          <>
            <div className="splash-msg-container">
              <p key={currentMsgIndex} className="splash-msg-text">
                {ROTATING_MESSAGES[currentMsgIndex]}
              </p>
            </div>

            <p className="splash-note">
              <Clock size={14} />
              <span>First load may take 30-60 seconds</span>
            </p>
          </>
        ) : (
          <div className="splash-timeout-box">
            <div className="splash-timeout-alert">
              <AlertTriangle size={18} />
              <span>Unable to reach the server. It may take a moment to wake up.</span>
            </div>

            <button
              type="button"
              className="splash-retry-btn"
              onClick={onRetry}
              autoFocus
            >
              <RefreshCw size={17} />
              <span>Server is not responding — Retry now</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SplashScreen;
