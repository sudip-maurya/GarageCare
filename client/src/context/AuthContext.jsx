import { createContext, useState, useEffect } from 'react';
import api from '../utils/api';
import {
  getStoredOwner,
  getStoredOwnerStorageType,
  setStoredOwner,
  clearStoredOwner
} from '../utils/authStorage';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify stored auth from BOTH storages against the server
    const verifyAuth = async () => {
      const storedOwner = getStoredOwner();
      const storageType = getStoredOwnerStorageType();

      if (!storedOwner || !storedOwner.token) {
        clearStoredOwner();
        setOwner(null);
        setLoading(false);
        return;
      }

      try {
        // Server-side JWT verification (signature + expiry)
        const { data } = await api.get('/auth/me');
        const verified = { ...storedOwner, ...data };
        setOwner(verified);
        // Re-persist to the storage that held the token
        setStoredOwner(verified, storageType === 'local');
      } catch (_error) {
        // Stale / invalid token -> clear both + logged out
        clearStoredOwner();
        setOwner(null);
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  const login = async (username, password, remember = true) => {
    try {
      const { data } = await api.post('/auth/login', {
        username,
        password,
      });
      setOwner(data);
      setStoredOwner(data, remember);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const logout = () => {
    setOwner(null);
    clearStoredOwner();
  };

  return (
    <AuthContext.Provider value={{ owner, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
