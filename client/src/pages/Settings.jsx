import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
import './settings.css';
import {
  Settings as SettingsIcon,
  Building,
  Bell,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Phone,
  MapPin,
  FileText
} from 'lucide-react';

const SET_TAB_ORDER = ['profile', 'reminders', 'security'];

const Settings = () => {
  const location = useLocation();
  // Deep-link: header dropdown Change Password opens the Account Security tab
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'profile');
  const [slideDir, setSlideDir] = useState('from-right');
  const [slideKey, setSlideKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile fields
  const [profile, setProfile] = useState({
    garageName: 'Maurya Automobiles',
    garageAddress: '',
    garageContact: '9619966132',
    agentName: '',
    agentPhone: '',
    agentWhatsApp: '',
    paymentInstructions: ''
  });

  // Reminder thresholds
  const [reminderRules, setReminderRules] = useState({
    serviceDays: '15, 7, 3',
    insuranceDays: '30, 15, 7, 3',
    pucDays: '15, 7, 3'
  });

  // Password fields
  const [passwords, setPasswords] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [pwSaving, setPwSaving] = useState(false);

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return;
    const prevIdx = SET_TAB_ORDER.indexOf(activeTab);
    const nextIdx = SET_TAB_ORDER.indexOf(nextTab);
    setSlideDir(nextIdx < prevIdx ? 'from-left' : 'from-right');
    setSlideKey((k) => k + 1);
    setActiveTab(nextTab);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await api.get('/settings');
        if (data) {
          setProfile({
            garageName: data.garageName || 'Maurya Automobiles',
            garageAddress: data.garageAddress || '',
            garageContact: data.garageContact || '',
            agentName: data.agentName || '',
            agentPhone: data.agentPhone || '',
            agentWhatsApp: data.agentWhatsApp || '',
            paymentInstructions: data.paymentInstructions || ''
          });

          if (data.garageName) {
            try { localStorage.setItem('gc_garage_name', data.garageName); } catch (_) {}
          }

          if (data.reminders) {
            setReminderRules({
              serviceDays: Array.isArray(data.reminders.service) ? data.reminders.service.join(', ') : '15, 7, 3',
              insuranceDays: Array.isArray(data.reminders.insurance) ? data.reminders.insurance.join(', ') : '30, 15, 7, 3',
              pucDays: Array.isArray(data.reminders.puc) ? data.reminders.puc.join(', ') : '15, 7, 3'
            });
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await api.put('/settings', profile);
      if (profile.garageName) {
        try {
          localStorage.setItem('gc_garage_name', profile.garageName);
          window.dispatchEvent(new Event('garage_name_updated'));
        } catch (_) {}
      }
      setMessage({ type: 'success', text: 'Garage profile details updated successfully!' });
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReminderSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const parseDays = (str) =>
        str.split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);

      const payload = {
        reminders: {
          service: parseDays(reminderRules.serviceDays),
          insurance: parseDays(reminderRules.insuranceDays),
          puc: parseDays(reminderRules.pucDays)
        }
      };

      await api.put('/settings', payload);
      setMessage({ type: 'success', text: 'Reminder rules and alert thresholds saved successfully!' });
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to update reminder settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (passwords.newPassword !== passwords.confirmPassword) {
      setMessage({ type: 'danger', text: 'New password and confirm password do not match.' });
      return;
    }

    if (passwords.newPassword.length < 4) {
      setMessage({ type: 'danger', text: 'New password must be at least 4 characters long.' });
      return;
    }

    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword: passwords.oldPassword,
        newPassword: passwords.newPassword
      });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="container-fluid py-2 gc-page set-page">
      <div className="set-container">
        <div className="set-header">
        <span className="set-head-icon"><SettingsIcon size={22} /></span>
        <div>
          <h2 className="set-head-title">Garage Settings</h2>
          <p className="set-head-sub">Manage garage details, reminder rules, and account security</p>
        </div>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type} alert-dismissible fade show d-flex align-items-center gap-2 mb-4`} role="alert">
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <div>{message.text}</div>
          <button type="button" className="btn-close" onClick={() => setMessage({ type: '', text: '' })}></button>
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs gc-tabs set-tabs">
        <li className="nav-item">
          <button
            className={`nav-link d-flex align-items-center gap-2 ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { handleTabChange('profile'); setMessage({ type: '', text: '' }); }}
          >
            <Building size={16} /> Garage Profile
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link d-flex align-items-center gap-2 ${activeTab === 'reminders' ? 'active' : ''}`}
            onClick={() => { handleTabChange('reminders'); setMessage({ type: '', text: '' }); }}
          >
            <Bell size={16} /> Reminder Rules
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link d-flex align-items-center gap-2 ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => { handleTabChange('security'); setMessage({ type: '', text: '' }); }}
          >
            <Lock size={16} /> Account Security
          </button>
        </li>
      </ul>

      {loading ? (
        <div className="text-center py-5 text-muted">
          <div className="spinner-border spinner-border-sm me-2"></div> Loading settings...
        </div>
      ) : (
        <div className="set-layout">
          <div className="set-main set-main-single">
          <div key={slideKey} className={"set-panel set-slide-" + slideDir} role="tabpanel">
            {/* Stable viewport: only this panel animates; alerts/header/tabs stay fixed */}
          <div className="set-panel-viewport">
            <div key={activeTab + '-' + slideKey} className={"set-slide " + slideDir}>
            {/* Tab 1: Profile */}
            {activeTab === 'profile' && (
              <>
              <div className="card border-0 shadow-sm set-card">
                <div className="set-card-head">
                  <span className="set-card-icon"><Building size={19} /></span>
                  <div>
                    <h5>Business & Contact Information</h5>
                    <small>Shown on bills, invoices, and WhatsApp messages.</small>
                  </div>
                </div>
                <div className="set-card-body">
                  <form onSubmit={handleProfileSubmit}>
                    <div className="set-field">
                      <label className="set-field-label">Garage / Workshop Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={profile.garageName}
                        onChange={e => setProfile({ ...profile, garageName: e.target.value })}
                        required
                      />
                      <small className="set-hint">Shown on printed bills, invoices, and WhatsApp messages.</small>
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">
                        <MapPin size={14} /> Garage Address
                      </label>
                      <textarea
                        className="form-control"
                        rows="2"
                        value={profile.garageAddress}
                        onChange={e => setProfile({ ...profile, garageAddress: e.target.value })}
                        placeholder="e.g. Plot No 12, Main Industrial Area, Near City Station"
                      ></textarea>
                    </div>

                    <div className="set-grid-2 set-grid-2-wrap">
                      <div className="set-field">
                        <label className="set-field-label">
                          <Phone size={14} /> Contact Phone Number
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={profile.garageContact}
                          onChange={e => setProfile({ ...profile, garageContact: e.target.value })}
                          placeholder="e.g. +91 9876543210"
                        />
                      </div>
                      <div className="set-field">
                        <label className="set-field-label">Contact Person / Owner Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={profile.agentName}
                          onChange={e => setProfile({ ...profile, agentName: e.target.value })}
                          placeholder="e.g. Rajesh Maurya"
                        />
                      </div>
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">WhatsApp Business Number</label>
                      <input
                        type="text"
                        className="form-control"
                        value={profile.agentWhatsApp}
                        onChange={e => setProfile({ ...profile, agentWhatsApp: e.target.value })}
                        placeholder="e.g. 9876543210"
                      />
                      <small className="set-hint">10-digit mobile number used for sending reminder notices.</small>
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">
                        <FileText size={14} /> Invoice Footer & Payment Notes
                      </label>
                      <textarea
                        className="form-control"
                        rows="2"
                        value={profile.paymentInstructions}
                        onChange={e => setProfile({ ...profile, paymentInstructions: e.target.value })}
                        placeholder="e.g. Thank you for your business! All service repairs come with a 30-day warranty."
                      ></textarea>
                    </div>

                    <button type="submit" className="btn btn-primary set-btn" disabled={saving}>
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save Profile Details'}
                    </button>
                  </form>
                </div>
              </div>
              </>
            )}

            {/* Tab 2: Reminder Rules */}
            {activeTab === 'reminders' && (
              <div className="card border-0 shadow-sm set-card">
                <div className="set-card-head">
                  <span className="set-card-icon"><Bell size={19} /></span>
                  <div>
                    <h5>Automated Notification Lead Times</h5>
                    <small>Specify how many days in advance reminders should be triggered (comma-separated).</small>
                  </div>
                </div>
                <div className="set-card-body">
                  <form onSubmit={handleReminderSubmit}>
                    <div className="set-field">
                      <label className="set-field-label">Next Periodic Service Due Alert (Days Prior)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reminderRules.serviceDays}
                        onChange={e => setReminderRules({ ...reminderRules, serviceDays: e.target.value })}
                        placeholder="15, 7, 3"
                      />
                      <small className="set-hint">Example: <code>15, 7, 3</code> alerts you 15 days, 7 days, and 3 days before service is due.</small>
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">Insurance Expiry Alert (Days Prior)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reminderRules.insuranceDays}
                        onChange={e => setReminderRules({ ...reminderRules, insuranceDays: e.target.value })}
                        placeholder="30, 15, 7, 3"
                      />
                      <small className="set-hint">Example: <code>30, 15, 7, 3</code> gives advance notice before motor insurance policies lapse.</small>
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">PUC / Emission Expiry Alert (Days Prior)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={reminderRules.pucDays}
                        onChange={e => setReminderRules({ ...reminderRules, pucDays: e.target.value })}
                        placeholder="15, 7, 3"
                      />
                      <small className="set-hint">Helps your customers stay free of pollution certificate penalties.</small>
                    </div>

                    <button type="submit" className="btn btn-primary set-btn" disabled={saving}>
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save Reminder Rules'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Tab 3: Security */}
            {activeTab === 'security' && (
              <div className="card border-0 shadow-sm set-card">
                <div className="set-card-head">
                  <span className="set-card-icon"><Lock size={19} /></span>
                  <div>
                    <h5>Change Password</h5>
                    <small>Use a strong password to keep your garage account secure.</small>
                  </div>
                </div>
                <div className="set-card-body">
                  <form onSubmit={handlePasswordSubmit}>
                    <div className="set-field">
                      <label className="set-field-label">Current Password</label>
                      <input
                        type="password"
                        className="form-control"
                        value={passwords.oldPassword}
                        onChange={e => setPasswords({ ...passwords, oldPassword: e.target.value })}
                        required
                      />
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">New Password</label>
                      <input
                        type="password"
                        className="form-control"
                        value={passwords.newPassword}
                        onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}
                        required
                      />
                    </div>

                    <div className="set-field">
                      <label className="set-field-label">Confirm New Password</label>
                      <input
                        type="password"
                        className="form-control"
                        value={passwords.confirmPassword}
                        onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary set-btn" disabled={pwSaving}>
                      <Lock size={16} />
                      {pwSaving ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
          </div>
            </div>
          </div>

        </div>
      )}
      </div>
    </div>
  );
};

export default Settings;
