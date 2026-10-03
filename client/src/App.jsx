import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import SplashScreen from './components/SplashScreen';
import api from './utils/api';

// Route-level code splitting via React.lazy
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Vehicles = lazy(() => import('./pages/Vehicles'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetails = lazy(() => import('./pages/ServiceDetails'));
const Bills = lazy(() => import('./pages/Bills'));
const GenerateBill = lazy(() => import('./pages/GenerateBill'));
const ViewBill = lazy(() => import('./pages/ViewBill'));
const EditBill = lazy(() => import('./pages/EditBill'));
const Payments = lazy(() => import('./pages/Payments'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Settings = lazy(() => import('./pages/Settings'));
const InsuranceRenewal = lazy(() => import('./pages/InsuranceRenewal'));
const Reports = lazy(() => import('./pages/Reports'));
const NotFound = lazy(() => import('./pages/NotFound'));

const LAST_PING_KEY = 'gc_last_successful_ping';
const PING_CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes cache
const SPLASH_DELAY_MS = 2000; // 2 seconds before showing splash
const TIMEOUT_MS = 60000; // 60 seconds timeout

/**
 * Check if a successful ping was stored within the last 10 minutes
 */
const isCacheValid = () => {
  try {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      if (search.includes('test_delay') || search.includes('test_splash') || search.includes('test_timeout')) {
        return false;
      }
    }
    const lastPing = localStorage.getItem(LAST_PING_KEY);
    if (lastPing) {
      const timestamp = parseInt(lastPing, 10);
      const now = Date.now();
      if (!isNaN(timestamp) && now - timestamp < PING_CACHE_DURATION_MS && now >= timestamp) {
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed reading last ping timestamp from localStorage:', e);
  }
  return false;
};

const LoadingFallback = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

function App() {
  const [isReady, setIsReady] = useState(isCacheValid);
  const [showSplash, setShowSplash] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [garageName, setGarageName] = useState(() => {
    try {
      return (
        localStorage.getItem('gc_garage_name') ||
        localStorage.getItem('garage_name') ||
        'Maurya Automobile'
      );
    } catch (_) {
      return 'Maurya Automobile';
    }
  });

  const abortRef = useRef(false);

  const startHealthCheck = useCallback(() => {
    // If cached within 10 minutes, bypass health check immediately
    if (isCacheValid()) {
      setIsReady(true);
      setShowSplash(false);
      setIsTimeout(false);
      return;
    }

    abortRef.current = false;
    setIsTimeout(false);

    // Show splash ONLY if backend takes longer than 2 seconds to respond
    const splashTimer = setTimeout(() => {
      setShowSplash(true);
    }, SPLASH_DELAY_MS);

    // 60-second absolute timeout to display retry button
    const timeoutTimer = setTimeout(() => {
      setIsTimeout(true);
      setShowSplash(true);
    }, TIMEOUT_MS);

    const startTime = Date.now();

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const testDelay = urlParams?.get('test_delay');
    const forceSplash = urlParams?.get('test_splash') === 'true';
    const forceTimeout = urlParams?.get('test_timeout') === 'true';

    if (forceTimeout) {
      clearTimeout(splashTimer);
      clearTimeout(timeoutTimer);
      setShowSplash(true);
      setIsTimeout(true);
      return;
    }

    if (forceSplash) {
      clearTimeout(splashTimer);
      clearTimeout(timeoutTimer);
      setShowSplash(true);
      return;
    }

    const ping = async () => {
      if (abortRef.current) return;

      try {
        const endpoint = testDelay ? `/health?delay=${testDelay}` : '/health';
        const requestTimeout = testDelay ? Math.max(15000, parseInt(testDelay, 10) + 5000) : 15000;
        const res = await api.get(endpoint, { timeout: requestTimeout });
        if (abortRef.current) return;

        // Health check responded successfully
        clearTimeout(splashTimer);
        clearTimeout(timeoutTimer);

        if (res.data?.garageName) {
          setGarageName(res.data.garageName);
          try {
            localStorage.setItem('gc_garage_name', res.data.garageName);
          } catch (_) {}
        }

        try {
          localStorage.setItem(LAST_PING_KEY, Date.now().toString());
        } catch (_) {}

        setShowSplash(false);
        setIsReady(true);
      } catch (_err) {
        if (abortRef.current) return;

        // While within the 60-second window, retry ping every 2.5s to catch cold starts
        const elapsed = Date.now() - startTime;
        if (elapsed < TIMEOUT_MS) {
          setTimeout(ping, 2500);
        } else {
          clearTimeout(splashTimer);
          clearTimeout(timeoutTimer);
          setIsTimeout(true);
          setShowSplash(true);
        }
      }
    };

    ping();

    return () => {
      clearTimeout(splashTimer);
      clearTimeout(timeoutTimer);
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      const cleanup = startHealthCheck();
      return () => {
        abortRef.current = true;
        if (cleanup) cleanup();
      };
    }
  }, [isReady, startHealthCheck]);

  const handleRetry = () => {
    abortRef.current = true;
    setIsTimeout(false);
    setShowSplash(true);
    startHealthCheck();
  };

  // While backend is being checked
  if (!isReady) {
    if (showSplash) {
      return (
        <SplashScreen
          garageName={garageName}
          isTimeout={isTimeout}
          onRetry={handleRetry}
        />
      );
    }
    // During first 2 seconds of quick check, show theme-matched dark background (no flash)
    return <div style={{ minHeight: '100vh', backgroundColor: '#060b1a' }} />;
  }

  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/services" element={<Services />} />
                <Route path="/services/add" element={<Navigate to="/services" replace state={{ addService: true }} />} />
                <Route path="/services/view/:id" element={<ServiceDetails />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/bills/generate" element={<GenerateBill />} />
                <Route path="/bills/view/:id" element={<ViewBill />} />
                <Route path="/bills/edit/:id" element={<EditBill />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/insurance-renewal" element={<InsuranceRenewal />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
