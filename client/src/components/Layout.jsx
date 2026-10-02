import { useContext, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import {
  LayoutDashboard,
  Users,
  Car,
  Wrench,
  Receipt,
  CreditCard,
  Bell,
  ShieldCheck,
  FileSpreadsheet,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  ChevronDown,
  Lock,
  Wrench as GarageMark
} from 'lucide-react';
import '../layout.css';

const GARAGE_LOGO = '/images/garagecare-logo.jpeg';

const Layout = () => {
  const { logout, owner } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [urgentCount, setUrgentCount] = useState(0);
  const navRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    top: 0,
    height: 0,
    opacity: 0,
  });
  const [hasAnimated, setHasAnimated] = useState(false);

  // Sidebar has exactly two states: fully visible or completely hidden.
  // Starts visible on desktop; hidden on tablet/mobile (off-canvas drawer).
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(max-width: 991.98px)').matches
  );

  // Position the sliding active indicator over the active link
  useLayoutEffect(() => {
    if (!navRef.current) return;
    const activeEl = navRef.current.querySelector('.nav-link.active');
    if (activeEl) {
      const navRect = navRef.current.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        top: activeRect.top - navRect.top,
        height: activeRect.height,
        opacity: 1,
      });
      // Enable sliding transitions after the initial render so there is no jump on first paint
      const timer = setTimeout(() => {
        setHasAnimated(true);
      }, 40);
      return () => clearTimeout(timer);
    } else {
      setIndicatorStyle(prev => ({ ...prev, opacity: 0 }));
    }
  }, [location.pathname]);

  // Keep indicator aligned on window resize
  useEffect(() => {
    const updatePosition = () => {
      if (!navRef.current) return;
      const activeEl = navRef.current.querySelector('.nav-link.active');
      if (activeEl) {
        const navRect = navRef.current.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        setIndicatorStyle(prev => ({
          ...prev,
          top: activeRect.top - navRect.top,
          height: activeRect.height,
          opacity: 1,
        }));
      }
    };

    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, []);

  // Re-measure after mobile sidebar drawer finish opening
  useEffect(() => {
    if (sidebarOpen && navRef.current) {
      const timer = setTimeout(() => {
        const activeEl = navRef.current?.querySelector('.nav-link.active');
        if (activeEl && navRef.current) {
          const navRect = navRef.current.getBoundingClientRect();
          const activeRect = activeEl.getBoundingClientRect();
          setIndicatorStyle(prev => ({
            ...prev,
            top: activeRect.top - navRect.top,
            height: activeRect.height,
            opacity: 1,
          }));
        }
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    // Fetch reminder stats for the sidebar badge + topbar bell
    api.get('/reminders/stats')
      .then(res => {
        const count = (res.data?.overdueCount || 0) + (res.data?.dueWeekCount || 0);
        setUrgentCount(count);
      })
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Account dropdown state
  const [menuOpen, setMenuOpen] = useState(false);
  const profileRef = useRef(null);

  // Close the dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const goToSettings = () => {
    setMenuOpen(false);
    navigate('/settings');
  };

  const goToChangePassword = () => {
    setMenuOpen(false);
    navigate('/settings', { state: { tab: 'security' } });
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // On tablet/mobile, close the drawer after navigating; on desktop keep it open.
  const handleNavClick = () => {
    if (window.matchMedia('(max-width: 991.98px)').matches) setSidebarOpen(false);
  };

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return 'active bg-primary';
    if (path !== '/' && location.pathname.startsWith(path)) return 'active bg-primary';
    return '';
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/vehicles', label: 'Vehicles', icon: Car },
    { to: '/services', label: 'Services', icon: Wrench },
    { to: '/bills', label: 'Bills', icon: Receipt },
    { to: '/payments', label: 'Payments', icon: CreditCard },
    { to: '/reminders', label: 'Reminders', icon: Bell, badge: true },
    { to: '/insurance-renewal', label: 'Insurance Renewal', icon: ShieldCheck },
    { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
    { to: '/settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <div className="d-flex vh-100 bg-light">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div
        className={`app-sidebar bg-dark text-white p-3 d-flex flex-column ${sidebarOpen ? 'sidebar-open' : 'sidebar-hidden'}`}
        style={{ width: '260px' }}
      >
        <div className="app-brand mb-3">
          <span className="gc-logo-mark" aria-hidden="true"><GarageMark size={20} strokeWidth={2.2} /></span>
          <div className="gc-logo-text">
            <h3 className="mb-1">GarageCare</h3>
            <div className="sidebar-tagline">Smart Garage Manager</div>
          </div>
        </div>

        <ul ref={navRef} className="nav nav-pills flex-column mb-auto position-relative" onClick={handleNavClick}>
          {indicatorStyle.opacity > 0 && (
            <div
              className={`sidebar-nav-indicator ${hasAnimated ? 'is-animating' : ''}`}
              style={{
                '--indicator-top': `${indicatorStyle.top}px`,
                transform: `translate3d(0, ${indicatorStyle.top}px, 0)`,
                height: `${indicatorStyle.height}px`,
                opacity: indicatorStyle.opacity,
              }}
              aria-hidden="true"
            />
          )}
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <li className="nav-item mb-1" key={item.to}>
                <Link to={item.to} className={`nav-link d-flex align-items-center gap-2 ${isActive(item.to)}`} title={item.label}>
                  <Icon size={19} />
                  <span className="nav-label">{item.label}</span>
                  {item.badge && urgentCount > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{urgentCount}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="sidebar-user-card mt-3">
          <div className="sidebar-user-info text-truncate">
            <div className="sidebar-user-greeting">Welcome,</div>
            <div className="sidebar-user-name text-truncate" title={owner?.name || 'Garage Owner'}>
              {owner?.name || 'Garage Owner'}
            </div>
          </div>
          <button onClick={handleLogout} className="sidebar-logout-btn" title="Logout" aria-label="Logout">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Top header + Main content */}
      <div className="app-main-wrapper gc-main flex-grow-1 d-flex flex-column">
        <header className="app-topbar d-flex align-items-center justify-content-between px-3 px-md-4">
          <div className="d-flex align-items-center">
            <button
              type="button"
              className="topbar-toggle-btn"
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
            >
              <Menu size={18} />
            </button>
            <span className="topbar-brand-title ms-3 d-none d-sm-inline">GarageCare</span>
          </div>

          <div className="header-profile position-relative" ref={profileRef}>
            <button
              type="button"
              className="header-profile-btn"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
            >
              <span className="dash-avatar" aria-hidden="true"><img src={GARAGE_LOGO} alt="Maurya Automobile logo" /></span>
              <span className="header-profile-name d-none d-md-inline">Maurya Automobile</span>
              <ChevronDown size={15} className="text-muted d-none d-md-inline" />
            </button>

            <div className={`header-menu ${menuOpen ? 'open' : ''}`} role="menu" aria-hidden={!menuOpen}>
              <div className="header-menu-head">
                <span className="header-menu-brand">Maurya Automobile</span>
                <small>Garage Management System</small>
              </div>
              <div className="header-menu-divider" />
              <button type="button" className="header-menu-item" role="menuitem" onClick={goToSettings}>
                <SettingsIcon size={15} /> Settings
              </button>
              <button type="button" className="header-menu-item" role="menuitem" onClick={goToChangePassword}>
                <Lock size={15} /> Change Password
              </button>
              <div className="header-menu-divider" />
              <button type="button" className="header-menu-item header-menu-logout" role="menuitem" onClick={handleLogout}>
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </header>

        <div className="flex-grow-1 overflow-auto p-3 p-md-4 gc-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;