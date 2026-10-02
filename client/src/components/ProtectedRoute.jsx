import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const ProtectedRoute = () => {
  const { owner, loading } = useContext(AuthContext);

  if (loading) {
    return <div>Loading...</div>;
  }

  return owner ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
