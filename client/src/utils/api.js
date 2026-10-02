import axios from 'axios';
import { getStoredOwner, clearStoredOwner } from './authStorage';

const rawApiUrl = import.meta.env.VITE_API_URL;
const baseURL = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/+$/, '')}/api`)
  : '/api';

const api = axios.create({
  baseURL,
});

/**
 * Shared helper to get full image/asset URL.
 * Prefixes relative paths with backend base (from VITE_API_URL) or returns relative path.
 */
export const getFullImageUrl = (path) => {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  let normalizedPath = String(path).replace(/\\/g, '/');
  if (!normalizedPath.startsWith('/')) {
    if (normalizedPath.startsWith('uploads/')) {
      normalizedPath = `/${normalizedPath}`;
    } else if (normalizedPath.startsWith('payment-qr/')) {
      normalizedPath = `/uploads/${normalizedPath}`;
    } else if (normalizedPath.startsWith('qr-')) {
      normalizedPath = `/uploads/payment-qr/${normalizedPath}`;
    } else {
      normalizedPath = `/uploads/${normalizedPath}`;
    }
  }
  const rawBase = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? '' : 'http://localhost:5000');
  const backendBase = rawBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return backendBase ? `${backendBase}${normalizedPath}` : normalizedPath;
};

// Add a request interceptor to include the auth token safely
api.interceptors.request.use(
  (config) => {
    const owner = getStoredOwner();
    if (owner && owner.token) {
      config.headers.Authorization = `Bearer ${owner.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle expired/invalid tokens: clear the stale auth state and force
// a redirect to /login so protected pages are never rendered.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredOwner();
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
