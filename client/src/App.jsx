import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

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

const LoadingFallback = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

function App() {
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
