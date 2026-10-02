import { Link } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center text-center p-5" style={{ minHeight: '65vh' }}>
      <div className="mb-3 text-warning">
        <AlertCircle size={56} />
      </div>
      <h1 className="h2 mb-2 fw-bold text-dark">Page Not Found</h1>
      <p className="text-muted mb-4" style={{ maxWidth: '420px' }}>
        The page you are looking for doesn't exist or has been moved. Check the URL or return to the dashboard.
      </p>
      <Link to="/" className="btn btn-primary d-inline-flex align-items-center gap-2 px-4 py-2">
        <Home size={18} />
        Back to Dashboard
      </Link>
    </div>
  );
};

export default NotFound;
