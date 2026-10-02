import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Bike, User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck,
} from 'lucide-react';
const loginBg = '/images/garage-bike.jpg';
import './login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password, rememberMe);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  return (
    <div className="gc-login">
      {/* Cinematic hero background */}
      <div className="gc-login-bg" aria-hidden="true">
        <img src={loginBg} alt="" className="gc-login-bg-img" />
        <div className="gc-login-overlay" />
        <div className="gc-login-vignette" />
        <div className="gc-login-glow" />
        <div className="gc-login-depth" />
      </div>

      {/* Left: branding + product messaging */}
      <div className="gc-login-left">
        <div className="gc-login-brand">
          <span className="gc-login-logo">
            <Bike size={24} strokeWidth={2.1} />
          </span>
          <div>
            <h3 className="gc-login-brand-name">
              Garage<span>Care</span>
            </h3>
            <p className="gc-login-brand-tag">Garage Management System</p>
          </div>
        </div>

        <div className="gc-login-copy">
          <h1 className="gc-login-headline">
            Everything your{' '}
            <span className="gc-login-headline-accent">Garage</span>{' '}
            Needs
          </h1>
          <p className="gc-login-features">
            Manage Every Vehicle. Every Service. Every Payment.
          </p>
          <span className="gc-login-rule" aria-hidden="true" />
          <p className="gc-login-sub">Manage your garage from one place.</p>
        </div>
      </div>

      {/* Right: glass login panel */}
      <div className="gc-login-right">
        <div className="gc-login-card">
          <p className="gc-login-portal-tag">Owner Portal</p>
          <div className="gc-login-card-head">
            <h2>Welcome back</h2>
            <p>Sign in to manage your garage.</p>
          </div>

          {error && (
            <div className="gc-login-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <label className="gc-login-label" htmlFor="gc-login-username">
              Username
            </label>
            <div className="gc-login-field">
              <User size={18} className="gc-login-field-icon" />
              <input
                id="gc-login-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <label className="gc-login-label" htmlFor="gc-login-password">
              Password
            </label>
            <div className="gc-login-field">
              <Lock size={18} className="gc-login-field-icon" />
              <input
                id="gc-login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="gc-login-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <div className="gc-login-row">
              <label className="gc-login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" className="gc-login-btn" disabled={loading}>
              {loading ? 'Logging in…' : 'Login'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="gc-login-divider" aria-hidden="true" />
          <p className="gc-login-secure">
            <ShieldCheck size={14} />
            Secure Owner Access
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
