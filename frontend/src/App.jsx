import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';

import {
  ShieldAlert,
  LayoutDashboard,
  Video,
  Building2,
  Users,
  HardDrive,
  BellRing,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  Settings,
  Download,
  Radio,
  RefreshCw,
  Menu,
  X,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  ArrowUpRight,
  Activity,
  MapPin,
  Cpu,
  FileText,
  UserCheck,
  UserX,
  ScanLine,
  Camera,
  Upload,
  Trash2,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Database,
  Server,
  Wifi,
  Save,
  RotateCcw,
  BarChart3
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';
const AUTH_TOKEN_KEY = 'sach_access_token';
const SHARED_CENTRE_KEY = 'sach_selected_centre';

function useSharedCentre(initialCentre) {
  const [selectedCentre, setSelectedCentre] = useState(
    () => window.localStorage.getItem(SHARED_CENTRE_KEY) || initialCentre
  );

  useEffect(() => {
    const syncCentre = event => {
      const centreId = event.type === 'storage'
        ? event.newValue
        : event.detail;
      if (centreId) setSelectedCentre(centreId);
    };
    window.addEventListener('storage', syncCentre);
    window.addEventListener('sach-centre-selection', syncCentre);
    return () => {
      window.removeEventListener('storage', syncCentre);
      window.removeEventListener('sach-centre-selection', syncCentre);
    };
  }, []);

  const selectCentre = centreId => {
    setSelectedCentre(centreId);
    window.localStorage.setItem(SHARED_CENTRE_KEY, centreId);
    window.dispatchEvent(new CustomEvent('sach-centre-selection', {
      detail: centreId
    }));
  };

  return [selectedCentre, selectCentre];
}

const openAuthenticatedWebSocket = url => {
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      console.error('Cannot open live feed without an authenticated session.');
      socket.close();
      return;
    }
    socket.send(JSON.stringify({ type: 'auth', token }));
  });
  return socket;
};

const getDefaultPreviewRole = role => {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'OPERATOR' || role === 'CENTRE_OPERATOR') return 'OPERATOR';
  return 'AUDITOR';
};

const isCentreOperator = role => role === 'OPERATOR' || role === 'CENTRE_OPERATOR';

axios.interceptors.request.use(config => {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && sessionStorage.getItem(AUTH_TOKEN_KEY)) {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      window.dispatchEvent(new Event('sach-auth-expired'));
    }
    return Promise.reject(error);
  }
);

const getApiErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => item?.msg).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapConfigured, setBootstrapConfigured] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/auth/bootstrap-status`)
      .then(({ data }) => setBootstrapConfigured(data.admin_configured))
      .catch(() => setBootstrapConfigured(false));
  }, []);

  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    try {
      await onLogin({ username, password });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Sign-in failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '24px',
      background: '#f1f5f9',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <form
        onSubmit={submit}
        style={{
          width: 'min(100%, 420px)',
          padding: '32px',
          borderRadius: '16px',
          background: '#fff',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)'
        }}
      >
        <div style={{ color: '#1e3a8a', fontSize: '12px', fontWeight: 800 }}>
          SACH · SECURE SIGN IN
        </div>
        <h1 style={{ margin: '10px 0 6px', color: '#0f172a', fontSize: '25px' }}>
          Sign in to the Control Tower
        </h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px' }}>
          Use your assigned account. Access is limited by your role.
        </p>
        <label style={{ display: 'block', marginBottom: '14px', color: '#334155', fontSize: '13px' }}>
          Username
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={64}
            value={username}
            onChange={event => setUsername(event.target.value)}
            style={styles.authInput}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '18px', color: '#334155', fontSize: '13px' }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={event => setPassword(event.target.value)}
            style={styles.authInput}
          />
        </label>
        {errorMessage && (
          <p role="alert" style={styles.errorNotice}>{errorMessage}</p>
        )}
        {bootstrapConfigured === false && (
          <p role="alert" style={styles.warningStrip}>
            Administrator setup is incomplete. Configure
            {' '}SACH_BOOTSTRAP_ADMIN_USERNAME and
            {' '}SACH_BOOTSTRAP_ADMIN_PASSWORD for the backend, then restart it.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || bootstrapConfigured === false}
          style={{ ...styles.primaryButton, width: '100%', justifyContent: 'center' }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState(null);
  const [backendAlerts, setBackendAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [operatorSection, setOperatorSection] = useState('overview');

  const [centreFilter, setCentreFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [alertFilter, setAlertFilter] = useState('ALL');
  const [activeReportTab, setActiveReportTab] = useState('attendance');
  const [auditCentre, setAuditCentre] = useState(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [exportError, setExportError] = useState('');

  const fetchStats = async () => {
    if (!currentUser) return;
    try {
      const [statsResult, overviewResult, alertsResult] = await Promise.allSettled([
        axios.get(`${API_BASE}/dashboard/stats`),
        axios.get(`${API_BASE}/dashboard/overview`),
        axios.get(`${API_BASE}/alerts?status=ACTIVE`)
      ]);

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.data);
      } else {
        console.error('Dashboard stats error:', statsResult.reason);
      }

      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value.data);
      } else {
        console.warn('Dashboard overview unavailable:', overviewResult.reason);
      }

      if (alertsResult.status === 'fulfilled') {
        setBackendAlerts(alertsResult.value.data?.alerts || []);
      } else {
        console.warn('Alerts API unavailable:', alertsResult.reason);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Backend Connection Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleExpiredSession = () => {
      setCurrentUser(null);
      setStats(null);
      setOverview(null);
      setBackendAlerts([]);
      setLoading(false);
      setAuthReady(true);
    };
    window.addEventListener('sach-auth-expired', handleExpiredSession);

    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setAuthReady(true);
      setLoading(false);
      return () => window.removeEventListener('sach-auth-expired', handleExpiredSession);
    }

    axios.get(`${API_BASE}/auth/me`)
      .then(({ data }) => {
        setCurrentUser(data);
        setSelectedRole(getDefaultPreviewRole(data.role));
        if (isCentreOperator(data.role)) {
          setActiveTab('monitoring');
          setLoading(false);
        }
      })
      .catch(() => sessionStorage.removeItem(AUTH_TOKEN_KEY))
      .finally(() => setAuthReady(true));

    return () => window.removeEventListener('sach-auth-expired', handleExpiredSession);
  }, []);

  useEffect(() => {
    if (
      !currentUser
      || isCentreOperator(currentUser.role)
      || (currentUser.role === 'ADMIN' && selectedRole === 'OPERATOR')
    ) return undefined;
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [currentUser, selectedRole]);

  const handleLogin = async credentials => {
    const { data } = await axios.post(`${API_BASE}/auth/login`, credentials);
    sessionStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    setCurrentUser(data.user);
    setSelectedRole(getDefaultPreviewRole(data.user.role));
    if (isCentreOperator(data.user.role)) setActiveTab('monitoring');
    setLoading(!isCentreOperator(data.user.role));
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (error) {
      console.error('Failed to revoke the session:', error);
    } finally {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      setCurrentUser(null);
      setSelectedRole('ADMIN');
      setStats(null);
      setOverview(null);
      setBackendAlerts([]);
      setLoading(false);
      setAuthReady(true);
      setActiveTab('dashboard');
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`${API_BASE}/alerts/${alertId}/acknowledge`, {
        actor: currentUser.username
      });
      await fetchStats();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await axios.post(`${API_BASE}/alerts/${alertId}/resolve`, {
        actor: currentUser.username
      });
      await fetchStats();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };


  const downloadCSV = async (type = 'attendance') => {
    setExportError('');
    try {
      const { data } = await axios.get(
        `${API_BASE}/reports/export.csv`,
        {
          params: { report_type: type },
          responseType: 'blob'
        }
      );
      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `sach_${type}_report.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('CSV export failed:', error);
      setExportError(getApiErrorMessage(error, 'CSV export failed. Please try again.'));
    }
  };

  const effectiveRole = (() => {
    if (!currentUser) return null;
    if (currentUser.role !== 'ADMIN') return currentUser.role;
    if (selectedRole === 'ADMIN') {
      return 'ADMIN';
    }
    if (selectedRole === 'AUDITOR') {
      return 'AUDITOR';
    }
    return 'OPERATOR';
  })();

  const handleRolePreviewChange = event => {
    setRolePreview(event.target.value);
  };

  const setRolePreview = nextRole => {
    if (currentUser?.role !== 'ADMIN') return;
    setSelectedRole(nextRole);
    if (nextRole === 'OPERATOR') {
      setActiveTab('monitoring');
      setOperatorSection('overview');
    } else if (selectedRole === 'OPERATOR') {
      setActiveTab('dashboard');
    }
  };

  const navigateOperatorSection = section => {
    setOperatorSection(section);
    setMobileMenuOpen(false);
  };

  const dashboardNow = Date.now();
  const allCentres = Object.entries(stats?.centres || {}).map(([centreId, centre]) => {
    const liveInfrastructure = stats?.live_infrastructure?.[centreId];
    const liveInfrastructureAge = liveInfrastructure?.received_at
      ? (dashboardNow - Date.parse(liveInfrastructure.received_at)) / 1000
      : null;
    const hasFreshInfrastructure = Number.isFinite(liveInfrastructureAge)
      && liveInfrastructureAge >= -5
      && liveInfrastructureAge <= 10;
    const attendanceAge = centre?.last_attendance_at
      ? (dashboardNow - Date.parse(centre.last_attendance_at)) / 1000
      : null;

    return [centreId, {
      ...centre,
      ...(hasFreshInfrastructure ? {
        detected_computers: liveInfrastructure.detected_computers,
        required_computers: liveInfrastructure.required_computers,
        compliance_percentage: liveInfrastructure.compliance_percentage,
        live_infrastructure_status: liveInfrastructure.status
      } : {}),
      live_infrastructure_received_at: liveInfrastructure?.received_at || null,
      live_infrastructure_age_seconds: Number.isFinite(liveInfrastructureAge)
        ? Math.max(0, Math.floor(liveInfrastructureAge))
        : null,
      live_infrastructure_fresh: hasFreshInfrastructure,
      live_attendance_age_seconds: Number.isFinite(attendanceAge)
        ? Math.max(0, Math.floor(attendanceAge))
        : null,
      live_attendance_fresh: Number.isFinite(attendanceAge)
        && attendanceAge >= -5
        && attendanceAge <= 10
    }];
  });

  const totalCentres = allCentres.length;

  const highRiskCentres =
    overview?.summary?.high_risk_centres ??
    allCentres.filter(
      ([, info]) => ['HIGH_RISK', 'FLAGGED'].includes(
        String(info?.status || '').toUpperCase()
      )
    ).length;

  const activeAlerts =
    overview?.alerts?.total_active ??
    backendAlerts.length;

  const averageCompliance =
    totalCentres > 0
      ? Math.round(
          allCentres.reduce(
            (sum, [, info]) =>
              sum + Number(info?.compliance_percentage || 0),
            0
          ) / totalCentres
        )
      : 0;

  const totalMarkedPresent = allCentres.reduce(
    (sum, [, info]) =>
      sum + Number(info?.official_marked_present ?? 0),
    0
  );

  const totalDetected = allCentres.reduce(
    (sum, [, info]) =>
      sum + Number(info?.live_headcount || 0),
    0
  );

  const totalMissing = allCentres.reduce(
    (sum, [, info]) => sum + Math.max(
      0,
      Number(info?.official_marked_present ?? 0) -
        Number(info?.live_headcount || 0)
    ),
    0
  );

  const attendanceRate =
    totalMarkedPresent > 0
      ? Math.round((totalDetected / totalMarkedPresent) * 100)
      : 0;

  const handleNavClick = tab => {
    if (selectedRole === 'OPERATOR' && tab !== 'monitoring') return;
    if (tab === 'settings' && effectiveRole !== 'ADMIN') return;
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setAuditCentre(null);
    setSettingsSaved(false);
  };

  const getRiskLevel = score => {
    const risk = Number(score || 0);

    if (risk >= 75) return 'CRITICAL';
    if (risk >= 50) return 'HIGH';
    if (risk >= 25) return 'MEDIUM';

    return 'LOW';
  };

  const getRiskStyle = score => {
    const level = getRiskLevel(score);

    if (level === 'CRITICAL') return styles.tagCritical;
    if (level === 'HIGH') return styles.tagAlert;
    if (level === 'MEDIUM') return styles.tagWarning;

    return styles.tagSafe;
  };

  const getRiskColor = score => {
    const risk = Number(score || 0);

    if (risk >= 75) return '#b91c1c';
    if (risk >= 50) return '#dc2626';
    if (risk >= 25) return '#b45309';

    return '#15803d';
  };

  const filteredCentres = useMemo(() => {
    return allCentres.filter(([id, info]) => {
      const matchesCentre =
        centreFilter === 'ALL' ||
        id === centreFilter;

      const text = `
        ${id}
        ${info?.name || ''}
        ${info?.status || ''}
      `.toLowerCase();

      const matchesSearch =
        text.includes(searchTerm.toLowerCase());

      return matchesCentre && matchesSearch;
    });
  }, [
    allCentres,
    centreFilter,
    searchTerm
  ]);

  const generatedAlerts = useMemo(() => {
    const alerts = [];

    allCentres.forEach(([id, info]) => {
      const risk = Number(info?.fraud_risk_score || 0);

      const official = Number(info?.official_marked_present ?? 0);

      const detected = Number(
        info?.live_headcount || 0
      );

      const compliance = Number(
        info?.compliance_percentage || 0
      );

      const mismatch =
        official > 0
          ? Math.max(
              0,
              Math.round(
                ((official - detected) / official) * 100
              )
            )
          : 0;

      if (risk >= 50 && info?.attendance_gap_active) {
        alerts.push({
          id: `ALT-${id}-ATT`,
          centreId: id,
          centreName: info?.name || id,
          type: 'Attendance Mismatch',
          severity: risk >= 75 ? 'CRITICAL' : 'HIGH',
          description:
            `Official attendance indicates ${official} learners while AI observation detected ${detected}.`,
          evidence:
            `${mismatch}% attendance discrepancy`,
          score: risk,
          time: 'Live'
        });
      }

      if (compliance < 80) {
        alerts.push({
          id: `ALT-${id}-INF`,
          centreId: id,
          centreName: info?.name || id,
          type: 'Infrastructure Deficit',
          severity: compliance < 65 ? 'HIGH' : 'MEDIUM',
          description:
            `Infrastructure compliance is below the expected monitoring threshold.`,
          evidence:
            `${compliance}% equipment compliance`,
          score: Math.max(0, 100 - compliance),
          time: 'Recent'
        });
      }
    });

    return alerts;
  }, [allCentres]);

  const displayAlerts = useMemo(() => {
    return backendAlerts.map(a => ({
      id: a.id,
      centreId: a.centre_id,
      centreName: stats?.centres?.[a.centre_id]?.name || a.centre_id,
      type: a.title || a.alert_type,
      severity: a.severity,
      description: a.message,
      evidence: `Status: ${a.status}${a.acknowledged_by ? ` (Ack by ${a.acknowledged_by})` : ''}`,
      status: a.status,
      score: a.severity === 'HIGH' ? 85 : a.severity === 'MEDIUM' ? 50 : 20,
      time: a.updated_at ? new Date(a.updated_at).toLocaleTimeString() : 'Recent'
    }));
  }, [backendAlerts, stats]);

  const filteredAlerts = displayAlerts.filter(alert => {
    if (alertFilter === 'ALL') return true;

    return alert.severity === alertFilter;
  });

  if (!authReady) {
    return (
      <div style={styles.loadingScreen}>
        <RefreshCw size={36} color="#1e3a8a" className="animate-spin" />
        <p>Checking secure session…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <RefreshCw
          size={36}
          color="#1e3a8a"
          className="animate-spin"
        />

        <h3
          style={{
            marginTop: '16px',
            color: '#1e293b',
            fontWeight: '600'
          }}
        >
          Connecting to SACH Control Tower...
        </h3>

        <p style={styles.loadingText}>
          Establishing secure telemetry connection with FastAPI backend
        </p>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>

      {/* GOVERNMENT BAR */}

      <div style={styles.topGovBar}>
        <span>
          MINISTRY OF SKILL DEVELOPMENT AND ENTREPRENEURSHIP
          (MSDE) • GOVT. OF INDIA
        </span>

        <span className="hide-mobile">
          SIH PS 245
        </span>
      </div>

      <div style={styles.mainWrapper}>

        {/* SIDEBAR */}

        <aside
          className={`sidebar-container ${
            mobileMenuOpen ? 'open-mobile' : ''
          }`}
        >

          <div style={styles.brandBox}>

            <div style={styles.logoIcon}>
              <ShieldAlert
                size={22}
                color="#ffffff"
              />
            </div>

            <div>
              <h1 style={styles.brandTitle}>
                SACH
              </h1>

              <p style={styles.brandSubtitle}>
                Smart Attendance & Compliance Hub
              </p>
            </div>

          </div>

          {selectedRole !== 'OPERATOR' && <div style={styles.navSection}>

            <span style={styles.navHeader}>
              OVERVIEW
            </span>

            <NavButton
              active={activeTab === 'dashboard'}
              icon={<LayoutDashboard size={16} />}
              label="Dashboard"
              onClick={() =>
                handleNavClick('dashboard')
              }
            />

            <NavButton
              active={activeTab === 'centres'}
              icon={<Building2 size={16} />}
              label="Centres Directory"
              onClick={() =>
                handleNavClick('centres')
              }
            />

          </div>}

          {selectedRole === 'OPERATOR' ? (
            <>
              <div style={styles.navSection}>
                <span style={styles.navHeader}>DAILY OPERATIONS</span>
                <NavButton
                  active={operatorSection === 'overview'}
                  icon={<LayoutDashboard size={16} />}
                  label="Centre Overview"
                  onClick={() => navigateOperatorSection('overview')}
                />
                <NavButton
                  active={operatorSection === 'daily'}
                  icon={<ClipboardCheck size={16} />}
                  label="Daily Attendance"
                  onClick={() => navigateOperatorSection('daily')}
                />
              </div>
              <div style={styles.navSection}>
                <span style={styles.navHeader}>LEARNERS & RECORDS</span>
                <NavButton
                  active={operatorSection === 'students'}
                  icon={<Users size={16} />}
                  label="Student Roster"
                  onClick={() => navigateOperatorSection('students')}
                />
                <NavButton
                  active={operatorSection === 'history'}
                  icon={<FileBarChart size={16} />}
                  label="Monthly History"
                  onClick={() => navigateOperatorSection('history')}
                />
              </div>
              <div style={styles.navSection}>
                <span style={styles.navHeader}>HELP & COMPLIANCE</span>
                <NavButton
                  active={operatorSection === 'guidance'}
                  icon={<ShieldCheck size={16} />}
                  label="Register Rules & Help"
                  onClick={() => navigateOperatorSection('guidance')}
                />
              </div>
            </>
          ) : <div style={styles.navSection}>

            <span style={styles.navHeader}>
              MONITORING
            </span>

            <NavButton
              active={activeTab === 'monitoring'}
              icon={<Video size={16} />}
              label="Live Monitoring"
              onClick={() => handleNavClick('monitoring')}
            />

            {selectedRole !== 'OPERATOR' && <>
            <NavButton
              active={activeTab === 'attendance'}
              icon={<Users size={16} />}
              label="Attendance Intelligence"
              onClick={() =>
                handleNavClick('attendance')
              }
            />

            <NavButton
              active={activeTab === 'infrastructure'}
              icon={<HardDrive size={16} />}
              label="Infrastructure Audit"
              onClick={() =>
                handleNavClick('infrastructure')
              }
            />

            <NavButton
              active={activeTab === 'alerts'}
              icon={<BellRing size={16} />}
              label="Alerts & Incidents"
              onClick={() =>
                handleNavClick('alerts')
              }
            />
            </>}

          </div>}

          {selectedRole !== 'OPERATOR' && <div style={styles.navSection}>

            <span style={styles.navHeader}>
              AUDIT & GOVERNANCE
            </span>

            <NavButton
              active={activeTab === 'audits'}
              icon={<ClipboardCheck size={16} />}
              label="Audit Workflow"
              onClick={() =>
                handleNavClick('audits')
              }
            />

            <NavButton
              active={activeTab === 'reports'}
              icon={<FileBarChart size={16} />}
              label="Reports & Exports"
              onClick={() =>
                handleNavClick('reports')
              }
            />
            {effectiveRole === 'AUDITOR' && (
              <NavButton
                active={activeTab === 'operator-registers'}
                icon={<ClipboardCheck size={16} />}
                label="Centre Registers"
                onClick={() => handleNavClick('operator-registers')}
              />
            )}

          </div>}

          {effectiveRole === 'ADMIN' && selectedRole === 'ADMIN' && <div style={styles.navSection}>

            <span style={styles.navHeader}>
              ADMINISTRATION
            </span>

            <NavButton
              active={activeTab === 'courses'}
              icon={<GraduationCap size={16} />}
              label="Centres, Courses & Rosters"
              onClick={() => handleNavClick('courses')}
            />

            <NavButton
              active={activeTab === 'operator-registers'}
              icon={<ClipboardCheck size={16} />}
              label="Centre Registers"
              onClick={() => handleNavClick('operator-registers')}
            />

            <NavButton
              active={activeTab === 'settings'}
              icon={<Settings size={16} />}
              label="Users & System Settings"
              onClick={() => handleNavClick('settings')}
            />

          </div>}

          <div style={styles.userFooter}>

            <div style={styles.userIdentity}>
              <div style={styles.userAvatar}>
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <p style={styles.userName}>
                  {currentUser.username}
                </p>

                <p style={styles.userRole}>
                  {isCentreOperator(currentUser.role)
                    ? `Centre Operator · ${currentUser.centre_id || 'Unassigned'}`
                    : selectedRole === 'ADMIN'
                    ? 'National Admin preview'
                    : selectedRole === 'AUDITOR'
                      ? 'Inspector preview'
                      : 'Centre Operator preview'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={styles.sidebarLogout}
            >
              Sign out
            </button>

          </div>

        </aside>

        {/* MAIN CONTENT */}

        <main style={styles.contentArea}>

          {/* HEADER */}

          <header style={styles.topHeader}>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >

              <button
                className="mobile-toggle-btn"
                onClick={() =>
                  setMobileMenuOpen(
                    !mobileMenuOpen
                  )
                }
              >
                {mobileMenuOpen ? (
                  <X size={20} />
                ) : (
                  <Menu size={20} />
                )}
              </button>

              <div>

                <h2 style={styles.headerTitle}>
                  {selectedRole === 'OPERATOR' && activeTab === 'monitoring'
                    ? (operatorSection === 'overview' ? 'CENTRE OVERVIEW'
                      : operatorSection === 'daily' ? 'DAILY ATTENDANCE'
                        : operatorSection === 'students' ? 'STUDENT ROSTER'
                          : operatorSection === 'history' ? 'MONTHLY HISTORY'
                            : 'REGISTER RULES & HELP')
                    : getPageTitle(activeTab)}
                </h2>

                <p style={styles.headerSub}>
                  {selectedRole === 'OPERATOR' && activeTab === 'monitoring'
                    ? 'Centre-scoped attendance, roster and daily operations'
                    : `Last synced: ${lastUpdated || '—'}`}
                </p>

              </div>

            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >

              {!isCentreOperator(currentUser.role) && (
                <label className="role-preview-control">
                  <span>Preview role</span>
                  <select
                    aria-label="Preview portal role"
                    value={selectedRole}
                    onChange={handleRolePreviewChange}
                    disabled={currentUser.role !== 'ADMIN'}
                    className="role-preview-select"
                  >
                    <option value="ADMIN">National Admin</option>
                    <option value="AUDITOR">Inspector</option>
                    <option value="OPERATOR">Centre Operator</option>
                  </select>
                </label>
              )}

              {selectedRole !== 'OPERATOR' && (
                <button
                  style={styles.exportBtn}
                  onClick={() => downloadCSV('attendance')}
                  className="hover-pop"
                >
                  <Download size={14} />

                  <span className="hide-mobile">
                    Export CSV
                  </span>
                </button>
              )}

              {selectedRole !== 'OPERATOR' && (
                <div
                  style={styles.statusBadge}
                  className="hide-mobile"
                >
                  <Radio
                    size={12}
                    color="#166534"
                    className="animate-pulse"
                  />

                  Live Telemetry
                </div>
              )}

            </div>

          </header>

          {exportError && (
            <div className="export-error-notice" role="alert">
              {exportError}
            </div>
          )}

          <div className="page-body-responsive" style={styles.pageBody}>
            {/* ================================================= */}
            {/* DASHBOARD */}
            {/* ================================================= */}

            {activeTab === 'dashboard' && (
              <DashboardPage
                overview={overview}
                allCentres={allCentres}
                totalCentres={totalCentres}
                highRiskCentres={highRiskCentres}
                activeAlerts={activeAlerts}
                averageCompliance={averageCompliance}
                attendanceRate={attendanceRate}
                totalMarkedPresent={totalMarkedPresent}
                totalDetected={totalDetected}
                totalMissing={totalMissing}
                getRiskStyle={getRiskStyle}
                getRiskColor={getRiskColor}
                handleNavClick={handleNavClick}
              />
            )}

            {/* ================================================= */}
            {/* LIVE MONITORING */}
            {/* ================================================= */}

            {activeTab === 'monitoring' && (
              selectedRole === 'OPERATOR'
                ? <CentreOperatorPortal
                currentUser={currentUser}
                previewMode={!isCentreOperator(currentUser.role)}
                allCentres={allCentres}
                activeSection={operatorSection}
              />
                : (
                  <MonitoringPage
                    stats={stats}
                    allCentres={allCentres}
                    getRiskStyle={getRiskStyle}
                    getRiskColor={getRiskColor}
                    fetchStats={fetchStats}
                    canSubmitAttendance={['ADMIN', 'OFFICIAL'].includes(effectiveRole)}
                  />
                )
            )}

            {/* ================================================= */}
            {/* CENTRES */}
            {/* ================================================= */}

            {activeTab === 'centres' && (
              <CentresPage
                filteredCentres={filteredCentres}
                allCentres={allCentres}
                centreFilter={centreFilter}
                setCentreFilter={setCentreFilter}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                getRiskStyle={getRiskStyle}
                getRiskColor={getRiskColor}
              />
            )}

            {/* ================================================= */}
            {/* ATTENDANCE */}
            {/* ================================================= */}

            {activeTab === 'attendance' && (
              <AttendancePage
                allCentres={allCentres}
                totalMarkedPresent={totalMarkedPresent}
                totalDetected={totalDetected}
                totalMissing={totalMissing}
                attendanceRate={attendanceRate}
                getRiskStyle={getRiskStyle}
                getRiskColor={getRiskColor}
                stats={stats}
              />
            )}

            {/* ================================================= */}
            {/* INFRASTRUCTURE */}
            {/* ================================================= */}

            {activeTab === 'infrastructure' && (
              <InfrastructurePage
                allCentres={allCentres}
                stats={stats}
                onRefresh={fetchStats}
                role={effectiveRole}
              />
            )}

            {/* ================================================= */}
            {/* ALERTS */}
            {/* ================================================= */}

            {activeTab === 'alerts' && (
              <AlertsPage
                alerts={filteredAlerts}
                alertFilter={alertFilter}
                setAlertFilter={setAlertFilter}
                handleNavClick={handleNavClick}
                onAcknowledge={handleAcknowledgeAlert}
                onResolve={handleResolveAlert}
                canManageAlerts={['ADMIN', 'AUDITOR'].includes(effectiveRole)}
              />
            )}

            {/* ================================================= */}
            {/* AUDITS */}
            {/* ================================================= */}

            {activeTab === 'audits' && (
              <AuditsPage
                allCentres={allCentres}
                generatedAlerts={generatedAlerts}
                auditCentre={auditCentre}
                setAuditCentre={setAuditCentre}
                getRiskStyle={getRiskStyle}
              />
            )}

            {/* ================================================= */}
            {/* REPORTS */}
            {/* ================================================= */}

            {activeTab === 'reports' && (
              <ReportsPage
                stats={stats}
                allCentres={allCentres}
                downloadCSV={downloadCSV}
                activeReportTab={activeReportTab}
                setActiveReportTab={setActiveReportTab}
              />
            )}

            {activeTab === 'operator-registers' && (
              <InspectorAttendancePage />
            )}

            {activeTab === 'courses' && effectiveRole === 'ADMIN' && (
              <AdminCourseManagement
                allCentres={allCentres}
                onCentreCreated={fetchStats}
              />
            )}

            {/* ================================================= */}
            {/* SETTINGS */}
            {/* ================================================= */}

            {activeTab === 'settings' && (
              <SettingsPage
                settingsSaved={settingsSaved}
                setSettingsSaved={setSettingsSaved}
                currentUser={{ ...currentUser, role: effectiveRole }}
                allCentres={allCentres}
                selectedRole={selectedRole}
                setRolePreview={setRolePreview}
              />
            )}

          </div>

        </main>

      </div>

      {/* RESPONSIVE CSS */}

      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #f8fafc;
        }

        button,
        input,
        select,
        textarea {
          font-family: inherit;
        }

        .sidebar-container {
          width: 258px;
          min-width: 258px;
          background-color: #0f172a;
          color: #f8fafc;
          padding: 18px 14px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          border-right: 1px solid #1e293b;
          box-sizing: border-box;
        }

        .mobile-toggle-btn {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          color: #0f172a;
          padding: 4px;
        }

        .hover-pop {
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease;
        }

        .hover-pop:hover {
          transform: translateY(-1px);
          box-shadow:
            0 4px 10px rgba(15, 23, 42, 0.12);
        }

        .interactive-card {
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .interactive-card:hover {
          transform: translateY(-2px);
          box-shadow:
            0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .table-row:hover {
          background: #f8fafc;
        }

        .nav-button:hover {
          background: #172554 !important;
        }

        @media (max-width: 900px) {

          .sidebar-container {
            width: 240px;
            min-width: 240px;
          }

          .metrics-grid-responsive {
            grid-template-columns:
              repeat(2, minmax(0, 1fr)) !important;
          }

        }

        @media (max-width: 768px) {

          .sidebar-container {
            position: fixed;
            top: 25px;
            bottom: 0;
            left: 0;
            z-index: 1000;
            transform: translateX(-100%);
            transition:
              transform 0.25s ease;
            box-shadow:
              8px 0 24px rgba(15, 23, 42, 0.15);
          }

          .sidebar-container.open-mobile {
            transform: translateX(0);
          }

          .mobile-toggle-btn {
            display: block;
          }

          .hide-mobile {
            display: none !important;
          }

          .metrics-grid-responsive {
            grid-template-columns:
              1fr !important;
          }

          .page-body-responsive {
            padding:
              14px !important;
          }

        }

/* Responsive SACH Control Tower refinements */

.app-layout,
.mainWrapper,
main {
  min-width: 0;
}

.page-body-responsive {
  width: 100% !important;
  max-width: none !important;
  min-width: 0;
}

@media (min-width: 1440px) {
  .page-body-responsive {
    padding: 24px 28px 40px !important;
  }
}

@media (max-width: 1100px) {
  .page-body-responsive {
    padding: 18px !important;
  }

  .sidebar-container {
    width: 228px;
    min-width: 228px;
  }
}

@media (max-width: 768px) {
  .page-body-responsive {
    padding: 14px !important;
  }

  .sidebar-container {
    top: 0;
    height: 100dvh;
    max-height: 100dvh;
    overflow-y: auto;
  }

  .topHeader {
    min-width: 0;
    gap: 10px;
    padding: 12px 14px !important;
    flex-wrap: wrap;
  }

  .metrics-grid-responsive {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }
}

@media (max-width: 480px) {
  .metrics-grid-responsive {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .page-body-responsive {
    padding: 12px !important;
  }
}

.auth-user-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  align-items: end;
  gap: 12px;
}

.auth-user-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(130px, 180px) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

@media (max-width: 600px) {
  .auth-user-row {
    grid-template-columns: 1fr 1fr;
  }
}

.directory-search-input {
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  color: #0f172a;
  background: #ffffff;
}

.directory-search-input::placeholder {
  color: #64748b;
  opacity: 1;
}

.brandTitle {
  color: #ffffff !important;
}

.brandSubtitle {
  color: #cbd5e1 !important;
}

.setting-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.setting-copy strong,
.setting-copy span {
  display: block;
  line-height: 1.45;
}

.setting-copy span {
  color: #64748b;
  font-size: 11px;
}

.report-type-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
  text-align: left;
}

.report-type-copy strong,
.report-type-copy span {
  display: block;
  line-height: 1.45;
}

.report-type-copy span {
  color: #64748b;
  font-size: 11px;
}

.report-brand-copy {
  display: grid;
  gap: 3px;
}

.report-brand-copy span {
  display: block;
  color: #64748b;
  font-size: 11px;
}

.report-stat-cell {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.report-stat-cell span {
  color: #64748b;
  font-size: 10px;
}

.report-stat-cell strong {
  color: #0f172a;
  font-size: 15px;
}

.operator-assigned-centre {
  display: grid;
  gap: 4px;
  padding: 11px;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
}

.audit-archive-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.audit-archive-toolbar span {
  color: #64748b;
  font-size: 11px;
}

.audit-action-error {
  margin: 10px 16px;
}

.operator-assigned-centre strong {
  color: #334155;
  font-size: 11px;
}

.operator-assigned-centre span {
  color: #0f172a;
  font-size: 13px;
}

.role-preview-control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.role-preview-select {
  box-sizing: border-box;
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 9px;
  color: #0f172a;
  background: #ffffff;
  font-size: 12px;
}

.report-preview-description {
  margin: 14px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.report-grid-responsive {
  align-items: start;
}

@media (max-width: 900px) {
  .report-grid-responsive {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}

.export-error-notice {
  margin: 12px 20px 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
  background: #fef2f2;
  font-size: 12px;
}

.operator-submit-card,
.operator-register-note {
  display: grid;
  gap: 12px;
  max-width: 680px;
  margin-top: 18px;
  padding: 20px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #ffffff;
}

.operator-submit-card h3 {
  margin: 0;
  color: #0f172a;
}

.operator-submit-card label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.operator-submit-card input,
.operator-submit-card select {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #0f172a;
  background: #ffffff;
}

.operator-submit-card button {
  justify-self: start;
}

.operator-error {
  margin: 0;
  color: #991b1b;
  font-size: 12px;
}

.operator-success {
  margin: 0;
  color: #166534;
  font-size: 12px;
}

.operator-note,
.operator-register-note span {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.operator-register-note {
  border-color: #fde68a;
  background: #fffbeb;
}

.operator-register-note strong {
  color: #92400e;
  font-size: 12px;
}

.operator-portal {
  display: grid;
  gap: 18px;
}

.operator-portal [id^="operator-section-"] {
  scroll-margin-top: 20px;
}

.operator-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.operator-summary-card {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
  padding: 15px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  background: #ffffff;
}

.operator-summary-card > span {
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.operator-summary-card > strong {
  color: #0f172a;
  font-size: 25px;
  line-height: 1.1;
}

.operator-summary-card > small {
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
}

.operator-summary-card.needs-action {
  border-color: #fed7aa;
  background: #fffaf5;
}

.operator-summary-card.needs-action > strong {
  color: #c2410c;
}

.operator-portal-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid #bfdbfe;
  border-radius: 9px;
  background: #eff6ff;
}

.operator-portal-banner div {
  display: grid;
  gap: 4px;
}

.operator-portal-banner span {
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.operator-portal-banner strong {
  color: #0f172a;
  font-size: 16px;
}

.operator-portal-banner select {
  box-sizing: border-box;
  min-height: 36px;
  min-width: min(100%, 320px);
  padding: 6px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #0f172a;
  background: #ffffff;
  font: inherit;
}

.operator-preview-notice {
  padding: 11px 14px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
  line-height: 1.5;
}

.operator-guidance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  scroll-margin-top: 20px;
}

.operator-guidance-card {
  display: grid;
  align-content: start;
  gap: 7px;
  padding: 15px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.operator-guidance-card > span {
  color: #2563eb;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.07em;
}

.operator-guidance-card > strong {
  color: #0f172a;
  font-size: 13px;
}

.operator-guidance-card > p {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.55;
}

.operator-portal-banner code,
.operator-audit-note code {
  color: #334155;
  overflow-wrap: anywhere;
}

.operator-portal-card {
  min-width: 0;
  overflow: hidden;
}

.operator-batch-checklist {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  padding: 16px;
}

.operator-batch-card {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.operator-batch-card-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.operator-batch-card-heading > div {
  display: grid;
  gap: 4px;
}

.operator-batch-card-heading strong {
  color: #0f172a;
  font-size: 13px;
}

.operator-batch-card-heading > div > span,
.operator-batch-card-counts > span {
  color: #64748b;
  font-size: 11px;
}

.operator-batch-card-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.operator-batch-card-counts strong {
  color: #0f172a;
}

.operator-batch-open {
  justify-self: start;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.operator-empty-setup {
  display: grid;
  gap: 8px;
  padding: 18px;
  color: #475569;
  font-size: 12px;
  line-height: 1.55;
}

.operator-empty-setup strong {
  color: #0f172a;
  font-size: 14px;
}

.operator-empty-setup p {
  margin: 0;
}

.operator-empty-setup ol {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 20px;
}

.operator-portal-body {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.operator-course-select,
.operator-register-form label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.operator-course-select input,
.operator-course-select select,
.operator-register-form input,
.operator-register-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #0f172a;
  background: #ffffff;
  font: inherit;
  font-weight: 400;
}

.operator-register-form textarea {
  min-height: 84px;
  resize: vertical;
}

.operator-course-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.operator-course-metrics > div {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
}

.operator-course-metrics span,
.operator-form-note {
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

.operator-course-metrics strong {
  color: #0f172a;
  font-size: 18px;
}

.operator-roster-tools {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(180px, 0.8fr) auto;
  align-items: end;
  gap: 12px;
  padding: 16px 16px 10px;
}

.operator-history-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.operator-history-summary > div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fbfdff;
}

.operator-history-summary span {
  color: #64748b;
  font-size: 10px;
}

.operator-history-summary strong {
  color: #0f172a;
  font-size: 16px;
}

.operator-register-form {
  display: grid;
  grid-template-columns: minmax(160px, 260px) auto;
  align-items: end;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
}

.operator-register-form .operator-form-note {
  grid-column: 1 / -1;
}

.operator-register-locked {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #334155;
  font-size: 12px;
}

.operator-audit-note,
.operator-face-matching-note {
  padding: 12px 14px;
  border-radius: 7px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.operator-portal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  align-items: start;
  gap: 16px;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.face-status-ready,
.face-status-pending,
.register-status {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.register-status.is-submitted {
  background: #ecfdf5;
  color: #047857;
}

.register-status.is-missing {
  background: #fff7ed;
  color: #c2410c;
}

.face-status-pending {
  background: #fff7ed;
  color: #9a3412;
}

.operator-trend {
  display: flex;
  align-items: end;
  gap: 8px;
  min-height: 104px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fbfdff;
}

.operator-trend-bar {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: end;
  gap: 5px;
  height: 84px;
  min-width: 12px;
}

.operator-trend-bar div {
  width: min(100%, 24px);
  min-height: 3px;
  border-radius: 4px 4px 0 0;
  background: #2563eb;
}

.operator-trend-bar span {
  color: #64748b;
  font-size: 9px;
}

.operator-review-list,
.operator-admin-forms {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.operator-review-request {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  background: #fffaf5;
}

.operator-review-request > div:first-child {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
}

.operator-review-request p {
  margin: 0;
  color: #475569;
  line-height: 1.5;
}

.operator-review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.operator-admin-forms {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.operator-admin-forms h3,
.operator-portal-body h3 {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
}

@media (max-width: 900px) {
  .operator-portal-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .operator-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .operator-summary-grid,
  .operator-course-metrics,
  .operator-history-summary,
  .operator-roster-tools,
  .operator-guidance-grid,
  .operator-admin-forms {
    grid-template-columns: minmax(0, 1fr);
  }

  .operator-register-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .operator-review-request,
  .operator-portal-banner {
    align-items: stretch;
    flex-direction: column;
  }
}

.dwell-buffer-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 16px 0 18px;
  padding: 16px 18px;
  border: 1px solid #bfdbfe;
  border-radius: 9px;
  background: #eff6ff;
}

.dwell-buffer-eyebrow {
  color: #1d4ed8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.dwell-buffer-card h3 {
  margin: 3px 0 4px;
  color: #0f172a;
  font-size: 14px;
}

.dwell-buffer-card p {
  max-width: 760px;
  margin: 0;
  color: #475569;
  font-size: 11px;
  line-height: 1.5;
}

.dwell-buffer-stats {
  display: grid;
  flex: 0 0 auto;
  justify-items: center;
  gap: 2px;
  min-width: 120px;
  color: #334155;
  text-align: center;
}

.dwell-buffer-stats strong {
  color: #1d4ed8;
  font-size: 24px;
  line-height: 1;
}

.dwell-buffer-stats span,
.dwell-buffer-stats small {
  font-size: 10px;
}

.rbac-preview-card {
  display: grid;
  gap: 14px;
  margin-top: 18px;
  padding: 18px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #ffffff;
}

.rbac-eyebrow {
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.rbac-preview-card h3 {
  margin: 5px 0;
  color: #0f172a;
  font-size: 16px;
}

.rbac-preview-card p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.rbac-role-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.rbac-role-option {
  display: grid;
  align-content: start;
  gap: 7px;
  min-height: 112px;
  padding: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  color: #334155;
  background: #ffffff;
  text-align: left;
}

.rbac-role-option strong {
  color: #0f172a;
  font-size: 12px;
}

.rbac-role-option span {
  font-size: 11px;
  line-height: 1.5;
}

.rbac-role-option.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px #dbeafe;
  background: #eff6ff;
}

@media (max-width: 760px) {
  .rbac-role-grid {
    grid-template-columns: 1fr;
  }

  .dwell-buffer-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .role-preview-control > span {
    display: none;
  }
}

      `}</style>

    </div>
  );
}


/* ========================================================= */
/* NAVIGATION BUTTON                                         */
/* ========================================================= */

function NavButton({
  active,
  icon,
  label,
  onClick
}) {
  return (
    <button
      className="nav-button"
      onClick={onClick}
      style={{
        ...styles.navItem,
        backgroundColor:
          active
            ? '#1e3a8a'
            : 'transparent',
        color:
          active
            ? '#ffffff'
            : '#cbd5e1'
      }}
    >
      {icon}

      <span>{label}</span>
    </button>
  );
}


/* ========================================================= */
/* DASHBOARD PAGE                                             */
/* ========================================================= */

function DashboardPage({
  overview,
  allCentres,
  totalCentres,
  highRiskCentres,
  activeAlerts,
  averageCompliance,
  attendanceRate,
  totalMarkedPresent,
  totalDetected,
  totalMissing,
  getRiskStyle,
  getRiskColor,
  handleNavClick
}) {
  const persistentGapCentres = allCentres.filter(([, centre]) => centre?.attendance_gap_active).length;
  const centresWithRecentSamples = allCentres.filter(([, centre]) => Number(centre?.attendance_sample_count || 0) > 0).length;

  return (
    <div>

      <div style={styles.pageIntro}>
        <div>
          <h3 style={styles.pageTitle}>
            National Monitoring Overview
          </h3>

          <p style={styles.pageDescription}>
            Real-time operational view of training centre
            attendance, infrastructure compliance and risk signals.
          </p>
        </div>

        <div style={styles.liveIndicator}>
          <Activity size={14} />
          Monitoring Active
        </div>
      </div>

      {/* KPI */}

      <div
        className="metrics-grid-responsive"
        style={styles.metricsGrid}
      >

        <MetricCard
          icon={<Building2 size={18} />}
          label="Training Centres"
          value={totalCentres}
          sub="Active monitoring hubs"
        />

        <MetricCard
          icon={<Users size={18} />}
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          sub={`${totalDetected} AI camera count / ${totalMarkedPresent} officially marked present`}
        />

        <MetricCard
          icon={<ShieldAlert size={18} />}
          label="High-Risk Centres"
          value={highRiskCentres}
          sub="Require official review"
          danger={highRiskCentres > 0}
        />

        <MetricCard
          icon={<BellRing size={18} />}
          label="Active Alerts"
          value={activeAlerts}
          sub="Generated from live signals"
          danger={activeAlerts > 0}
        />

        <MetricCard
          icon={<HardDrive size={18} />}
          label="Infrastructure"
          value={`${averageCompliance}%`}
          sub={`${allCentres.filter(([, centre]) => centre?.live_infrastructure_fresh).length} / ${totalCentres} centres updated within 10s`}
        />
        <MetricCard
          icon={<Users size={18} />}
          label="Officially Marked Present"
          value={totalMarkedPresent}
          sub="Reported attendance count"
        />

        <MetricCard
          icon={<Activity size={18} />}
          label="AI Camera Count"
          value={totalDetected}
          sub={`${allCentres.filter(([, centre]) => centre?.live_attendance_fresh).length} / ${totalCentres} centres updated within 10s`}
        />

        <MetricCard
          icon={<ShieldAlert size={18} />}
          label="Missing / Discrepancy Gap"
          value={totalMissing}
          sub="Marked present minus AI camera count"
        />

        <MetricCard
          icon={<BellRing size={18} />}
          label="High-Priority Alerts"
          value={overview?.alerts?.high ?? '—'}
          sub="High and critical active alerts"
          danger={(overview?.alerts?.high ?? 0) > 0}
        />

      </div>

      <section className="dwell-buffer-card" aria-labelledby="dwell-buffer-title">
        <div>
          <span className="dwell-buffer-eyebrow">ATTENDANCE RISK BUFFER</span>
          <h3 id="dwell-buffer-title">Dwell-Time Rolling Median</h3>
          <p>
            Scores use the median of up to 300 two-second observations in a 10-minute window.
            Drops under 5 minutes are buffered; discrepancy alerts require a gap lasting more than 10 consecutive minutes.
          </p>
        </div>
        <div className="dwell-buffer-stats">
          <strong>{persistentGapCentres}</strong>
          <span>centres with a sustained gap</span>
          <small>{centresWithRecentSamples} / {totalCentres} centres reporting samples</small>
        </div>
      </section>

      {/* MAIN GRID */}

      <div style={styles.twoColumnGrid}>

        {/* RISK TABLE */}

        <div style={styles.tableCard}>

          <SectionHeader
            title="Centre Risk Overview"
            subtitle="AI camera count compared with officially marked-present learners"
            action="View Centres"
            onClick={() =>
              handleNavClick('centres')
            }
          />

          <div style={styles.tableScroll}>

            <table style={styles.table}>

              <thead>

                <tr>
                  <th style={styles.th}>
                    Centre
                  </th>

                  <th style={styles.th}>
                    Coverage
                  </th>

                  <th style={styles.th}>
                    Infrastructure
                  </th>

                  <th style={styles.th}>
                    Risk
                  </th>

                  <th style={styles.th}>
                    Status
                  </th>
                </tr>

              </thead>

              <tbody>

                {allCentres.map(
                  ([id, info]) => {

                    const official = Number(info?.official_marked_present ?? 0);

                    const detected = Number(
                      info?.live_headcount || 0
                    );

                    const attendance =
                      official > 0
                        ? Math.round(
                            (detected / official) *
                              100
                          )
                        : 0;

                    const risk = Number(
                      info?.fraud_risk_score || 0
                    );

                    return (
                      <tr
                        key={id}
                        className="table-row"
                        style={styles.tr}
                      >

                        <td style={styles.td}>

                          <div>
                            <strong>
                              {info?.name || id}
                            </strong>

                            <div
                              style={
                                styles.miniText
                              }
                            >
                              {id}
                            </div>
                          </div>

                        </td>

                        <td style={styles.td}>
                          {attendance}%
                          <div style={styles.miniText}>
                            {info?.live_attendance_fresh
                              ? `Live · ${info.live_attendance_age_seconds}s ago`
                              : info?.last_attendance_at
                                ? `Last camera sample · ${info.live_attendance_age_seconds ?? '—'}s ago`
                                : 'No camera sample'}
                          </div>
                        </td>

                        <td style={styles.td}>
                          {info?.compliance_percentage ??
                            0}
                          %
                          <div style={styles.miniText}>
                            {info?.live_infrastructure_fresh
                              ? `Live · ${info.live_infrastructure_age_seconds}s ago`
                              : info?.live_infrastructure_received_at
                                ? `Last live result · ${info.live_infrastructure_age_seconds ?? '—'}s ago`
                                : 'Saved audit result'}
                          </div>
                        </td>

                        <td style={styles.td}>

                          <strong
                            style={{
                              color:
                                getRiskColor(
                                  risk
                                )
                            }}
                          >
                            {risk}
                          </strong>

                          <span
                            style={
                              styles.scoreSuffix
                            }
                          >
                            /100
                          </span>

                        </td>

                        <td style={styles.td}>

                          <span
                            style={getRiskStyle(
                              risk
                            )}
                          >
                            {getRiskLevel(
                              risk
                            )}
                          </span>

                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>

        </div>

        {/* ATTENDANCE SUMMARY */}

        <div style={styles.tableCard}>

          <SectionHeader
            title="Live Attendance Signal"
            subtitle="Latest AI observation stream"
          />

          <div style={styles.signalPanel}>

            <div style={styles.signalIcon}>
              <ScanLine size={22} />
            </div>

            <div>

              <span
                style={styles.cardLabel}
              >
                AI OBSERVED
              </span>

              <div
                style={styles.bigSignalNumber}
              >
                {totalDetected}
              </div>

              <span
                style={styles.miniText}
              >
                persons currently observed
              </span>

            </div>

          </div>

          <div style={styles.attendanceBreakdown}>

            <div style={styles.attendanceBreakdownItem}>
              <span style={styles.miniText}>
                Marked Present
              </span>

              <strong>
                {totalMarkedPresent}
              </strong>
            </div>

            <div style={styles.attendanceBreakdownItem}>
              <span style={styles.miniText}>
                Missing / Gap
              </span>

              <strong
                style={{
                  color:
                    totalMissing > 0
                      ? '#b91c1c'
                      : '#15803d'
                }}
              >
                {totalMissing}
              </strong>
            </div>

            <div style={styles.attendanceBreakdownItem}>
              <span style={styles.miniText}>
                Coverage
              </span>

              <strong>
                {attendanceRate}%
              </strong>
            </div>

          </div>

          <button
            style={styles.secondaryButton}
            onClick={() =>
              handleNavClick('attendance')
            }
          >
            Open Attendance Intelligence
            <ArrowUpRight size={14} />
          </button>

        </div>

      </div>

      {/* CENTRE CARDS */}

      <div style={{ marginTop: '20px' }}>

        <SectionHeader
          title="Training Centre Telemetry"
          subtitle="Live centre-level signals"
        />

        <div style={styles.centreGrid}>

          {allCentres.map(
            ([id, info]) => {

              const risk = Number(
                info?.fraud_risk_score || 0
              );

              const isAlert = risk >= 50;

              return (
                <div
                  key={id}
                  style={{
                    ...styles.centreCard,
                    borderTop:
                      `4px solid ${
                        getRiskColor(risk)
                      }`
                  }}
                  className="interactive-card"
                >

                  <div
                    style={
                      styles.centreCardHeader
                    }
                  >

                    <div>

                      <h4
                        style={
                          styles.centreName
                        }
                      >
                        {info?.name || id}
                      </h4>

                      <span
                        style={styles.codeText}
                      >
                        ID: {id}
                      </span>

                    </div>

                    <span
                      style={getRiskStyle(
                        risk
                      )}
                    >
                      {getRiskLevel(risk)}
                    </span>

                  </div>

                  <div
                    style={styles.infoRow}
                  >
                    <span>
                      AI Camera Count / Marked Present
                    </span>

                    <strong>
                      {info?.live_headcount || 0}
                      {' / '}
                      {info?.official_marked_present ?? 0}
                    </strong>
                    <span style={styles.miniText}>
                      {info?.live_attendance_fresh
                        ? `Live · ${info.live_attendance_age_seconds}s ago`
                        : info?.last_attendance_at
                          ? `Last sample · ${info.live_attendance_age_seconds ?? '—'}s ago`
                          : 'No camera sample'}
                    </span>
                  </div>

                  <div
                    style={styles.infoRow}
                  >
                    <span>
                      Infrastructure
                    </span>

                    <strong>
                      {info?.compliance_percentage ??
                        0}
                      %
                    </strong>
                    <span style={styles.miniText}>
                      {info?.live_infrastructure_fresh
                        ? `Live · ${info.live_infrastructure_status} · ${info.live_infrastructure_age_seconds}s ago`
                        : info?.live_infrastructure_received_at
                          ? `Last live result · ${info.live_infrastructure_age_seconds ?? '—'}s ago`
                          : 'Saved audit result'}
                    </span>
                  </div>

                  <div
                    style={styles.infoRow}
                  >
                    <span>
                      Risk Index
                    </span>

                    <strong
                      style={{
                        color:
                          getRiskColor(
                            risk
                          )
                      }}
                    >
                      {risk}/100
                    </strong>
                  </div>

                  <div
                    style={
                      styles.progressBarBg
                    }
                  >

                    <div
                      style={{
                        ...styles.progressBarFill,
                        width: `${Math.min(
                          risk,
                          100
                        )}%`,
                        backgroundColor:
                          getRiskColor(
                            risk
                          )
                      }}
                    />

                  </div>

                  {isAlert && (
                    <div
                      style={
                        styles.warningStrip
                      }
                    >
                      <AlertTriangle
                        size={13}
                      />

                      Official review
                      recommended
                    </div>
                  )}

                </div>
              );
            }
          )}

        </div>

      </div>

    </div>
  );
}


function CentreOperatorPortal({
  currentUser,
  previewMode = false,
  allCentres = [],
  activeSection = 'overview'
}) {
  const [portal, setPortal] = useState(null);
  const [previewCentreId, setPreviewCentreId] = useState(
    currentUser.centre_id || allCentres[0]?.[0] || ''
  );
  const [courseId, setCourseId] = useState('');
  const [roster, setRoster] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFaceFilter, setRosterFaceFilter] = useState('ALL');
  const [markedPresent, setMarkedPresent] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const firstCentreId = allCentres[0]?.[0] || '';
  const centreId = previewMode ? previewCentreId : currentUser.centre_id;
  const previewCentreName = allCentres.find(([id]) => id === centreId)?.[1]?.name;

  useEffect(() => {
    if (previewMode && !previewCentreId && firstCentreId) {
      setPreviewCentreId(firstCentreId);
    }
  }, [previewMode, previewCentreId, firstCentreId]);

  useEffect(() => {
    let active = true;
    const loadPortal = async () => {
      try {
        let data;
        if (previewMode) {
          const { data: courseData } = await axios.get(`${API_BASE}/admin/courses`, {
            params: { centre_id: centreId }
          });
          const serverDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(new Date());
          data = {
            centre: { centre_id: centreId, name: previewCentreName || centreId },
            courses: (courseData.courses || []).filter(course => course.is_active),
            server_date: serverDate
          };
        } else {
          const result = await axios.get(`${API_BASE}/operator/portal`);
          data = result.data;
        }
        if (!active) return;
        setPortal(data);
        setCourseId(current => (
          data.courses.some(course => String(course.id) === current)
            ? current
            : String(data.courses[0]?.id || '')
        ));
        if (data.server_date) setMonth(data.server_date.slice(0, 7));
      } catch (error) {
        if (active) setErrorMessage(getApiErrorMessage(error, 'Could not load your centre portal.'));
      }
    };
    if (!previewMode || centreId) loadPortal();
    return () => { active = false; };
  }, [previewMode, centreId, previewCentreName]);

  useEffect(() => {
    if (!courseId) {
      setRoster([]);
      return undefined;
    }
    let active = true;
    const encodedCourseId = encodeURIComponent(courseId);
    axios.get(previewMode
      ? `${API_BASE}/admin/courses/${encodedCourseId}/students`
      : `${API_BASE}/operator/courses/${encodedCourseId}/roster`)
      .then(({ data }) => {
        if (!active) return;
        setRoster(data.students || []);
      })
      .catch(error => {
        if (active) setErrorMessage(getApiErrorMessage(error, 'Could not load this course roster.'));
      });
    return () => { active = false; };
  }, [courseId, previewMode, refreshToken]);

  useEffect(() => {
    let active = true;
    const currentMonth = portal?.server_date?.slice(0, 7);
    const monthsToLoad = [...new Set([month, currentMonth].filter(Boolean))];
    Promise.all(monthsToLoad.map(requestedMonth => (
      axios.get(
        previewMode
          ? `${API_BASE}/inspector/attendance-registers`
          : `${API_BASE}/operator/attendance-registers`,
        {
          params: {
            month: requestedMonth,
            ...(previewMode ? { centre_id: centreId } : {})
          }
        }
      )
    )))
      .then(results => {
        if (!active) return;
        const loadedRegisters = results.flatMap(result => result.data.registers || []);
        const uniqueRegisters = [...new Map(
          loadedRegisters.map(register => [register.id, register])
        ).values()];
        setRegisters(uniqueRegisters);
        const currentRegister = uniqueRegisters.find(register => (
          String(register.course_id) === courseId
          && register.attendance_date === portal?.server_date
        ));
        setMarkedPresent(currentRegister ? String(currentRegister.marked_present) : '');
      })
      .catch(error => {
        if (active) setErrorMessage(getApiErrorMessage(error, 'Could not load attendance history.'));
      });
    return () => { active = false; };
  }, [month, refreshToken, courseId, portal?.server_date, previewMode, centreId]);

  const selectedCourse = portal?.courses?.find(item => String(item.id) === courseId);
  const selectedRegisters = registers.filter(
    item => String(item.course_id) === courseId
      && item.attendance_date.slice(0, 7) === month
  );
  const todayRegister = registers.find(
    item => item.attendance_date === portal?.server_date
      && String(item.course_id) === courseId
  );
  const canEdit = ['SUBMITTED', 'OVERRIDE_APPROVED'].includes(todayRegister?.lock_status);
  const trend = [...selectedRegisters]
    .reverse()
    .slice(-14);
  const todayRegisters = (portal?.courses || []).map(course => ({
    course,
    register: registers.find(item => (
      String(item.course_id) === String(course.id)
      && item.attendance_date === portal?.server_date
    ))
  }));
  const submittedToday = todayRegisters.filter(item => item.register);
  const missingToday = todayRegisters.length - submittedToday.length;
  const enrolledTotal = (portal?.courses || []).reduce(
    (total, course) => total + course.enrollment_count,
    0
  );
  const markedPresentTotal = submittedToday.reduce(
    (total, item) => total + item.register.marked_present,
    0
  );
  const expectedTodayTotal = submittedToday.reduce(
    (total, item) => total + item.register.expected_count,
    0
  );
  const attendanceCoverage = expectedTodayTotal
    ? Math.round((markedPresentTotal / expectedTodayTotal) * 100)
    : null;
  const filteredRoster = roster.filter(student => {
    const matchesSearch = `${student.student_name} ${student.roll_number}`
      .toLowerCase()
      .includes(rosterSearch.trim().toLowerCase());
    const faceReady = ['REGISTERED', 'PHOTO_ONBOARDED'].includes(student.face_profile_status);
    return matchesSearch
      && (rosterFaceFilter === 'ALL' || (rosterFaceFilter === 'READY' ? faceReady : !faceReady));
  });
  const faceProfilesReady = roster.filter(student => (
    ['REGISTERED', 'PHOTO_ONBOARDED'].includes(student.face_profile_status)
  )).length;
  const monthMarkedPresent = selectedRegisters.reduce(
    (total, register) => total + register.marked_present,
    0
  );
  const monthExpected = selectedRegisters.reduce(
    (total, register) => total + register.expected_count,
    0
  );

  const submitRegister = async event => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      if (todayRegister) {
        await axios.put(`${API_BASE}/operator/attendance-registers/${todayRegister.id}`, {
          marked_present: Number(markedPresent)
        });
        setSuccessMessage('Daily register edited. It is now permanently locked.');
      } else {
        await axios.post(`${API_BASE}/operator/attendance-registers`, {
          course_id: Number(courseId),
          attendance_date: portal.server_date,
          marked_present: Number(markedPresent)
        });
        setSuccessMessage('Daily register submitted and edit window opened.');
      }
      setRefreshToken(value => value + 1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Daily attendance could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const requestUnlock = async event => {
    event.preventDefault();
    if (!todayRegister) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await axios.post(
        `${API_BASE}/operator/attendance-registers/${todayRegister.id}/override-requests`,
        { reason: overrideReason }
      );
      setOverrideReason('');
      setSuccessMessage('Inspector override request submitted for review.');
      setRefreshToken(value => value + 1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not submit the Inspector override request.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="operator-portal">
      <PageIntro
    title={previewMode
      ? `Centre Operator Preview · ${activeSection === 'overview' ? 'Overview' : activeSection === 'daily' ? 'Daily Attendance' : activeSection === 'students' ? 'Student Roster' : activeSection === 'history' ? 'Monthly History' : 'Help'}`
      : `Centre Operator · ${activeSection === 'overview' ? 'Overview' : activeSection === 'daily' ? 'Daily Attendance' : activeSection === 'students' ? 'Student Roster' : activeSection === 'history' ? 'Monthly History' : 'Help'}`}
    description={previewMode
      ? 'Read-only view for the selected centre. Role preview does not grant operator permissions.'
      : 'Centre-scoped tools for daily attendance, learner records, and register history.'}
        badge={previewMode ? 'ADMINISTRATOR PREVIEW · READ ONLY' : 'CENTRE-SCOPED ACCESS'}
      />
      {previewMode && (
        <div className="operator-preview-notice" role="note">
          You are still signed in as {currentUser.username}. This is a read-only UI preview; actual operator access is enforced by the server and requires a Centre Operator login.
        </div>
      )}
      <div className="operator-portal-banner">
        <div>
          <span>{previewMode ? 'PREVIEW CENTRE' : 'ASSIGNED TRAINING CENTRE'}</span>
          {previewMode ? (
            <select
              value={previewCentreId}
              aria-label="Preview centre"
              onChange={event => {
                setPreviewCentreId(event.target.value);
                setCourseId('');
                setPortal(null);
              }}
            >
              {allCentres.map(([id, centre]) => (
                <option key={id} value={id}>{centre?.name || id} · {id}</option>
              ))}
            </select>
          ) : (
            <strong>{portal?.centre?.name || 'Loading centre…'}</strong>
          )}
        </div>
        <code>{portal?.centre?.centre_id || centreId || 'Loading centre…'}</code>
      </div>

      {errorMessage && <p className="operator-error" role="alert">{errorMessage}</p>}
      {successMessage && <p className="operator-success" role="status">{successMessage}</p>}

      {activeSection === 'overview' && (
      <>
      <section id="operator-section-overview" className="operator-summary-grid" aria-label="Centre daily summary">
        <article className="operator-summary-card">
          <span>ACTIVE COURSE BATCHES</span>
          <strong>{portal?.courses?.length ?? '—'}</strong>
          <small>Assigned to this centre</small>
        </article>
        <article className="operator-summary-card">
          <span>ENROLLED LEARNERS</span>
          <strong>{portal ? enrolledTotal : '—'}</strong>
          <small>Across active course batches</small>
        </article>
        <article className={`operator-summary-card${portal?.courses?.length && missingToday ? ' needs-action' : ''}`}>
          <span>TODAY'S REGISTERS</span>
          <strong>{portal?.courses?.length ? `${submittedToday.length} / ${todayRegisters.length}` : '—'}</strong>
          <small>{!portal ? 'Loading assigned batches' : portal.courses.length ? (missingToday ? `${missingToday} batch${missingToday === 1 ? '' : 'es'} still need submission` : 'All active batches submitted') : 'Add active batches to begin'}</small>
        </article>
        <article className="operator-summary-card">
          <span>MARKED PRESENT TODAY</span>
          <strong>{portal?.courses?.length ? markedPresentTotal : '—'}</strong>
          <small>{!portal ? 'Loading today’s registers' : portal.courses.length ? (attendanceCoverage === null ? 'No attendance submitted yet' : `${attendanceCoverage}% of submitted-batch expected count`) : 'Add active batches to begin'}</small>
        </article>
      </section>

      <section className="table-card operator-portal-card">
        <SectionHeader
          title="Today's Batch Checklist"
          subtitle={portal?.server_date ? `Attendance closeout for ${portal.server_date}. Select a batch to open its register.` : 'Loading centre attendance status…'}
        />
        {portal === null ? (
          <div className="operator-empty-setup">Loading assigned centre courses…</div>
        ) : todayRegisters.length ? (
          <div className="operator-batch-checklist">
            {todayRegisters.map(({ course, register }) => (
              <article className="operator-batch-card" key={course.id}>
                <div className="operator-batch-card-heading">
                  <div>
                    <strong>{course.name}</strong>
                    <span>{course.batch_name} · {course.course_code}</span>
                  </div>
                  <span className={`register-status${register ? ' is-submitted' : ' is-missing'}`}>
                    {register ? register.lock_status.replaceAll('_', ' ') : 'NOT SUBMITTED'}
                  </span>
                </div>
                <div className="operator-batch-card-counts">
                  <span>Enrolled <strong>{course.enrollment_count}</strong></span>
                  <span>Marked present <strong>{register ? `${register.marked_present} / ${register.expected_count}` : '—'}</strong></span>
                </div>
                <button
                  type="button"
                  className="operator-batch-open"
                  onClick={() => {
                    setCourseId(String(course.id));
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                >
                  {previewMode ? 'Open batch' : register ? 'Review register' : 'Submit attendance'}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="operator-empty-setup">
            <strong>No course batches are active for this centre yet.</strong>
            <p>Your operator account is ready, but a centre administrator must configure the course batches and enrolled student roster before you can submit attendance.</p>
            <ol>
              <li>Ask the administrator to add each course and batch assigned to your centre.</li>
              <li>Confirm the student roster and face-profile onboarding status.</li>
              <li>Return here to submit and track each batch's daily register.</li>
            </ol>
          </div>
        )}
      </section>
      </>
      )}

      {previewMode && selectedCourse && activeSection === 'daily' && (
        <div className="operator-preview-notice" role="note">
          Attendance submission, edits, and Inspector unlock requests are disabled in role preview.
        </div>
      )}
      {portal?.courses?.length > 0 && ['students', 'history'].includes(activeSection) && (
        <label className="operator-course-select operator-section-course-select">
          Course and batch
          <select value={courseId} onChange={event => setCourseId(event.target.value)}>
            {portal.courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.batch_name} ({course.course_code})
              </option>
            ))}
          </select>
        </label>
      )}
      {activeSection === 'daily' && portal?.courses?.length > 0 && (
      <section className="table-card operator-portal-card">
        <SectionHeader
          title="Course-wise Daily Register"
          subtitle="Submit once today; one edit is available during the first 30 minutes only. After that, an Inspector must approve a one-time override."
        />
        <div className="operator-portal-body">
          {portal?.courses?.length ? (
            <>
              <label className="operator-course-select">
                Course and batch
                <select
                  value={courseId}
                  onChange={event => {
                    setCourseId(event.target.value);
                    setMarkedPresent('');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                >
                  {portal.courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.name} · {course.batch_name} ({course.course_code})
                    </option>
                  ))}
                </select>
              </label>
              {selectedCourse && (
                <div className="operator-course-metrics">
                  <div><span>Course enrollment</span><strong>{selectedCourse.enrollment_count}</strong></div>
                  <div><span>Daily expected count</span><strong>{selectedCourse.enrollment_count}</strong></div>
                  <div><span>Marked present today</span><strong>{todayRegister?.marked_present ?? 'Not submitted'}</strong></div>
                </div>
              )}

              {previewMode ? (
                <div className="operator-register-locked">
                  <strong>{todayRegister ? `Today's status: ${todayRegister.lock_status.replaceAll('_', ' ')}` : 'No register has been submitted today.'}</strong>
                  <span>{todayRegister ? `Marked present: ${todayRegister.marked_present} / ${todayRegister.expected_count}` : 'A signed-in operator can submit this course batch’s register.'}</span>
                </div>
              ) : !todayRegister || canEdit ? (
                <form className="operator-register-form" onSubmit={submitRegister}>
                  <label>
                    Officially marked present
                    <input
                      type="number"
                      min="0"
                      max={selectedCourse?.enrollment_count ?? 0}
                      step="1"
                      required
                      value={markedPresent}
                      onChange={event => setMarkedPresent(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving || !courseId || Number(markedPresent) > (selectedCourse?.enrollment_count ?? 0)}
                    style={styles.primaryButton}
                  >
                    {saving ? 'Saving…' : todayRegister ? 'Use one-time edit and lock' : 'Submit today’s attendance'}
                  </button>
                  {todayRegister && (
                    <span className="operator-form-note">
                      One edit remains in the 30-minute grace window. Saving locks this batch register.
                    </span>
                  )}
                </form>
              ) : (
                <div className="operator-register-locked">
                  <strong>Register status: {todayRegister.lock_status.replaceAll('_', ' ')}</strong>
                  <span>Submitted {new Date(todayRegister.submitted_at).toLocaleString()} · edits used: {todayRegister.edit_count}</span>
                  {todayRegister.lock_status === 'PERMANENTLY_LOCKED' && (
                    <form className="operator-register-form" onSubmit={requestUnlock}>
                      <label>
                        Inspector override reason
                        <textarea
                          required
                          minLength={10}
                          maxLength={2000}
                          value={overrideReason}
                          onChange={event => setOverrideReason(event.target.value)}
                          placeholder="Explain why this locked register needs correction."
                        />
                      </label>
                      <button type="submit" disabled={saving || overrideReason.trim().length < 10} style={styles.secondaryButton}>
                        {saving ? 'Sending…' : 'Request Inspector override'}
                      </button>
                    </form>
                  )}
                  {todayRegister.lock_status === 'OVERRIDE_REQUESTED' && (
                    <span>Your request is pending Inspector review. The register remains locked.</span>
                  )}
                  {todayRegister.lock_status === 'OVERRIDE_APPROVED' && (
                    <span>Inspector {todayRegister.override_granted_by} approved one edit. Submit the correction to lock the register again.</span>
                  )}
                </div>
              )}
              {todayRegister && (
                <div className="operator-audit-note">
                  Submission network signature: <code>{todayRegister.network_signature || 'Unavailable'}</code>
                </div>
              )}
            </>
          ) : (
            <p className="operator-note">No active courses have been configured for this centre. Contact the national administrator.</p>
          )}
        </div>
      </section>
      )}

      {activeSection === 'daily' && portal && !portal.courses.length && (
        <div id="operator-section-daily" className="operator-empty-setup">
          <strong>No course batches are configured for {portal.centre.name}.</strong>
          <p>A centre administrator must add a course batch and student roster before this centre can submit a daily attendance register.</p>
        </div>
      )}

      {selectedCourse && activeSection === 'students' && (
        <div className="operator-portal-grid">
          <section id="operator-section-students" className="table-card operator-portal-card">
            <SectionHeader
              title="Enrolled Student Roster"
              subtitle={`${roster.length} enrolled students · ${faceProfilesReady} face profiles onboarded · biometric templates are not exposed.`}
            />
            <div className="operator-roster-tools">
              <label className="operator-course-select">
                Find learner
                <input
                  type="search"
                  value={rosterSearch}
                  onChange={event => setRosterSearch(event.target.value)}
                  placeholder="Search name or roll number"
                />
              </label>
              <label className="operator-course-select">
                Face profile status
                <select value={rosterFaceFilter} onChange={event => setRosterFaceFilter(event.target.value)}>
                  <option value="ALL">All learners</option>
                  <option value="READY">Onboarded</option>
                  <option value="PENDING">Needs onboarding</option>
                </select>
              </label>
              <span className="operator-form-note">Showing {filteredRoster.length} of {roster.length} learners</span>
            </div>
            <div className="table-scroll">
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Student Name</th>
                    <th style={styles.th}>Roll No.</th>
                    <th style={styles.th}>Enrolled Date</th>
                    <th style={styles.th}>Registered Face ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map(student => (
                    <tr key={student.roll_number} style={styles.tr}>
                      <td style={styles.td}>{student.student_name}</td>
                      <td style={styles.td}>{student.roll_number}</td>
                      <td style={styles.td}>{student.enrolled_date}</td>
                      <td style={styles.td}>
                        <span className={student.face_profile_status === 'REGISTERED' || student.face_profile_status === 'PHOTO_ONBOARDED' ? 'face-status-ready' : 'face-status-pending'}>
                          {student.face_profile_status === 'REGISTERED'
                            ? `Face profile · ${student.face_profile_id}`
                            : student.face_profile_status === 'PHOTO_ONBOARDED'
                              ? 'Photo onboarded'
                              : 'Not registered'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!roster.length && <tr><td colSpan="4" style={styles.td}>No student roster configured for this course.</td></tr>}
                  {!!roster.length && !filteredRoster.length && <tr><td colSpan="4" style={styles.td}>No learners match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      )}

      {selectedCourse && activeSection === 'history' && (
        <section id="operator-section-history" className="table-card operator-portal-card">
          <SectionHeader
            title="Monthly Attendance History"
            subtitle={`${selectedCourse.name} · ${selectedCourse.batch_name}`}
          />
          <div className="operator-portal-body">
              <label className="operator-course-select">
                Select month
                <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
              </label>
              <div className="operator-history-summary">
                <div><span>Submitted days</span><strong>{selectedRegisters.length}</strong></div>
                <div><span>Marked present</span><strong>{monthMarkedPresent}</strong></div>
                <div><span>Expected on submitted days</span><strong>{monthExpected}</strong></div>
              </div>
              <div className="operator-trend" aria-label="Course attendance percentage trend">
                {trend.map(register => (
                  <div className="operator-trend-bar" key={register.id} title={`${register.attendance_date}: ${register.attendance_percentage}%`}>
                    <div style={{ height: `${Math.max(3, Math.min(100, register.attendance_percentage))}%` }} />
                    <span>{register.attendance_date.slice(-2)}</span>
                  </div>
                ))}
                {!trend.length && <span className="operator-form-note">No attendance history for this month.</span>}
              </div>
              <div className="table-scroll">
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Course</th>
                      <th style={styles.th}>Marked Present</th>
                      <th style={styles.th}>Camera Verified</th>
                      <th style={styles.th}>Lock Status</th>
                      <th style={styles.th}>Submitted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRegisters.map(register => (
                      <tr key={register.id} style={styles.tr}>
                        <td style={styles.td}>{register.attendance_date}</td>
                        <td style={styles.td}>{register.course_name} · {register.batch_name}</td>
                        <td style={styles.td}>{register.marked_present} / {register.expected_count}</td>
                        <td style={styles.td}>{register.camera_verified_count ?? 'Awaiting course-level camera feed'}</td>
                        <td style={styles.td}><span className="register-status">{register.lock_status.replaceAll('_', ' ')}</span></td>
                        <td style={styles.td}>{new Date(register.submitted_at).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!registers.length && <tr><td colSpan="6" style={styles.td}>No registers submitted in this month.</td></tr>}
                  </tbody>
                </table>
              </div>
          </div>
        </section>
      )}
      {portal && !selectedCourse && activeSection === 'students' && (
        <div>
          <section id="operator-section-students" className="table-card operator-portal-card">
            <SectionHeader
              title="Student Roster"
              subtitle="Course-wise enrolled learners and face-onboarding status."
            />
            <div className="operator-empty-setup">
              <strong>No roster is available yet.</strong>
              <p>Once an administrator configures a course batch and enrols its learners, you can review names, roll numbers and face-profile onboarding here.</p>
            </div>
          </section>
        </div>
      )}
      {portal && !selectedCourse && activeSection === 'history' && (
        <div>
          <section id="operator-section-history" className="table-card operator-portal-card">
            <SectionHeader
              title="Monthly Attendance History"
              subtitle="Course-wise submitted registers, attendance trend and lock status."
            />
            <div className="operator-empty-setup">
              <strong>History appears after the first course register.</strong>
              <p>Submitted attendance, audit history and verified camera availability will appear here once a course batch is configured.</p>
            </div>
          </section>
        </div>
      )}
      {activeSection === 'guidance' && <section id="operator-section-guidance" className="operator-guidance-grid">
        <article className="operator-guidance-card">
          <span>01 · DAILY REGISTER</span>
          <strong>Submit one official count per course batch</strong>
          <p>The expected count is snapshotted from the active enrolled roster. A centre-wide dashboard total is not used as the batch denominator.</p>
        </article>
        <article className="operator-guidance-card">
          <span>02 · EDIT & LOCK</span>
          <strong>One edit within 30 minutes</strong>
          <p>The first edit permanently locks the register. After the grace period, request an Inspector override; approval permits one audited correction.</p>
        </article>
        <article className="operator-guidance-card">
          <span>03 · FACE ONBOARDING</span>
          <strong>Review learner onboarding status</strong>
          <p>Only face-profile status and opaque identifiers are shown. Raw face images and biometric templates are not available in this portal.</p>
        </article>
        <article className="operator-guidance-card">
          <span>04 · CAMERA VERIFICATION</span>
          <strong>Course-level counts are not yet connected</strong>
          <p>Camera verified counts remain unavailable until a verified course-tagged feed is integrated; centre-wide counts are not substituted.</p>
        </article>
      </section>}
    </div>
  );
}

function InspectorAttendancePage() {
  const [registers, setRegisters] = useState([]);
  const [requests, setRequests] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get(`${API_BASE}/inspector/attendance-registers`),
      axios.get(`${API_BASE}/inspector/override-requests`, { params: { status: 'PENDING' } })
    ])
      .then(([registerResult, requestResult]) => {
        if (!active) return;
        setRegisters(registerResult.data.registers || []);
        setRequests(requestResult.data.requests || []);
        setErrorMessage('');
      })
      .catch(error => {
        if (active) setErrorMessage(getApiErrorMessage(error, 'Could not load operator attendance reviews.'));
      });
    return () => { active = false; };
  }, [refreshToken]);

  const decide = async (requestId, decision) => {
    setErrorMessage('');
    setNotice('');
    try {
      await axios.post(`${API_BASE}/inspector/override-requests/${requestId}/decision`, {
        decision,
        note: decision === 'APPROVE' ? 'Approved by Inspector' : 'Rejected by Inspector'
      });
      setNotice(`Override request ${decision.toLowerCase()}d.`);
      setRefreshToken(value => value + 1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not record the Inspector decision.'));
    }
  };

  return (
    <div>
      <PageIntro
        title="Centre Operator Attendance Review"
        description="Review operator submission timestamps, course register counts, camera-feed availability, and requests to correct locked attendance."
        badge="INSPECTOR REVIEW"
      />
      {errorMessage && <p role="alert" className="operator-error">{errorMessage}</p>}
      {notice && <p role="status" className="operator-success">{notice}</p>}
      <section className="table-card operator-portal-card">
        <SectionHeader
          title="Pending Unlock Requests"
          subtitle="Approval grants exactly one audited correction; the register locks again immediately after that edit."
        />
        <div className="operator-review-list">
          {requests.map(item => (
            <article className="operator-review-request" key={item.id}>
              <div>
                <strong>{item.centre_name} · {item.course_name} · {item.batch_name}</strong>
                <span>{item.attendance_date} · {item.marked_present} present · requested by {item.requested_by} at {new Date(item.requested_at).toLocaleString()}</span>
                <p>{item.reason}</p>
              </div>
              <div className="operator-review-actions">
                <button type="button" onClick={() => decide(item.id, 'APPROVE')} style={styles.primaryButton}>Approve one edit</button>
                <button type="button" onClick={() => decide(item.id, 'REJECT')} style={styles.secondaryButton}>Reject</button>
              </div>
            </article>
          ))}
          {!requests.length && <p className="operator-form-note">No pending unlock requests.</p>}
        </div>
      </section>
      <section className="table-card operator-portal-card">
        <SectionHeader
          title="Course-Level Official Register Review"
          subtitle="Register counts are per course and batch. Camera comparison remains unavailable until a course-tagged verified feed is connected."
        />
        <div className="table-scroll">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Centre</th>
                <th style={styles.th}>Submitted At</th>
                <th style={styles.th}>Course / Batch</th>
                <th style={styles.th}>Official Register</th>
                <th style={styles.th}>AI Camera Count</th>
                <th style={styles.th}>Lock Status</th>
              </tr>
            </thead>
            <tbody>
              {registers.map(register => (
                <tr key={register.id} style={styles.tr}>
                  <td style={styles.td}>{register.centre_id}</td>
                  <td style={styles.td}>{new Date(register.submitted_at).toLocaleString()}</td>
                  <td style={styles.td}>{register.course_name} · {register.batch_name} · {register.attendance_date}</td>
                  <td style={styles.td}>{register.marked_present} / {register.expected_count}</td>
                  <td style={styles.td}>{register.camera_verified_count ?? 'Awaiting course-level feed'}</td>
                  <td style={styles.td}><span className="register-status">{register.lock_status.replaceAll('_', ' ')}</span></td>
                </tr>
              ))}
              {!registers.length && <tr><td colSpan="6" style={styles.td}>No course attendance registers have been submitted.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MonitoringPage({
  stats,
  allCentres,
  getRiskStyle,
  getRiskColor,
  fetchStats,
  canSubmitAttendance
}) {
  const [selectedMonitorCentre, setSelectedMonitorCentre] = useSharedCentre('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [streamTime, setStreamTime] = useState('--:--:--');
  const [clockTimeMs, setClockTimeMs] = useState(0);
  const [streamFramesByCentre, setStreamFramesByCentre] = useState({});
  const [streamHeadcountsByCentre, setStreamHeadcountsByCentre] = useState({});
  const [streamConnection, setStreamConnection] = useState('SELECT A CENTRE');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setStreamTime(now.toLocaleTimeString());
      setClockTimeMs(now.getTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedMonitorCentre) return undefined;
    const wsBase = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
    const socket = openAuthenticatedWebSocket(
      `${wsBase}/ws/live_feed/${encodeURIComponent(selectedMonitorCentre)}/attendance`
    );

    socket.onopen = () => setStreamConnection('CONNECTED · WAITING FOR CAMERA');
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'authenticated') return;
        if (typeof message.frame === 'string') {
          setStreamFramesByCentre(current => ({
            ...current,
            [selectedMonitorCentre]: message
          }));
          setStreamConnection('LIVE');
        }
        if (Number.isInteger(message.live_headcount) && message.live_headcount >= 0) {
          setStreamHeadcountsByCentre(current => ({
            ...current,
            [selectedMonitorCentre]: message.live_headcount
          }));
        }
      } catch (error) {
        console.error('Invalid live-feed WebSocket message:', error);
      }
    };

    socket.onerror = error => {
      setStreamConnection('CONNECTION ERROR');
      console.error('Live-feed WebSocket error:', error);
    };
    socket.onclose = () => setStreamConnection('DISCONNECTED');

    return () => {
      socket.onmessage = null;
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, [selectedMonitorCentre]);

  const logs = stats?.recent_attendance_logs || [];

  const currentInfo =
    allCentres.find(([id]) => id === selectedMonitorCentre)?.[1] || {};

  const streamFrame = streamFramesByCentre[selectedMonitorCentre]?.frame || '';
  const selectedStreamFrame = streamFramesByCentre[selectedMonitorCentre];
  const streamReceivedAt = selectedStreamFrame?.received_at;
  const frameResolution = Number.isInteger(selectedStreamFrame?.frame_width)
    && Number.isInteger(selectedStreamFrame?.frame_height)
    ? `${selectedStreamFrame.frame_width} × ${selectedStreamFrame.frame_height}`
    : 'Waiting for frame';
  const markedPresent = Number(currentInfo?.official_marked_present ?? 0);
  const risk = Number(currentInfo?.fraud_risk_score || 0);
  const attendanceRisk = Number(currentInfo?.attendance_risk_score ?? 0);
  const infraRisk = Number(currentInfo?.infra_risk_score ?? 0);
  const calculatedFrameAge = streamReceivedAt && clockTimeMs
    ? (clockTimeMs - Date.parse(streamReceivedAt)) / 1000
    : null;
  const frameAgeSeconds = Number.isFinite(calculatedFrameAge) && calculatedFrameAge >= 0
    ? Math.floor(calculatedFrameAge)
    : null;
  const headcount = frameAgeSeconds !== null && frameAgeSeconds <= 10
    ? streamHeadcountsByCentre[selectedMonitorCentre] ?? null
    : null;
  const isAnomaly =
    headcount === 0 &&
    markedPresent > 0 &&
    Boolean(currentInfo?.attendance_gap_active);
  const streamStatus = frameAgeSeconds === null
    ? streamConnection
    : frameAgeSeconds > 10
      ? 'STALE · NO RECENT CAMERA FRAMES'
      : 'LIVE';

  const selectMonitorCentre = centreId => {
    setSelectedMonitorCentre(centreId);
    setStreamConnection(centreId ? 'CONNECTING' : 'SELECT A CENTRE');
  };

  const handleUpdateHeadcount = async (newCount) => {
    if (!selectedMonitorCentre) return;
    setIsUpdating(true);
    try {
      await axios.post(`${API_BASE}/attendance/log`, {
        centre_id: selectedMonitorCentre,
        live_headcount: Math.max(0, newCount),
        timestamp: new Date().toISOString()
      });
      setStreamHeadcountsByCentre(current => ({
        ...current,
        [selectedMonitorCentre]: Math.max(0, newCount)
      }));
      if (fetchStats) await fetchStats();
    } catch (e) {
      console.error('Failed to log attendance update:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>

      <PageIntro
        title="Live Stream Monitoring"
        description="Centre-wide person counts from the configured Dev1 camera. Course and roster identity verification are not connected."
        badge="LIVE CCTV"
      />

      {/* ================================================= */}
      {/* CCTV LIVE SURVEILLANCE VIEWPORT */}
      {/* ================================================= */}
      <div style={{ ...styles.tableCard, marginBottom: '22px', padding: '0', overflow: 'hidden' }}>

        {/* Console Header Bar */}
        <div style={{
          padding: '14px 18px',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid #1e293b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: streamStatus === 'LIVE' ? '#dc2626' : '#b45309',
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.5px'
            }}>
              <Radio size={12} className={streamStatus === 'LIVE' ? 'animate-pulse' : ''} />
              {streamStatus}
            </div>

            <select
              value={selectedMonitorCentre}
              onChange={e => selectMonitorCentre(e.target.value)}
              style={{
                background: '#1e293b',
                color: '#ffffff',
                border: '1px solid #334155',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              <option value="" disabled>Select a centre CCTV feed…</option>
              {allCentres.map(([id, info]) => (
                <option key={id} value={id}>
                  {info?.name || id} ({id})
                </option>
              ))}
            </select>

          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#94a3b8' }}>
            <span>Source: <strong style={{ color: '#ffffff' }}>{selectedStreamFrame?.camera_label || 'Dev1 configured camera'}</strong></span>
            <span>Frame resolution: <strong style={{ color: '#ffffff' }}>{frameResolution}</strong></span>
            <span>Count: <strong style={{ color: '#4ade80' }}>{headcount ?? '—'}</strong></span>
          </div>
        </div>

        {/* Viewport Screen */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '420px',
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #090d16 100%)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b'
        }}>

          {/* Subtle Grid / Scanlines Effect */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            pointerEvents: 'none'
          }} />

          {/* Perspective Classroom Floor Outline */}
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: '10%',
            right: '10%',
            height: '180px',
            borderTop: '1px dashed rgba(56, 189, 248, 0.15)',
            transform: 'perspective(400px) rotateX(25deg)',
            pointerEvents: 'none'
          }} />

          {streamFrame ? (
            <img
              src={`data:image/jpeg;base64,${streamFrame}`}
              alt={`Live AI feed for ${selectedMonitorCentre}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                zIndex: 1
              }}
            />
          ) : (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: '#94a3b8',
              fontSize: '14px'
            }}>
              {selectedMonitorCentre
                ? `Waiting for the ${selectedMonitorCentre} attendance stream…`
                : 'Select a centre above to view its CCTV attendance feed.'}
            </div>
          )}

          {/* Top HUD Overlay */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            padding: '14px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div>
              <span style={{
                color: streamStatus === 'LIVE' ? '#ef4444' : '#94a3b8',
                fontWeight: 'bold'
              }}>
                ● {streamStatus === 'LIVE' ? 'REC' : streamStatus}
              </span>
              {streamTime} | {frameResolution}
            </div>
            <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
              CENTRE: <span style={{ color: '#38bdf8' }}>{selectedMonitorCentre || 'Not selected'}</span>
              {streamReceivedAt && (
                <span style={{ marginLeft: '10px' }}>
                  FRAME AGE: {frameAgeSeconds}s
                </span>
              )}
            </div>
          </div>

          {/* Live-feed alert overlay */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
            {/* Zero Headcount Anomaly Banner */}
            {isAnomaly && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(220, 38, 38, 0.92)',
                color: '#ffffff',
                padding: '20px 32px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                border: '1px solid #f87171'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <AlertTriangle size={24} />
                  <strong style={{ fontSize: '16px' }}>ZERO HEADCOUNT DETECTED</strong>
                </div>
                <p style={{ margin: '0', fontSize: '13px', opacity: 0.95 }}>
                  Officially marked present: <strong>{markedPresent} learners</strong>
                </p>
                <div style={{ marginTop: '8px', fontSize: '11px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                  High-risk discrepancy flagged for official verification
                </div>
              </div>
            )}
          </div>

          {/* Bottom HUD Metrics Strip */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            padding: '12px 18px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#ffffff',
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <span>Marked Present: <strong>{markedPresent}</strong></span>
              <span>AI Camera Count: <strong style={{ color: headcount === null ? '#94a3b8' : headcount > 0 ? '#4ade80' : '#f87171' }}>{headcount ?? '—'}</strong></span>
              <span>Missing / Discrepancy Gap: <strong style={{ color: headcount !== null && (markedPresent - headcount) > 5 ? '#f87171' : '#f59e0b' }}>{headcount === null ? '—' : Math.max(0, markedPresent - headcount)}</strong></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                <span>Attendance: <strong style={{ color: attendanceRisk > 30 ? '#f87171' : '#4ade80' }}>{attendanceRisk} pts</strong></span>
                <span>•</span>
                <span>Infra Deficit: <strong style={{ color: infraRisk > 15 ? '#f87171' : '#38bdf8' }}>{infraRisk} pts</strong></span>
              </div>
              <span style={{
                background: risk >= 50 ? '#dc2626' : risk >= 25 ? '#d97706' : '#16a34a',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: '700',
                fontSize: '11px'
              }}>
                TOTAL RISK: {risk} / 100 ({currentInfo?.status || 'SAFE'})
              </span>
            </div>
          </div>

        </div>

        {/* Live Simulation & Test Controls Bar */}
        <div style={{
          padding: '12px 18px',
          background: '#f8fafc',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
              Manual Test Telemetry (not a camera feed):
            </span>
            <button
              disabled={isUpdating || !canSubmitAttendance || !selectedMonitorCentre || headcount === null}
              style={{ ...styles.smallActionButton, background: '#eff6ff', color: '#1e40af' }}
              onClick={() => handleUpdateHeadcount(headcount + 1)}
            >
              +1 Student Enter
            </button>
            <button
              disabled={isUpdating || !canSubmitAttendance || !selectedMonitorCentre || headcount === null}
              style={{ ...styles.smallActionButton, background: '#eff6ff', color: '#1e40af' }}
              onClick={() => handleUpdateHeadcount(headcount - 1)}
            >
              -1 Student Exit
            </button>
            <button
              disabled={isUpdating || !canSubmitAttendance || !selectedMonitorCentre}
              style={{ ...styles.smallActionButton, background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}
              onClick={() => handleUpdateHeadcount(0)}
            >
              Set 0 Present (Ghost Batch)
            </button>
            <button
              disabled={isUpdating || !canSubmitAttendance || !selectedMonitorCentre}
              style={{ ...styles.smallActionButton, background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}
              onClick={() => handleUpdateHeadcount(markedPresent)}
            >
              Reset to Marked Present ({markedPresent})
            </button>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {isUpdating ? 'Piping update to backend...' : 'Ready for Dev 1 Video Ingestion'}
          </div>
        </div>

      </div>

      {/* ================================================= */}
      {/* CONNECTED HUBS & LIVE LOGS */}
      {/* ================================================= */}
      <div style={styles.monitorTopGrid}>

        <div style={styles.tableCard}>

          <SectionHeader
            title="Connected Monitoring Hubs"
            subtitle="Select a centre to request its attendance feed; status reflects received frames"
          />

          <div
            style={styles.monitorCentreGrid}
          >

            {allCentres.map(
              ([id, info]) => {

                const risk = Number(
                  info?.fraud_risk_score || 0
                );
                const centreFrameAt = streamFramesByCentre[id]?.received_at;
                const centreFrameAge = centreFrameAt && clockTimeMs
                  ? Math.max(0, Math.floor(
                    (clockTimeMs - new Date(centreFrameAt).getTime()) / 1000
                  ))
                  : null;
                const centreFeedStatus = centreFrameAge === null
                  ? 'NO FEED'
                  : centreFrameAge > 15 ? 'STALE' : 'FEED LIVE';

                return (
                  <div
                    key={id}
                    style={{
                      ...styles.monitorCentreCard,
                      cursor: 'pointer',
                      border: id === selectedMonitorCentre ? '2px solid #2563eb' : styles.monitorCentreCard.border
                    }}
                    onClick={() => selectMonitorCentre(id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectMonitorCentre(id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={id === selectedMonitorCentre}
                  >

                    <div
                      style={
                        styles.cameraHeader
                      }
                    >

                      <div
                        style={
                          styles.cameraIcon
                        }
                      >
                        <Video size={18} />
                      </div>

                      <div>

                        <strong>
                          {info?.name || id}
                        </strong>

                        <div
                          style={
                            styles.miniText
                          }
                        >
                          {id}
                        </div>

                      </div>

                      <span
                        style={
                          {
                            ...styles.connectedBadge,
                            color: centreFeedStatus === 'FEED LIVE' ? '#15803d' : '#b45309'
                          }
                        }
                      >
                        <Radio size={10} />
                        {centreFeedStatus}
                      </span>

                    </div>

                    <div
                      style={
                        styles.cameraStats
                      }
                    >

                      <div>
                        <span>
                          PERSONS
                        </span>

                        <strong>
                          {info?.live_headcount ||
                            0}
                        </strong>
                      </div>

                      <div>
                        <span>
                          RISK
                        </span>

                        <strong
                          style={{
                            color:
                              getRiskColor(
                                risk
                              )
                          }}
                        >
                          {risk}
                        </strong>
                        <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>
                          Att: {info?.attendance_risk_score ?? '—'} | Inf: {info?.infra_risk_score ?? '—'}
                        </div>
                      </div>

                    </div>

                    <div
                      style={
                        styles.cameraFooter
                      }
                    >
                      AI Camera
                      <span>
                        Click to view feed
                      </span>
                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>

      </div>

      <div
        style={{
          ...styles.tableCard,
          marginTop: '20px'
        }}
      >

        <SectionHeader
          title="Live Detection Event Stream"
          subtitle="Latest YOLOv8 → Ngrok → SACH telemetry packets"
        />

        <div
          style={styles.tableScroll}
        >

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Time
                </th>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  Detection
                </th>

                <th style={styles.th}>
                  Source
                </th>

                <th style={styles.th}>
                  Status
                </th>

              </tr>
            </thead>

            <tbody>

              {logs
                .slice()
                .reverse()
                .map(
                  (log, index) => (
                    <tr
                      key={index}
                      style={styles.tr}
                      className="table-row"
                    >

                      <td style={styles.td}>
                        {new Date(
                          log.timestamp
                        ).toLocaleTimeString()}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          fontWeight: '700',
                          color: '#1e3a8a'
                        }}
                      >
                        {log.centre_id}
                      </td>

                      <td style={styles.td}>
                        <strong>
                          {log.live_headcount}
                        </strong>{' '}
                        person(s)
                      </td>

                      <td style={styles.td}>
                        <span
                          style={
                            styles.tagLog
                          }
                        >
                          YOLOv8
                        </span>
                      </td>

                      <td style={styles.td}>
                        <span
                          style={
                            styles.tagSafe
                          }
                        >
                          RECEIVED
                        </span>
                      </td>

                    </tr>
                  )
                )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* CENTRES                                                     */
/* ========================================================= */

function CentresPage({
  filteredCentres,
  allCentres,
  centreFilter,
  setCentreFilter,
  searchTerm,
  setSearchTerm,
  getRiskStyle,
  getRiskColor
}) {
  return (
    <div>

      <PageIntro
        title="Training Centres Directory"
        description="National centre directory. Attendance risk compares AI camera counts only with learners officially marked present; enrolled absentees are excluded."
      />

      <div style={styles.filterBar}>

        <div
          style={styles.searchBox}
        >
          <Search size={15} />

          <input
            className="directory-search-input"
            value={searchTerm}
            onChange={e =>
              setSearchTerm(
                e.target.value
              )
            }
            placeholder="Search centre..."
            style={styles.searchInput}
          />
        </div>

        <div
          style={styles.selectWrapper}
        >
          <Filter size={14} />

          <select
            value={centreFilter}
            onChange={e =>
              setCentreFilter(
                e.target.value
              )
            }
            style={styles.select}
          >

            <option value="ALL">
              All Centres
            </option>

            {allCentres.map(
              ([id, info]) => (
                <option
                  key={id}
                  value={id}
                >
                  {id}
                </option>
              )
            )}

          </select>

        </div>

      </div>

      <div style={styles.tableCard}>

        <SectionHeader
          title="Centre Registry"
          subtitle={`${filteredCentres.length} centres displayed`}
        />

        <div
          style={styles.tableScroll}
        >

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  ID
                </th>

                <th style={styles.th}>
                  Official Marked Present
                </th>

                <th style={styles.th}>
                  AI Camera Count
                </th>

                <th style={styles.th}>
                  Missing / Discrepancy Gap
                </th>

                <th style={styles.th}>
                  Infrastructure
                </th>

                <th style={styles.th}>
                  Risk
                </th>

                <th style={styles.th}>
                  Status
                </th>

              </tr>
            </thead>

            <tbody>

              {filteredCentres.map(
                ([id, info]) => {

                  const risk =
                    Number(
                      info?.fraud_risk_score ||
                        0
                    );

                  return (
                    <tr
                      key={id}
                      style={styles.tr}
                      className="table-row"
                    >

                      <td style={styles.td}>
                        <strong>
                          {info?.name ||
                            id}
                        </strong>
                      </td>

                      <td style={styles.td}>
                        {id}
                      </td>

                      <td style={styles.td}>
                        {info?.official_marked_present ?? 0}
                      </td>

                      <td style={styles.td}>
                        {info?.live_headcount ||
                          0}
                      </td>

                      <td style={styles.td}>
                        {Math.max(
                          0,
                          Number(info?.official_marked_present ?? 0) -
                            Number(info?.live_headcount || 0)
                        )}
                      </td>

                      <td style={styles.td}>
                        {info?.compliance_percentage ??
                          0}
                        %
                      </td>

                      <td style={styles.td}>

                        <strong
                          style={{
                            color:
                              getRiskColor(
                                risk
                              )
                          }}
                        >
                          {risk}
                        </strong>

                        <span
                          style={
                            styles.scoreSuffix
                          }
                        >
                          /100
                        </span>

                      </td>

                      <td style={styles.td}>

                        <span
                          style={getRiskStyle(
                            risk
                          )}
                        >
                          {getRiskLevel(
                            risk
                          )}
                        </span>

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* ATTENDANCE                                                  */
/* ========================================================= */

function AttendancePage({
  allCentres,
  getRiskStyle,
  stats
}) {
  const [liveAttendance, setLiveAttendance] = useState({});
  const [liveNow, setLiveNow] = useState(0);
  const liveAttendanceRef = useRef({});
  const lastUiUpdateByCentre = useRef({});
  const centreIds = allCentres.map(([id]) => id).join('|');
  const logs =
    stats?.recent_attendance_logs || [];

  useEffect(() => {
    const timer = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!centreIds) return undefined;

    const wsBase = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
    const sockets = centreIds.split('|').map(centreId => {
      const socket = openAuthenticatedWebSocket(
        `${wsBase}/ws/live_feed/${encodeURIComponent(centreId)}/attendance`
      );
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'authenticated') return;
          if (!Number.isInteger(message.live_headcount) || message.live_headcount < 0) {
            return;
          }
          const receivedAt = message.received_at || new Date().toISOString();
          const now = Date.now();
          const previous = liveAttendanceRef.current[centreId];
          if (
            previous?.count !== message.live_headcount ||
            now - (lastUiUpdateByCentre.current[centreId] || 0) >= 1000
          ) {
            lastUiUpdateByCentre.current[centreId] = now;
            liveAttendanceRef.current[centreId] = {
              count: message.live_headcount,
              receivedAt
            };
            setLiveAttendance(current => ({
              ...current,
              [centreId]: {
                count: message.live_headcount,
                receivedAt
              }
            }));
          }
        } catch (error) {
          console.error(`Invalid attendance feed for ${centreId}:`, error);
        }
      };
      socket.onerror = error => {
        console.error(`Attendance feed connection failed for ${centreId}:`, error);
      };
      return socket;
    });

    return () => sockets.forEach(socket => {
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
    });
  }, [centreIds]);

  const getFreshCount = centreId => {
    const sample = liveAttendance[centreId];
    if (!sample || !liveNow) return null;
    const age = liveNow - Date.parse(sample.receivedAt);
    return age >= 0 && age <= 10000 ? sample.count : null;
  };
  const monitoredCentres = allCentres.filter(([id]) => getFreshCount(id) !== null);
  const totalDetected = monitoredCentres.reduce(
    (total, [id]) => total + getFreshCount(id),
    0
  );
  const totalMarkedPresent = monitoredCentres.reduce(
    (total, [, info]) => total + Number(info?.official_marked_present ?? 0),
    0
  );
  const totalMissing = monitoredCentres.reduce(
    (total, [id, info]) => total + Math.max(
      0,
      Number(info?.official_marked_present ?? 0) - getFreshCount(id)
    ),
    0
  );
  const attendanceRate = totalMarkedPresent
    ? Math.round(totalDetected / totalMarkedPresent * 100)
    : 0;

  return (
    <div>

      <PageIntro
        title="Attendance Intelligence"
        description="Compare AI camera counts with learners officially marked present. Enrolled students marked absent are excluded from this discrepancy."
        badge="AI ENGINE"
      />

      <div
        className="metrics-grid-responsive"
        style={styles.metricsGrid}
      >

        <MetricCard
          icon={<Users size={18} />}
          label="Officially Marked Present"
          value={totalMarkedPresent}
          sub={`Across ${monitoredCentres.length} centres with a fresh camera feed`}
        />

        <MetricCard
          icon={<UserCheck size={18} />}
          label="AI Camera Count"
          value={monitoredCentres.length ? totalDetected : '—'}
          sub="Live WebSocket detections; feeds expire after 10 seconds"
        />

        <MetricCard
          icon={<UserX size={18} />}
          label="Missing / Discrepancy Gap"
          value={monitoredCentres.length ? totalMissing : '—'}
          sub="Marked present minus AI camera count"
          danger={totalMissing > 0}
        />

        <MetricCard
          icon={<Activity size={18} />}
          label="Attendance Coverage"
          value={monitoredCentres.length ? `${attendanceRate}%` : '—'}
          sub="AI camera count vs official marked present"
        />

      </div>

      <div
        style={{
          ...styles.tableCard,
          marginTop: '20px'
        }}
      >

        <SectionHeader
          title="Centre Attendance Comparison"
          subtitle="Counts are read from live camera frames. Centres without a frame in the last 10 seconds show no live feed."
        />

        <div style={styles.tableScroll}>

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  Official Marked Present
                </th>

                <th style={styles.th}>
                  AI Camera Count
                </th>

                <th style={styles.th}>
                  Missing / Discrepancy Gap
                </th>

                <th style={styles.th}>
                  Attendance
                </th>

                <th style={styles.th}>
                  Risk
                </th>

              </tr>
            </thead>

            <tbody>

              {allCentres.map(
                ([id, info]) => {

                  const official = Number(info?.official_marked_present ?? 0);

                  const detected = getFreshCount(id);

                  const difference =
                    detected === null ? null : Math.max(
                      official -
                        detected,
                      0
                    );

                  const percentage =
                    detected !== null && official > 0
                      ? Math.round(
                          (detected /
                            official) *
                            100
                        )
                      : 0;

                  const risk =
                    Number(
                      info?.fraud_risk_score ||
                        0
                    );

                  return (
                    <tr
                      key={id}
                      style={styles.tr}
                      className="table-row"
                    >

                      <td style={styles.td}>

                        <strong>
                          {info?.name ||
                            id}
                        </strong>

                        <div
                          style={
                            styles.miniText
                          }
                        >
                          {id}
                        </div>

                      </td>

                      <td style={styles.td}>
                        {official}
                      </td>

                      <td style={styles.td}>
                        {detected === null ? (
                          <span style={styles.tagWarning}>NO LIVE FEED</span>
                        ) : (
                          <>
                            {detected}
                            <div style={styles.miniText}>
                              Updated {Math.floor(
                                (liveNow - Date.parse(liveAttendance[id].receivedAt)) / 1000
                              )}s ago
                            </div>
                          </>
                        )}
                      </td>

                      <td
                        style={{
                          ...styles.td,
                          fontWeight: '700',
                          color:
                            difference === null
                              ? '#64748b'
                              : difference > 0
                              ? '#b91c1c'
                              : '#15803d'
                        }}
                      >
                        {difference ?? '—'}
                      </td>

                      <td style={styles.td}>

                        <div
                          style={
                            styles.tableProgress
                          }
                        >

                          <div
                            style={{
                              width:
                                `${Math.min(
                                  percentage,
                                  100
                                )}%`,
                              background:
                                percentage >=
                                80
                                  ? '#15803d'
                                  : percentage >=
                                    50
                                  ? '#d97706'
                                  : '#dc2626',
                              height:
                                '100%'
                            }}
                          />

                        </div>

                        <span
                          style={
                            styles.miniText
                          }
                        >
                          {detected === null ? 'No feed' : `${percentage}%`}
                        </span>

                      </td>

                      <td style={styles.td}>

                        <span
                          style={getRiskStyle(
                            risk
                          )}
                        >
                          {getRiskLevel(
                            risk
                          )}
                        </span>

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </div>

      <div
        style={{
          ...styles.tableCard,
          marginTop: '20px'
        }}
      >

        <SectionHeader
          title="Latest Attendance Telemetry"
          subtitle="Most recent AI headcount packets"
        />

        <div style={styles.tableScroll}>

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Timestamp
                </th>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  Detected
                </th>

                <th style={styles.th}>
                  Pipeline
                </th>

              </tr>
            </thead>

            <tbody>

              {logs
                .slice()
                .reverse()
                .map(
                  (log, index) => (
                    <tr
                      key={index}
                      style={styles.tr}
                    >

                      <td style={styles.td}>
                        {new Date(
                          log.timestamp
                        ).toLocaleString()}
                      </td>

                      <td style={styles.td}>
                        {log.centre_id}
                      </td>

                      <td style={styles.td}>
                        <strong>
                          {log.live_headcount}
                        </strong>{' '}
                        persons
                      </td>

                      <td style={styles.td}>

                        <span
                          style={
                            styles.tagLog
                          }
                        >
                          YOLOv8 → Ngrok
                        </span>

                      </td>

                    </tr>
                  )
                )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* INFRASTRUCTURE                                              */
/* ========================================================= */

function InfrastructurePage({
  allCentres,
  stats,
  onRefresh,
  role
}) {
  const canScan = role === 'ADMIN' || role === 'AUDITOR';
  const canConfigure = role === 'ADMIN';
  const canViewEvidence = role === 'ADMIN' || role === 'AUDITOR';
  const [selectedCentre, setSelectedCentre] = useSharedCentre(
    allCentres[0]?.[0] || ''
  );
  const [liveInfraAudit, setLiveInfraAudit] = useState(null);
  const [infraFrameData, setInfraFrameData] = useState('');
  const [attendanceSource, setAttendanceSource] = useState(null);
  const [attendanceSourceStatus, setAttendanceSourceStatus] = useState('CONNECTING');
  const [infraConnection, setInfraConnection] = useState('CONNECTING');
  const [infraNow, setInfraNow] = useState(0);

  const selectedInfo =
    allCentres.find(
      ([id]) =>
        id === selectedCentre
    )?.[1];

  const storedCompliance = Number(
    selectedInfo?.compliance_percentage ||
      0
  );

  const [scanOpen, setScanOpen] = useState(false);
  const [equipmentClasses, setEquipmentClasses] = useState([]);
  const [savedEquipmentClasses, setSavedEquipmentClasses] = useState([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [evidenceImages, setEvidenceImages] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const [evidenceReview, setEvidenceReview] = useState(null);
  const [showArchivedAudits, setShowArchivedAudits] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const auditLogs = stats?.recent_audit_logs || [];
  const visibleAuditLogs = auditLogs
    .filter(log => showArchivedAudits ? Boolean(log.archived_at) : !log.archived_at)
    .slice()
    .reverse();
  const selectedLiveInfraAudit = liveInfraAudit?.centreId === selectedCentre
    ? liveInfraAudit
    : null;
  const infraAgeSeconds = selectedLiveInfraAudit && infraNow
    ? Math.floor((infraNow - Date.parse(selectedLiveInfraAudit.receivedAt)) / 1000)
    : null;
  const infraAgeLabelSeconds = infraAgeSeconds === null
    ? null
    : Math.max(0, infraAgeSeconds);
  const liveInfraFresh = infraAgeSeconds !== null
    && infraAgeSeconds >= -5
    && infraAgeSeconds <= 10;
  const attendanceSourceAgeSeconds = attendanceSource && infraNow
    ? Math.floor((infraNow - Date.parse(attendanceSource.receivedAt)) / 1000)
    : null;
  const attendanceSourceAgeLabelSeconds = attendanceSourceAgeSeconds === null
    ? null
    : Math.max(0, attendanceSourceAgeSeconds);
  const attendanceSourceFresh = attendanceSourceAgeSeconds !== null
    && attendanceSourceAgeSeconds >= -5
    && attendanceSourceAgeSeconds <= 10;
  const compliance = liveInfraFresh
    ? Number(selectedLiveInfraAudit.compliance)
    : storedCompliance;

  useEffect(() => {
    const timer = setInterval(() => setInfraNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedCentre) return undefined;
    const wsBase = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
    const socket = openAuthenticatedWebSocket(
      `${wsBase}/ws/live_feed/${encodeURIComponent(selectedCentre)}/infra`
    );
    setInfraFrameData('');
    setLiveInfraAudit(null);
    socket.onopen = () => setInfraConnection('WAITING FOR DEV2');
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'authenticated') return;
        const sourceMatchesCentre = message.source_stream === 'attendance'
          && message.source_centre_id === selectedCentre
          && message.centre_id === selectedCentre
          && typeof message.camera_id === 'string'
          && message.camera_id.length > 0;
        if (
          typeof message.frame === 'string'
          && message.frame.length > 0
          && sourceMatchesCentre
        ) setInfraFrameData(message.frame);
        if (
          !Number.isInteger(message.detected_computers)
          || typeof message.status !== 'string'
          || typeof message.received_at !== 'string'
        ) {
          return;
        }
        setLiveInfraAudit({
          centreId: selectedCentre,
          detected: message.detected_computers,
          required: message.required_computers,
          compliance: message.compliance_percentage,
          status: message.status,
          cameraId: message.camera_id,
          sourceMatchesCentre,
          receivedAt: message.received_at
        });
        setInfraConnection(
          sourceMatchesCentre && typeof message.frame === 'string'
            ? 'LIVE · SAME ATTENDANCE SOURCE'
            : 'SOURCE MISMATCH'
        );
      } catch (error) {
        console.error('Invalid Dev2 infrastructure stream message:', error);
      }
    };
    socket.onerror = error => {
      setInfraConnection('CONNECTION ERROR');
      console.error('Dev2 infrastructure stream error:', error);
    };
    socket.onclose = () => setInfraConnection('DISCONNECTED');

    return () => {
      socket.onmessage = null;
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, [selectedCentre]);

  useEffect(() => {
    if (!selectedCentre) return undefined;
    const wsBase = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
    const socket = openAuthenticatedWebSocket(
      `${wsBase}/ws/live_feed/${encodeURIComponent(selectedCentre)}/attendance`
    );
    setAttendanceSource(null);
    setAttendanceSourceStatus('CONNECTING');
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'authenticated') {
          setAttendanceSourceStatus('CONNECTED · WAITING FOR FRAME');
          return;
        }
        if (
          message.centre_id !== selectedCentre
          || message.stream_type !== 'attendance'
          || typeof message.frame !== 'string'
          || !message.frame
          || typeof message.received_at !== 'string'
        ) {
          return;
        }
        const cameraId = typeof message.camera_id === 'string' && message.camera_id.trim()
          ? message.camera_id
          : `${selectedCentre}:camera-id-unreported`;
        setAttendanceSource({
          frame: message.frame,
          cameraId,
          receivedAt: message.received_at
        });
        setAttendanceSourceStatus('LIVE');
      } catch (error) {
        console.error('Invalid Dev1 attendance source frame:', error);
      }
    };
    socket.onerror = error => {
      setAttendanceSourceStatus('CONNECTION ERROR');
      console.error('Dev1 attendance source stream error:', error);
    };
    socket.onclose = () => setAttendanceSourceStatus('DISCONNECTED');

    return () => {
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, [selectedCentre]);

  const setAuditArchived = async (auditId, archived) => {
    setArchiveError('');
    try {
      await axios.post(`${API_BASE}/audits/${auditId}/${archived ? 'archive' : 'restore'}`);
      if (onRefresh) await onRefresh();
    } catch (error) {
      setArchiveError(getApiErrorMessage(error, 'The scan record could not be updated.'));
    }
  };

  useEffect(() => {
    if (!scanOpen || !selectedCentre) return undefined;

    let isCurrentRequest = true;

    axios.get(`${API_BASE}/centres/${encodeURIComponent(selectedCentre)}/equipment-config`)
      .then(({ data }) => {
        if (isCurrentRequest) {
          const classes = data.equipment_config?.classes || [];
          setEquipmentClasses(classes);
          setSavedEquipmentClasses(classes);
        }
      })
      .catch(error => {
        if (isCurrentRequest) {
          setConfigError(getApiErrorMessage(
            error,
            'Could not load this centre’s equipment requirements.'
          ));
        }
      })
      .finally(() => {
        if (isCurrentRequest) setConfigLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [scanOpen, selectedCentre]);

  useEffect(() => {
    if (!scanOpen || !cameraStream || !videoRef.current) return undefined;

    const video = videoRef.current;
    video.srcObject = cameraStream;
    video.play().catch(error => {
      setCameraError(error.message || 'The camera preview could not be started.');
    });

    return () => {
      video.srcObject = null;
    };
  }, [scanOpen, cameraStream]);

  useEffect(() => () => {
    cameraStream?.getTracks().forEach(track => track.stop());
  }, [cameraStream]);

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser. Use the image-upload option instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      setCameraStream(stream);
    } catch (error) {
      setCameraError(error.message || 'Camera access was denied or no camera is available. You can upload an image instead.');
    }
  };

  const stopCamera = () => setCameraStream(null);

  const captureEvidence = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError('Wait for the camera preview to become ready, then capture again.');
      return;
    }

    const scale = Math.min(
      1,
      1600 / video.videoWidth,
      1200 / video.videoHeight
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('This browser could not prepare the captured image.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setEvidenceImages(current => [...current, canvas.toDataURL('image/jpeg', 0.75)]);
    setCameraError('');
    setScanError('');
    setScanResults(null);
    if (evidenceImages.length + 1 >= 4) setCameraStream(null);
  };

  const handleEvidenceUpload = event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    if (evidenceImages.length + files.length < 4 || evidenceImages.length + files.length > 6) {
      setCameraError('Provide enough images to reach 4 views, with no more than 6 total.');
      return;
    }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setCameraError('Choose JPEG, PNG, or WebP images.');
      return;
    }
    if (files.some(file => file.size > 2 * 1024 * 1024)) {
      setCameraError('Each uploaded evidence image must be 2 MB or smaller.');
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024) {
      setCameraError('Combined uploaded evidence must be 8 MB or smaller.');
      return;
    }

    Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('A selected image could not be read.'));
      };
      reader.onerror = () => reject(new Error('A selected image could not be read.'));
      reader.readAsDataURL(file);
    })))
      .then(images => {
        setEvidenceImages(current => [...current, ...images]);
        if (evidenceImages.length + images.length >= 4) setCameraStream(null);
        setCameraError('');
        setScanError('');
        setScanResults(null);
      })
      .catch(error => {
        setCameraError(error.message || 'The selected images could not be read.');
      });
  };

  const saveEquipmentConfig = async () => {
    setConfigSaving(true);
    setConfigError('');
    setConfigMessage('');
    try {
      const { data } = await axios.put(
        `${API_BASE}/centres/${encodeURIComponent(selectedCentre)}/equipment-config`,
        { classes: equipmentClasses }
      );
      setEquipmentClasses(data.equipment_config.classes);
      setSavedEquipmentClasses(data.equipment_config.classes);
      setConfigMessage('Government equipment requirements saved for this centre.');
      if (onRefresh) await onRefresh();
    } catch (error) {
      setConfigError(getApiErrorMessage(
        error,
        'Could not save this centre’s equipment requirements.'
      ));
    } finally {
      setConfigSaving(false);
    }
  };

  const updateEquipmentClass = (index, field, value) => {
    setEquipmentClasses(current => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [field]: field === 'required' ? Number(value) : value }
        : item
    )));
  };

  const addEquipmentClass = () => {
    let suffix = 1;
    while (equipmentClasses.some(item => item.name === `custom_equipment_${suffix}`)) {
      suffix += 1;
    }
    setEquipmentClasses(current => [
      ...current,
      {
        name: `custom_equipment_${suffix}`,
        label: `Custom equipment ${suffix}`,
        required: 1
      }
    ]);
  };

  const removeEquipmentClass = className => {
    setEquipmentClasses(current => current.filter(item => item.name !== className));
  };

  const submitScan = async () => {
    if (evidenceImages.length < 4 || !selectedCentre) return;

    setScanLoading(true);
    setScanError('');
    try {
      const { data } = await axios.post(
        `${API_BASE}/centres/${encodeURIComponent(selectedCentre)}/scan`,
        {
          centre_id: selectedCentre,
          base64_images: evidenceImages
        }
      );
      setScanResults(data);
      if (onRefresh) await onRefresh();
    } catch (error) {
      setScanError(getApiErrorMessage(
        error,
        'The infrastructure scan could not be submitted.'
      ));
    } finally {
      setScanLoading(false);
    }
  };

  const closeScan = () => {
    setCameraStream(null);
    setScanOpen(false);
  };

  const openScan = () => {
    setConfigLoading(true);
    setConfigError('');
    setConfigMessage('');
    setScanError('');
    setScanResults(null);
    setEvidenceImages([]);
    setCameraError('');
    setScanOpen(true);
  };

  const viewAuditEvidence = async auditId => {
    setEvidenceReview({
      auditId,
      images: [],
      annotatedImages: [],
      results: null,
      loading: true,
      error: ''
    });
    try {
      const { data } = await axios.get(`${API_BASE}/audits/${auditId}/evidence`);
      setEvidenceReview({
        auditId,
        images: data.images || [],
        annotatedImages: data.annotated_images || [],
        results: data.results || null,
        loading: false,
        error: ''
      });
    } catch (error) {
      setEvidenceReview({
        auditId,
        images: [],
        annotatedImages: [],
        results: null,
        loading: false,
        error: getApiErrorMessage(error, 'Could not load audit evidence.')
      });
    }
  };

  const configDirty =
    JSON.stringify(equipmentClasses) !== JSON.stringify(savedEquipmentClasses);

  return (
    <div>

      <PageIntro
        title="Infrastructure Audit"
        description="Analyze captured room evidence with Dev2's trained equipment detector. Each scan stores the source images, annotated detections, confidence scores, and model metadata."
        badge="DEV2 YOLO"
      />

      <div style={styles.filterBar}>

        <div
          style={styles.selectWrapper}
        >
          <Building2 size={14} />

          <select
            value={selectedCentre}
            disabled={scanOpen}
            onChange={e => {
              setLiveInfraAudit(null);
              setInfraFrameData('');
              setInfraConnection('CONNECTING');
              setSelectedCentre(e.target.value);
            }}
            style={styles.select}
          >

            {allCentres.map(
              ([id, info]) => (
                <option
                  key={id}
                  value={id}
                >
                  {info?.name || id}
                </option>
              )
            )}

          </select>

        </div>

        <button
          style={styles.primaryButton}
          disabled={!selectedCentre || !canScan}
          onClick={openScan}
        >
          <ScanLine size={14} />
          {canScan ? 'Start New Scan' : 'Scan access restricted'}
        </button>

      </div>

      <div
        className="metrics-grid-responsive"
        style={styles.metricsGrid}
      >

        <MetricCard
          icon={<HardDrive size={18} />}
          label="Compliance Score"
          value={liveInfraFresh ? `${compliance}%` : `${storedCompliance}%`}
          sub={liveInfraFresh
            ? `Live Dev2 result · updated ${infraAgeLabelSeconds}s ago`
            : 'Last saved result; awaiting a fresh Dev2 camera frame'}
          danger={compliance < 70}
        />


        <MetricCard
          icon={<Cpu size={18} />}
          label="Live Dev2 status"
          value={liveInfraFresh
            ? liveInfraAudit.status
            : infraConnection.startsWith('LIVE') ? 'STALE' : infraConnection}
          sub={liveInfraFresh
            ? `${liveInfraAudit.detected}/${liveInfraAudit.required} computers · ${liveInfraAudit.compliance}% · updated ${infraAgeLabelSeconds}s ago`
            : 'Waiting for fresh Dev2 camera detections (10s timeout)'}
          danger={liveInfraFresh && liveInfraAudit.status !== 'COMPLIANT'}
        />

        <MetricCard
          icon={<Database size={18} />}
          label="Audit Records"
          value={auditLogs.length}
          sub="Recent scan submissions"
        />

      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1.2fr) minmax(300px, 0.8fr)',
          gap: '20px',
          marginTop: '20px'
        }}
        className="infra-grid"
      >

        <div style={styles.tableCard}>

          <SectionHeader
            title="Dev2 Visual Proof · Shared Centre Camera"
            subtitle={`Equipment detections are run on Dev1 attendance frames for ${selectedCentre}`}
          />

          <div style={{
            ...styles.scanPlaceholder,
            position: 'relative',
            minHeight: '300px',
            padding: 0,
            overflow: 'hidden',
            background: '#0f172a',
            color: '#e2e8f0'
          }}>
            {infraFrameData && selectedLiveInfraAudit?.sourceMatchesCentre ? (
              <img
                src={`data:image/jpeg;base64,${infraFrameData}`}
                alt={`Live Dev2 infrastructure detections for ${selectedCentre}`}
                style={{
                  width: '100%',
                  height: '300px',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            ) : attendanceSourceFresh ? (
              <img
                src={`data:image/jpeg;base64,${attendanceSource.frame}`}
                alt={`Live Dev1 attendance camera input for ${selectedCentre}`}
                style={{
                  width: '100%',
                  height: '300px',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            ) : (
              <div style={{ padding: '24px' }}>
                <div style={styles.scanPlaceholderIcon}>
                  <ScanLine size={30} />
                </div>
                <strong>Waiting for the shared camera feed</strong>
                <p>
                  Dev1's live camera input appears here first. Dev2 adds equipment detections to these same frames when its producer is running.
                </p>
              </div>
            )}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '8px 12px',
              background: 'rgba(15, 23, 42, 0.88)',
              color: '#fff',
              fontSize: '12px',
              textAlign: 'left'
            }}>
              {infraFrameData && selectedLiveInfraAudit?.sourceMatchesCentre
                ? `DEV2 ${liveInfraFresh ? 'LIVE · SHARED CAMERA' : 'STALE'}`
                : attendanceSourceFresh
                  ? `DEV1 SOURCE PREVIEW · DEV2 ${infraConnection} · ${attendanceSource.cameraId} · ${attendanceSourceAgeLabelSeconds}s ago`
                    : `DEV1 ${attendanceSourceFresh ? attendanceSourceStatus : attendanceSource ? 'STALE' : attendanceSourceStatus} · DEV2 ${infraConnection}`}
              {infraFrameData && liveInfraAudit && ` · ${liveInfraAudit.detected}/${liveInfraAudit.required} computers`}
              {infraFrameData && liveInfraAudit?.cameraId && ` · ${liveInfraAudit.cameraId}`}
              {infraFrameData && infraAgeLabelSeconds !== null && ` · ${infraAgeLabelSeconds}s ago`}
            </div>
          </div>

        </div>

        <div style={styles.tableCard}>

          <SectionHeader
            title="Compliance Assessment"
            subtitle={
              selectedInfo?.name ||
              selectedCentre
            }
          />

          <div
            style={
              styles.complianceCircleWrapper
            }
          >

            <div
              style={{
                ...styles.complianceCircle,
                borderColor:
                  compliance >= 80
                    ? '#16a34a'
                    : compliance >= 60
                    ? '#d97706'
                    : '#dc2626'
              }}
            >

              <strong style={styles.complianceText}>
                {compliance}%
              </strong>

              <span style={styles.complianceLabel}>
                COMPLIANCE
              </span>

            </div>

          </div>

          <div
            style={
              styles.complianceLegend
            }
          >

            <div>
              <span
                style={{
                  ...styles.legendDot,
                  background:
                    '#16a34a'
                }}
              />

              Meets threshold
            </div>

            <div>
              <span
                style={{
                  ...styles.legendDot,
                  background:
                    '#d97706'
                }}
              />

              Requires review
            </div>

            <div>
              <span
                style={{
                  ...styles.legendDot,
                  background:
                    '#dc2626'
                }}
              />

              Significant deficit
            </div>

          </div>

        </div>

      </div>

      <div
        style={{
          ...styles.tableCard,
          marginTop: '20px'
        }}
      >

        <SectionHeader
          title="Infrastructure Scan Records"
          subtitle="Recent equipment audit records; archive to hide while preserving evidence."
        />

        {canConfigure && (
          <div className="audit-archive-toolbar">
            <span>Archiving preserves the audit and its evidence.</span>
            <button
              type="button"
              style={styles.smallActionButton}
              aria-pressed={showArchivedAudits}
              onClick={() => setShowArchivedAudits(value => !value)}
            >
              {showArchivedAudits ? 'Show active scans' : 'Show archived scans'}
            </button>
          </div>
        )}
        {archiveError && <p className="operator-error audit-action-error" role="alert">{archiveError}</p>}

        <div style={styles.tableScroll}>

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Timestamp
                </th>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  Computer count
                </th>

                <th style={styles.th}>
                  Required
                </th>

                <th style={styles.th}>
                  Compliance
                </th>

                <th style={styles.th}>
                  Status
                </th>

                <th style={styles.th}>
                  Analysis source
                </th>

                <th style={styles.th}>
                  Evidence
                </th>
                {canConfigure && <th style={styles.th}>Record action</th>}

              </tr>
            </thead>

            <tbody>

              {visibleAuditLogs.length === 0 && (
                <tr>
                  <td colSpan={canConfigure ? 9 : 8} style={styles.td}>
                    {showArchivedAudits ? 'No archived scan records.' : 'No active scan records.'}
                  </td>
                </tr>
              )}
              {visibleAuditLogs
                .map(
                  (log, index) => (
                    <tr
                      key={log.id ?? index}
                      style={styles.tr}
                    >

                      <td style={styles.td}>
                        {new Date(
                          log.timestamp ||
                            Date.now()
                        ).toLocaleString()}
                      </td>

                      <td style={styles.td}>
                        {log.centre_id ||
                          '—'}
                      </td>

                      <td style={styles.td}>
                        {log.detected_computers ??
                          '—'}
                      </td>

                      <td style={styles.td}>
                        {log.required_computers ??
                          '—'}
                      </td>

                      <td style={styles.td}>
                        {log.compliance_percentage ??
                          0}
                        %
                      </td>

                      <td style={styles.td}>

                        <span
                          style={
                            log.detection_source === 'SIMULATED'
                              ? styles.tagWarning
                              : ['COMPLIANT', 'PASS'].includes(log.status)
                                ? styles.tagSafe
                                : styles.tagWarning
                          }
                        >
                          {log.detection_source === 'SIMULATED'
                            ? `LEGACY SIMULATED · ${log.status || 'REVIEW'}`
                            : log.status || 'REVIEW'}
                        </span>

                      </td>

                      <td style={styles.td}>
                        <span style={log.detection_source === 'SIMULATED' ? styles.tagWarning : styles.tagSafe}>
                          {log.detection_source === 'SIMULATED'
                            ? 'LEGACY SIMULATED'
                            : log.detection_source || 'UNKNOWN'}
                        </span>
                      </td>

                      <td style={styles.td}>
                        {log.evidence_available && canViewEvidence ? (
                          <button
                            type="button"
                            style={styles.smallActionButton}
                            onClick={() => viewAuditEvidence(log.id)}
                          >
                            <Eye size={12} />
                            View
                          </button>
                        ) : '—'}
                      </td>

                      {canConfigure && (
                        <td style={styles.td}>
                          <button
                            type="button"
                            style={styles.smallActionButton}
                            onClick={() => setAuditArchived(log.id, !log.archived_at)}
                          >
                            {log.archived_at ? 'Restore' : 'Archive'}
                          </button>
                        </td>
                      )}

                    </tr>
                  )
                )}

            </tbody>

          </table>

        </div>

      </div>

      {scanOpen && (
        <div
          style={styles.modalOverlay}
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !scanLoading && !configSaving) {
              closeScan();
            }
          }}
        >
          <section
            style={styles.modalContainer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="infrastructure-scan-title"
          >
            <header style={styles.modalHeader}>
              <div>
                <h2 id="infrastructure-scan-title" style={styles.modalTitle}>
                  Start infrastructure scan
                </h2>
                <div style={styles.miniText}>
                  {selectedInfo?.name || selectedCentre}
                </div>
              </div>
              <button
                type="button"
                style={styles.modalClose}
                aria-label="Close scan workflow"
                disabled={scanLoading || configSaving}
                onClick={closeScan}
              >
                <X size={18} />
              </button>
            </header>

            <div style={styles.modalBody}>
              <div style={styles.infoCard}>
                <div style={styles.infoCardTitle}>Real detector and evidence notice</div>
                <div style={styles.infoCardText}>
                    Dev2's trained model analyzes each submitted view. Original images, annotated detections, confidence scores, and model details are stored with the audit; avoid capturing identifiable learners. Access is recorded under your authenticated user role.
                </div>
              </div>

              <div style={styles.scanStep}>
                <div>
                  <div style={styles.stepHeader}>
                    <span style={styles.stepNumber}>1</span>
                    <div>
                      <div style={styles.stepTitle}>Government equipment requirements</div>
                      <div style={styles.stepSubtitle}>Configure the inventory expected at this centre.</div>
                    </div>
                  </div>

                  {configLoading ? (
                    <p role="status">Loading centre requirements…</p>
                  ) : (
                    <>
                      {configError && (
                        <div style={styles.errorNotice} role="alert">{configError}</div>
                      )}
                      <div style={styles.equipmentClassesGrid}>
                        {equipmentClasses.map((item, index) => (
                          <div key={item.name} style={styles.equipmentClassCard}>
                            <label style={{ ...styles.equipmentConfigLabel, width: '100%' }}>
                              Equipment name
                              <input
                                value={item.label}
                                maxLength={100}
                                disabled={!canConfigure || configSaving || configLoading || scanLoading || item.name === 'computer'}
                                onChange={event => updateEquipmentClass(index, 'label', event.target.value)}
                                style={styles.configInput}
                              />
                            </label>
                            <label style={{ ...styles.equipmentConfigLabel, width: '100%' }}>
                              Required quantity
                              <input
                                type="number"
                                min="0"
                                max="10000"
                                step="1"
                                value={item.required}
                                disabled={!canConfigure || configSaving || configLoading || scanLoading}
                                onChange={event => updateEquipmentClass(index, 'required', event.target.value)}
                                style={styles.configInput}
                              />
                            </label>
                            {item.name !== 'computer' && (
                              <button
                                type="button"
                                style={styles.btnSecondary}
                                disabled={!canConfigure || configSaving || configLoading || scanLoading}
                                onClick={() => removeEquipmentClass(item.name)}
                              >
                                <Trash2 size={13} />
                                Remove class
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {canConfigure && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                          <button
                            type="button"
                            style={styles.btnSecondary}
                            disabled={equipmentClasses.length >= 40 || configSaving || configLoading || scanLoading}
                            onClick={addEquipmentClass}
                          >
                            <Plus size={14} />
                            Add equipment class
                          </button>
                          <button
                            type="button"
                            style={styles.btnPrimary}
                            disabled={configSaving || configLoading || scanLoading || equipmentClasses.length === 0}
                            onClick={saveEquipmentConfig}
                          >
                            <Save size={14} />
                            {configSaving ? 'Saving…' : 'Save centre requirements'}
                          </button>
                        </div>
                      )}
                      {configMessage && (
                        <p style={styles.successNotice} role="status">{configMessage}</p>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <div style={styles.stepHeader}>
                    <span style={styles.stepNumber}>2</span>
                    <div>
                      <div style={styles.stepTitle}>Capture scan evidence</div>
                      <div style={styles.stepSubtitle}>Use the camera or upload a room image.</div>
                    </div>
                  </div>

                  <div style={styles.cameraWrapper}>
                    {cameraStream ? (
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        autoPlay
                        style={{ ...styles.cameraVideo, minHeight: '220px', objectFit: 'cover' }}
                      />
                    ) : evidenceImages.length === 0 ? (
                      <div style={{ ...styles.evidencePreview, minHeight: '220px', display: 'grid', placeItems: 'center', color: '#cbd5e1' }}>
                        Camera preview will appear here.
                      </div>
                    ) : (
                      <div style={{ ...styles.equipmentClassesGrid, padding: '10px' }}>
                        {evidenceImages.map((image, index) => (
                          <div key={`${index}-${image.length}`} style={styles.evidencePreview}>
                            <img
                              src={image}
                              alt={`Infrastructure scan view ${index + 1}`}
                              style={styles.evidenceImg}
                            />
                            <div style={{ padding: '5px', fontSize: '10px', textAlign: 'center' }}>
                              View {index + 1}
                              <button
                                type="button"
                                style={{ ...styles.modalClose, marginLeft: '8px' }}
                                aria-label={`Remove view ${index + 1}`}
                                onClick={() => setEvidenceImages(current => current.filter((_, itemIndex) => itemIndex !== index))}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                  </div>
                  <p style={{ ...styles.miniText, textAlign: 'center', marginTop: '8px' }} role="status">
                    {evidenceImages.length}/4 required views captured (up to 6).
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                    {!cameraStream && evidenceImages.length < 6 && (
                      <button type="button" style={styles.btnSecondary} onClick={startCamera}>
                        <Camera size={14} />
                        {evidenceImages.length ? 'Capture another view' : 'Start camera'}
                      </button>
                    )}
                    {cameraStream && evidenceImages.length < 6 && (
                      <button type="button" style={styles.btnPrimary} onClick={captureEvidence}>
                        <Camera size={14} />
                        Capture view {evidenceImages.length + 1}
                      </button>
                    )}
                    {cameraStream && (
                      <button type="button" style={styles.btnSecondary} onClick={stopCamera}>
                        Stop camera
                      </button>
                    )}
                    <label style={{ ...styles.btnSecondary, cursor: 'pointer' }}>
                      <Upload size={14} />
                      Upload views
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        multiple
                        onChange={handleEvidenceUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {evidenceImages.length > 0 && (
                      <button
                        type="button"
                        style={styles.btnSecondary}
                        onClick={() => {
                          setEvidenceImages([]);
                          setScanResults(null);
                          setScanError('');
                        }}
                      >
                        Retake / choose another
                      </button>
                    )}
                  </div>
                  {cameraError && (
                    <div style={{ ...styles.errorNotice, marginTop: '10px' }} role="alert">
                      {cameraError}
                    </div>
                  )}
                </div>

                {scanError && <div style={styles.errorNotice} role="alert">{scanError}</div>}

                {configDirty && !configError && (
                  <div style={styles.warningStrip} role="status">
                    Save the updated centre requirements before running this scan.
                  </div>
                )}

                {scanResults && (
                  <div>
                    <div style={styles.stepHeader}>
                      <span style={{ ...styles.stepNumber, background: '#15803d' }}>3</span>
                      <div>
                        <div style={styles.stepTitle}>Dev2 YOLO result: {scanResults.status}</div>
                        <div style={styles.stepSubtitle}>
                          {scanResults.compliance_percentage}% supported-class compliance · {scanResults.views_captured} analyzed views · {scanResults.model} · {scanResults.device} · {new Date(scanResults.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {scanResults.unsupported_classes?.length > 0 && (
                      <div style={{ ...styles.warningStrip, marginBottom: '12px' }} role="status">
                        Dev2 does not detect these configured classes: {scanResults.unsupported_classes.join(', ')}. They are excluded from the compliance score; the audit remains in review.
                      </div>
                    )}
                    <div style={styles.tableScroll}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Equipment</th>
                            <th style={styles.th}>Required</th>
                            <th style={styles.th}>Detected</th>
                            <th style={styles.th}>Missing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scanResults.classes.map(item => (
                            <tr key={item.name} style={styles.tr}>
                              <td style={styles.td}>{item.label}</td>
                              <td style={styles.td}>{item.required}</td>
                              <td style={styles.td}>{item.detected ?? 'Not supported'}</td>
                              <td style={styles.td}>{item.missing ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h4 style={{ margin: '16px 0 8px' }}>Annotated detections by view</h4>
                    <div style={styles.evidenceGallery}>
                      {scanResults.annotated_images?.map((image, index) => {
                        const view = scanResults.views?.[index];
                        return (
                          <figure key={`annotated-${index}`} style={{ margin: 0 }}>
                            <img
                              src={image}
                              alt={`Dev2 annotated detection view ${index + 1}`}
                              style={styles.evidenceImg}
                            />
                            <figcaption style={{ ...styles.miniText, marginTop: '6px' }}>
                              View {index + 1}: {(view?.detections || []).map(
                                detection => `${detection.class_name} ${Math.round(detection.confidence * 100)}%`
                              ).join(', ') || 'No supported objects detected'}
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer style={styles.modalFooter}>
              <button
                type="button"
                style={styles.btnSecondary}
                disabled={scanLoading || configSaving}
                onClick={closeScan}
              >
                Close
              </button>
              {!scanResults && (
                <button
                  type="button"
                  style={{
                    ...styles.btnPrimary,
                      ...(
                        evidenceImages.length < 4 ||
                        configLoading ||
                        configError ||
                        configDirty ||
                        scanLoading
                        ? styles.btnDisabled
                        : {})
                    }}
                    disabled={evidenceImages.length < 4 || configLoading || Boolean(configError) || configDirty || scanLoading}
                  onClick={submitScan}
                >
                  <ScanLine size={14} />
                  {scanLoading ? 'Analyzing images with Dev2…' : 'Run Dev2 infrastructure audit'}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {evidenceReview && (
        <div style={styles.modalOverlay} role="presentation">
          <section
            style={{ ...styles.modalContainer, maxWidth: '900px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-evidence-title"
          >
            <header style={styles.modalHeader}>
              <h2 id="audit-evidence-title" style={styles.modalTitle}>
                Audit evidence · #{evidenceReview.auditId}
              </h2>
              <button
                type="button"
                style={styles.modalClose}
                aria-label="Close audit evidence"
                onClick={() => setEvidenceReview(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div style={styles.modalBody}>
              {evidenceReview.loading && <p role="status">Loading stored evidence…</p>}
              {evidenceReview.error && (
                <div style={styles.errorNotice} role="alert">{evidenceReview.error}</div>
              )}
              {!evidenceReview.loading && !evidenceReview.error && (
                <div>
                  <p style={styles.miniText}>
                    Source: {evidenceReview.results?.model
                      ? `Dev2 YOLO · ${evidenceReview.results.model} · ${evidenceReview.results.device}`
                      : 'Legacy or unavailable detector metadata'}
                  </p>
                  <h3>Original evidence</h3>
                  <div style={styles.evidenceGallery}>
                    {evidenceReview.images.map((image, index) => (
                      <figure key={`original-${index}-${image.length}`} style={{ margin: 0 }}>
                        <img
                          src={image}
                          alt={`Stored original scan view ${index + 1}`}
                          style={styles.evidenceImg}
                        />
                        <figcaption style={{ ...styles.miniText, textAlign: 'center' }}>
                          Original view {index + 1}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <h3>Dev2 annotated detections</h3>
                  {evidenceReview.annotatedImages.length ? (
                    <div style={styles.evidenceGallery}>
                      {evidenceReview.annotatedImages.map((image, index) => {
                        const view = evidenceReview.results?.views?.[index];
                        return (
                          <figure key={`annotated-${index}-${image.length}`} style={{ margin: 0 }}>
                            <img
                              src={image}
                              alt={`Dev2 annotated scan view ${index + 1}`}
                              style={styles.evidenceImg}
                            />
                            <figcaption style={{ ...styles.miniText, marginTop: '6px' }}>
                              View {index + 1}
                              {(view?.detections || []).map((detection, detectionIndex) => (
                                <div key={`${detection.class_name}-${detectionIndex}`}>
                                  {detection.class_name} · {Math.round(detection.confidence * 100)}% · box [
                                  {detection.bbox.map(value => Math.round(value)).join(', ')}]
                                </div>
                              ))}
                              {!view?.detections?.length && <div>No supported objects detected</div>}
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={styles.miniText}>This record has no stored model-annotated images.</p>
                  )}
                  {evidenceReview.results?.unsupported_classes?.length > 0 && (
                    <div style={{ ...styles.warningStrip, marginTop: '12px' }}>
                      Not supported by this model: {evidenceReview.results.unsupported_classes.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

    </div>
  );
}


/* ========================================================= */
/* ALERTS                                                      */
/* ========================================================= */

function AlertsPage({
  alerts,
  alertFilter,
  setAlertFilter,
  handleNavClick,
  onAcknowledge,
  onResolve,
  canManageAlerts
}) {
  return (
    <div>

      <PageIntro
        title="Alerts & Incidents"
        description="Prioritized anomalies requiring official review and investigation."
        badge="ACTION QUEUE"
      />

      <div style={styles.filterBar}>

        <div
          style={
            styles.alertSummary
          }
        >

          <AlertTriangle
            size={16}
          />

          <strong>
            {alerts.length}
          </strong>

          active alerts

        </div>

        <div
          style={styles.selectWrapper}
        >

          <Filter size={14} />

          <select
            value={alertFilter}
            onChange={e =>
              setAlertFilter(
                e.target.value
              )
            }
            style={styles.select}
          >

            <option value="ALL">
              All Severities
            </option>

            <option value="CRITICAL">
              Critical
            </option>

            <option value="HIGH">
              High
            </option>

            <option value="MEDIUM">
              Medium
            </option>

          </select>

        </div>

      </div>

      <div style={styles.alertGrid}>

        {alerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={32} />}
            title="No active alerts match this filter"
            description="Resolved alerts are available through the alert history API and are not included in this active queue."
          />
        ) : (
          alerts.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              handleNavClick={handleNavClick}
              onAcknowledge={onAcknowledge}
              onResolve={onResolve}
              canManageAlerts={canManageAlerts}
            />
          ))
        )}

      </div>

      <div
        style={{
          ...styles.infoNotice,
          marginTop: '20px'
        }}
      >

        <ShieldCheck size={17} />

        <div>

          <strong>
            Important: AI alert ≠ confirmed fraud
          </strong>

          <p>
            SACH identifies discrepancies and
            high-risk patterns from available
            monitoring signals. Final compliance
            decisions remain with authorized
            officials and inspectors.
          </p>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* AUDITS                                                      */
/* ========================================================= */

function AuditsPage({
  allCentres,
  generatedAlerts,
  auditCentre,
  setAuditCentre,
  getRiskStyle
}) {
  if (auditCentre) {
    return (
      <AuditDetail
        centreId={auditCentre}
        allCentres={allCentres}
        generatedAlerts={generatedAlerts}
        onBack={() =>
          setAuditCentre(null)
        }
        getRiskStyle={getRiskStyle}
      />
    );
  }

  return (
    <div>

      <PageIntro
        title="Inspector Audit Workflow"
        description="Convert AI-generated risk signals into evidence-based human review."
        badge="GOVERNANCE"
      />

      <div
        className="metrics-grid-responsive"
        style={styles.metricsGrid}
      >

        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="Open Audits"
          value={generatedAlerts.length}
          sub="Generated from active signals"
        />

        <MetricCard
          icon={<Clock3 size={18} />}
          label="Under Review"
          value="—"
          sub="Inspector-assigned cases"
        />

        <MetricCard
          icon={<CheckCircle2 size={18} />}
          label="Resolved"
          value="—"
          sub="Completed investigations"
        />

      </div>

      <div
        style={{
          ...styles.tableCard,
          marginTop: '20px'
        }}
      >

        <SectionHeader
          title="Audit Queue"
          subtitle="Cases requiring inspector attention"
        />

        <div style={styles.tableScroll}>

          <table style={styles.table}>

            <thead>
              <tr>

                <th style={styles.th}>
                  Audit ID
                </th>

                <th style={styles.th}>
                  Centre
                </th>

                <th style={styles.th}>
                  Reason
                </th>

                <th style={styles.th}>
                  Priority
                </th>

                <th style={styles.th}>
                  Status
                </th>

                <th style={styles.th}>
                  Action
                </th>

              </tr>
            </thead>

            <tbody>

              {generatedAlerts.map(
                (alert, index) => (
                  <tr
                    key={alert.id}
                    style={styles.tr}
                  >

                    <td style={styles.td}>
                      <strong>
                        AUD-
                        {String(
                          index + 1
                        ).padStart(
                          3,
                          '0'
                        )}
                      </strong>
                    </td>

                    <td style={styles.td}>
                      {alert.centreName}

                      <div
                        style={
                          styles.miniText
                        }
                      >
                        {alert.centreId}
                      </div>
                    </td>

                    <td style={styles.td}>
                      {alert.type}
                    </td>

                    <td style={styles.td}>

                      <span
                        style={
                          alert.severity ===
                          'CRITICAL'
                            ? styles.tagCritical
                            : alert.severity ===
                              'HIGH'
                            ? styles.tagAlert
                            : styles.tagWarning
                        }
                      >
                        {alert.severity}
                      </span>

                    </td>

                    <td style={styles.td}>

                      <span
                        style={
                          styles.tagWarning
                        }
                      >
                        OPEN
                      </span>

                    </td>

                    <td style={styles.td}>

                      <button
                        style={
                          styles.smallActionButton
                        }
                        onClick={() =>
                          setAuditCentre(
                            alert.centreId
                          )
                        }
                      >
                        <Eye size={13} />
                        Review
                      </button>

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* AUDIT DETAIL                                                */
/* ========================================================= */

function AuditDetail({
  centreId,
  allCentres,
  generatedAlerts,
  onBack,
  getRiskStyle
}) {
  const info =
    allCentres.find(
      ([id]) => id === centreId
    )?.[1];

  const alerts =
    generatedAlerts.filter(
      alert =>
        alert.centreId === centreId
    );

  const risk =
    Number(
      info?.fraud_risk_score || 0
    );

  const [finding, setFinding] =
    useState('');

  const [decision, setDecision] =
    useState('');

  const [submitted, setSubmitted] =
    useState(false);

  return (
    <div>

      <button
        onClick={onBack}
        style={styles.backButton}
      >
        ← Back to Audit Queue
      </button>

      <div
        style={styles.detailHeader}
      >

        <div>

          <div
            style={
              styles.detailEyebrow
            }
          >
            AUDIT CASE
          </div>

          <h3
            style={
              styles.detailTitle
            }
          >
            {info?.name ||
              centreId}
          </h3>

          <p
            style={
              styles.detailSubtitle
            }
          >
            Centre ID: {centreId}
          </p>

        </div>

        <span
          style={getRiskStyle(risk)}
        >
          {getRiskLevel(risk)}
        </span>

      </div>

      <div
        className="metrics-grid-responsive"
        style={styles.metricsGrid}
      >

        <MetricCard
          icon={<ShieldAlert size={18} />}
          label="Risk Score"
          value={`${risk}/100`}
          sub="AI-derived monitoring risk"
          danger={risk >= 50}
        />

        <MetricCard
          icon={<Users size={18} />}
          label="AI Camera Count"
          value={
            info?.live_headcount || 0
          }
          sub="Current observed persons"
        />

        <MetricCard
          icon={<HardDrive size={18} />}
          label="Infrastructure"
          value={`${
            info?.compliance_percentage ??
            0
          }%`}
          sub="Current compliance"
        />

      </div>

      <div
        style={styles.twoColumnGrid}
      >

        <div style={styles.tableCard}>

          <SectionHeader
            title="AI Evidence Summary"
            subtitle="Signals contributing to this audit case"
          />

          <div
            style={
              styles.evidenceList
            }
          >

            {alerts.map(
              alert => (
                <div
                  key={alert.id}
                  style={
                    styles.evidenceItem
                  }
                >

                  <div
                    style={
                      styles.evidenceIcon
                    }
                  >
                    <AlertTriangle
                      size={16}
                    />
                  </div>

                  <div>

                    <strong>
                      {alert.type}
                    </strong>

                    <p>
                      {alert.description}
                    </p>

                    <span
                      style={
                        styles.miniText
                      }
                    >
                      Evidence:
                      {' '}
                      {alert.evidence}
                    </span>

                  </div>

                </div>
              )
            )}

            {alerts.length === 0 && (
              <EmptyState
                title="No active signals"
                description="No anomaly evidence is currently associated with this centre."
              />
            )}

          </div>

        </div>

        <div style={styles.tableCard}>

          <SectionHeader
            title="Inspector Findings"
            subtitle="Human verification layer"
          />

          {submitted ? (
            <div
              style={
                styles.submittedState
              }
            >

              <CheckCircle2
                size={36}
                color="#15803d"
              />

              <strong>
                Audit Finding Submitted
              </strong>

              <p>
                The case has been recorded
                for official review.
              </p>

            </div>
          ) : (
            <>
              <label
                style={
                  styles.formLabel
                }
              >
                Inspector Observation
              </label>

              <textarea
                value={finding}
                onChange={e =>
                  setFinding(
                    e.target.value
                  )
                }
                placeholder="Record physical observations, verification results or discrepancies..."
                style={
                  styles.textarea
                }
              />

              <label
                style={
                  styles.formLabel
                }
              >
                Final Decision
              </label>

              <select
                value={decision}
                onChange={e =>
                  setDecision(
                    e.target.value
                  )
                }
                style={
                  styles.fullSelect
                }
              >

                <option value="">
                  Select decision
                </option>

                <option>
                  Compliant
                </option>

                <option>
                  Minor Non-Compliance
                </option>

                <option>
                  Major Non-Compliance
                </option>

                <option>
                  Escalate
                </option>

              </select>

              <button
                style={{
                  ...styles.primaryButton,
                  width: '100%',
                  marginTop: '14px'
                }}
                disabled={
                  !finding ||
                  !decision
                }
                onClick={() =>
                  setSubmitted(true)
                }
              >
                <ClipboardCheck size={14} />
                Submit Audit Finding
              </button>

            </>
          )}

        </div>

      </div>

      <div
        style={{
          ...styles.infoNotice,
          marginTop: '20px'
        }}
      >

        <ShieldCheck size={17} />

        <div>

          <strong>
            Human-in-the-loop safeguard
          </strong>

          <p>
            AI signals support investigation.
            The inspector remains responsible
            for the final compliance decision.
          </p>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* REPORTS                                                     */
/* ========================================================= */

function ReportsPage({
  stats,
  allCentres,
  downloadCSV,
  activeReportTab,
  setActiveReportTab
}) {
  const reportTypes = [
    {
      name: 'Attendance Report',
      reportType: 'attendance',
      icon: <Users size={18} />,
      description: 'Official attendance compared with AI-observed headcount.'
    },
    {
      name: 'Infrastructure Report',
      reportType: 'compliance',
      icon: <HardDrive size={18} />,
      description: 'Equipment requirements, detected assets, and compliance.'
    },
    {
      name: 'Risk Analysis Report',
      reportType: 'centres',
      icon: <BarChart3 size={18} />,
      description: 'Centre-level risk scores and current operational status.'
    }
  ];

  const selectedReportDetails =
    reportTypes.find(report => report.reportType === activeReportTab) || reportTypes[0];
  const reportStats = activeReportTab === 'attendance'
    ? [
        {
          label: 'Officially Marked Present',
          value: allCentres.reduce((sum, [, centre]) => (
            sum + Number(centre?.official_marked_present ?? 0)
          ), 0)
        },
        {
          label: 'AI Camera Count',
          value: allCentres.reduce((sum, [, centre]) => sum + Number(centre?.live_headcount || 0), 0)
        },
        {
          label: 'Missing / Discrepancy Gap',
          value: allCentres.reduce((sum, [, centre]) => (
            sum + Math.max(
              0,
              Number(centre?.official_marked_present ?? 0) -
                Number(centre?.live_headcount || 0)
            )
          ), 0)
        }
      ]
    : activeReportTab === 'compliance'
      ? [
          { label: 'Centres', value: allCentres.length },
          {
            label: 'Avg. Compliance',
            value: `${allCentres.length
              ? Math.round(allCentres.reduce((sum, [, centre]) => sum + Number(centre?.compliance_percentage || 0), 0) / allCentres.length)
              : 0}%`
          },
          { label: 'Audit Logs', value: stats?.recent_audit_logs?.length || 0 }
        ]
      : [
          { label: 'Centres', value: allCentres.length },
          {
            label: 'High Risk',
            value: allCentres.filter(([, centre]) => ['HIGH_RISK', 'FLAGGED'].includes(String(centre?.status || '').toUpperCase())).length
          },
          {
            label: 'Avg. Risk',
            value: `${allCentres.length
              ? Math.round(allCentres.reduce((sum, [, centre]) => sum + Number(centre?.fraud_risk_score || 0), 0) / allCentres.length)
              : 0}/100`
          }
        ];

  return (
    <div>

      <PageIntro
        title="Compliance Reports & Exports"
        description="Generate operational summaries from the current SACH monitoring state."
      />

      <div
        className="report-grid-responsive"
        style={styles.reportGrid}
      >

        <div
          style={styles.reportTypeList}
        >

          {reportTypes.map(
            report => (
              <button
                key={report.name}
                onClick={() => setActiveReportTab(report.reportType)}
                style={{
                  ...styles.reportType,
                  borderColor: activeReportTab === report.reportType ? '#2563eb' : '#e2e8f0',
                  background: activeReportTab === report.reportType ? '#eff6ff' : '#ffffff'
                }}
              >

                <div
                  style={
                    styles.reportIcon
                  }
                >
                  {report.icon}
                </div>

                <div className="report-type-copy">

                  <strong>
                    {report.name}
                  </strong>

                  <span>
                    {report.description}
                  </span>

                </div>

              </button>
            )
          )}

        </div>

        <div style={styles.tableCard}>

          <SectionHeader
            title={selectedReportDetails.name}
            subtitle={selectedReportDetails.description}
          />

          <div
            style={
              styles.reportPreview
            }
          >

            <div
              style={
                styles.reportHeader
              }
            >

              <div className="report-brand-copy">

                <strong>
                  SACH
                </strong>

                <span>
                  Smart Attendance &
                  Compliance Hub
                </span>

              </div>

              <FileText size={28} />
            </div>

            <div
              style={
                styles.reportDivider
              }
            />

            <p className="report-preview-description">
              {selectedReportDetails.description}
            </p>

            <div style={styles.reportStats}>
              {reportStats.map(item => (
                <div className="report-stat-cell" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <p
              style={
                styles.reportDisclaimer
              }
            >
              This preview is generated
              from the current live SACH
              monitoring state. Official
              reports should include
              authenticated source records
              and audit metadata.
            </p>

          </div>

          <div
            style={
              styles.reportActions
            }
          >

            <button
              style={
                styles.primaryButton
              }
              onClick={() => downloadCSV(activeReportTab)}
            >
              <Download size={14} />
              Export CSV
            </button>

            <button
              style={
                styles.secondaryButton
              }
              onClick={() =>
                window.print()
              }
            >
              <FileText size={14} />
              Print / Save PDF
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}


/* ========================================================= */
/* SETTINGS                                                    */
/* ========================================================= */

function SettingsPage({
  settingsSaved,
  setSettingsSaved,
  currentUser,
  allCentres,
  selectedRole,
  setRolePreview
}) {
  const [threshold, setThreshold] =
    useState(50);

  const [polling, setPolling] =
    useState(2);

  const [autoAlerts, setAutoAlerts] =
    useState(true);

  return (
    <div>

      <PageIntro
        title="System Configurations"
        description="Control Tower monitoring and operational configuration."
      />

      <div
        style={styles.settingsGrid}
      >

        <div style={styles.tableCard}>

          <SectionHeader
            title="Monitoring Configuration"
            subtitle="Current prototype settings"
          />

          <div
            style={
              styles.settingsBody
            }
          >

            <div
              style={
                styles.settingRow
              }
            >

              <div className="setting-copy">
                <strong>
                  High-Risk Threshold
                </strong>

                <span>
                  Centre risk score at which
                  official review is recommended.
                </span>
              </div>

              <input
                type="number"
                min="0"
                max="100"
                value={threshold}
                onChange={e =>
                  setThreshold(
                    e.target.value
                  )
                }
                style={
                  styles.numberInput
                }
              />

            </div>

            <div
              style={
                styles.settingRow
              }
            >

              <div className="setting-copy">
                <strong>
                  Telemetry Polling
                </strong>

                <span>
                  Frequency of dashboard
                  backend refresh.
                </span>
              </div>

              <select
                value={polling}
                onChange={e =>
                  setPolling(
                    e.target.value
                  )
                }
                style={
                  styles.smallSelect
                }
              >
                <option value="1">
                  1 second
                </option>

                <option value="2">
                  2 seconds
                </option>

                <option value="5">
                  5 seconds
                </option>

                <option value="10">
                  10 seconds
                </option>

              </select>

            </div>

            <div
              style={
                styles.settingRow
              }
            >

              <div className="setting-copy">
                <strong>
                  Automated Alerts
                </strong>

                <span>
                  Generate dashboard
                  anomalies from risk signals.
                </span>
              </div>

              <button
                onClick={() =>
                  setAutoAlerts(
                    !autoAlerts
                  )
                }
                style={{
                  ...styles.toggle,
                  background:
                    autoAlerts
                      ? '#1d4ed8'
                      : '#cbd5e1'
                }}
              >
                <span
                  style={{
                    ...styles.toggleKnob,
                    transform:
                      autoAlerts
                        ? 'translateX(20px)'
                        : 'translateX(0)'
                  }}
                />
              </button>

            </div>

            <button
              style={
                styles.primaryButton
              }
              onClick={() => {
                setSettingsSaved(true);

                setTimeout(
                  () =>
                    setSettingsSaved(
                      false
                    ),
                  2500
                );
              }}
            >

              <Save size={14} />

              Save Configuration

            </button>

            {settingsSaved && (
              <div
                style={
                  styles.successNotice
                }
              >
                <CheckCircle2
                  size={15}
                />

                Configuration saved
                successfully.
              </div>
            )}

          </div>

        </div>

        <div style={styles.tableCard}>

          <SectionHeader
            title="System Health"
            subtitle="Current application connectivity"
          />

          <div
            style={
              styles.healthList
            }
          >

            <HealthRow
              icon={<Server size={16} />}
              label="FastAPI Backend"
              status="CONNECTED"
            />

            <HealthRow
              icon={<Video size={16} />}
              label="Attendance Vision"
              status="STREAMING"
            />

            <HealthRow
              icon={<HardDrive size={16} />}
              label="Infrastructure Vision"
              status="ACTIVE"
            />

            <HealthRow
              icon={<Wifi size={16} />}
              label="Ngrok Tunnel"
              status="CONNECTED"
            />

            <HealthRow
              icon={<Database size={16} />}
              label="Telemetry Store"
              status="IN-MEMORY"
              warning
            />

          </div>

        </div>

      </div>

      <section className="rbac-preview-card" aria-labelledby="rbac-preview-title">
        <div>
          <span className="rbac-eyebrow">ACCESS MODEL PREVIEW</span>
          <h3 id="rbac-preview-title">Role-Based Access Control</h3>
          <p>Preview each role’s intended portal surface. Server-side permissions remain authoritative.</p>
        </div>
        <div className="rbac-role-grid">
          {[
            {
              id: 'ADMIN',
              title: 'Super Admin (National Official)',
              description: 'Full system edit access, threshold management, and user onboarding.'
            },
            {
              id: 'AUDITOR',
              title: 'Inspectorate Official',
              description: 'Read-only dashboard telemetry, active audit forms, and alert resolution.'
            },
            {
              id: 'OPERATOR',
              title: 'Centre Operator',
              description: 'Zero-dashboard access: API telemetry push and daily register submission only.'
            }
          ].map(role => (
            <button
              key={role.id}
              type="button"
              className={`rbac-role-option${selectedRole === role.id ? ' selected' : ''}`}
              aria-pressed={selectedRole === role.id}
              onClick={() => setRolePreview(role.id)}
            >
              <strong>{role.title}</strong>
              <span>{role.description}</span>
            </button>
          ))}
        </div>
      </section>

      {currentUser.role === 'ADMIN' && (
        <AdminUserManagement allCentres={allCentres} />
      )}
    </div>
  );
}

function AdminUserManagement({ allCentres }) {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OFFICIAL');
  const [centreId, setCentreId] = useState(allCentres[0]?.[0] || '');
  const [replacementPasswords, setReplacementPasswords] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    const { data } = await axios.get(`${API_BASE}/auth/users`);
    setUsers(data.users);
  };

  useEffect(() => {
    loadUsers().catch(error => {
      setErrorMessage(getApiErrorMessage(error, 'Could not load user accounts.'));
    });
  }, []);

  const createUser = async event => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await axios.post(`${API_BASE}/auth/users`, {
        username,
        password,
        role,
        ...(role === 'CENTRE_OPERATOR' ? { centre_id: centreId } : {})
      });
      setUsername('');
      setPassword('');
      setRole('OFFICIAL');
      setCentreId(allCentres[0]?.[0] || '');
      setSuccessMessage('User account created.');
      await loadUsers();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not create the account.'));
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (userId, changes) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await axios.patch(`${API_BASE}/auth/users/${userId}`, changes);
      setSuccessMessage('User account updated.');
      await loadUsers();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not update the account.'));
      await loadUsers();
    }
  };

  return (
    <section style={{ ...styles.tableCard, marginTop: '20px' }}>
      <SectionHeader
        title="User and Role Management"
        subtitle="Create separate logins, assign access roles, and restrict operators to one training centre."
      />
      <form
        onSubmit={createUser}
        style={{ ...styles.settingsBody, display: 'grid', gap: '12px' }}
      >
        <div className="auth-user-form">
          <label style={styles.authFormLabel}>
            Username
            <input
              required
              minLength={3}
              maxLength={64}
              value={username}
              onChange={event => setUsername(event.target.value)}
              style={styles.authInput}
              autoComplete="off"
            />
          </label>
          <label style={styles.authFormLabel}>
            Temporary password (12+ characters)
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={event => setPassword(event.target.value)}
              style={styles.authInput}
              autoComplete="new-password"
            />
          </label>
          <label style={styles.authFormLabel}>
            Role
            <select
              value={role}
              onChange={event => setRole(event.target.value)}
              style={styles.authInput}
            >
              <option value="OFFICIAL">Official</option>
              <option value="AUDITOR">Auditor</option>
              <option value="ADMIN">Administrator</option>
              <option value="CENTRE_OPERATOR">Centre Operator</option>
            </select>
          </label>
          {role === 'CENTRE_OPERATOR' && (
            <label style={styles.authFormLabel}>
              Assigned centre
              <select
                value={centreId}
                onChange={event => setCentreId(event.target.value)}
                style={styles.authInput}
                required
              >
                {allCentres.map(([id, centre]) => (
                  <option key={id} value={id}>{centre?.name || id} · {id}</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={saving} style={styles.primaryButton}>
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
        {errorMessage && <p role="alert" style={styles.errorNotice}>{errorMessage}</p>}
        {successMessage && <p role="status" style={styles.successNotice}>{successMessage}</p>}
        <div style={{ display: 'grid', gap: '8px' }}>
          {users.map(user => (
            <div key={user.id} className="auth-user-row">
              <strong>{user.username}</strong>
              <select
                value={user.role}
                aria-label={`Role for ${user.username}`}
                onChange={event => {
                  const nextRole = event.target.value;
                  updateUser(user.id, {
                    role: nextRole,
                    centre_id: nextRole === 'CENTRE_OPERATOR'
                      ? user.centre_id || allCentres[0]?.[0] || null
                      : null
                  });
                }}
                style={styles.smallSelect}
              >
                <option value="OFFICIAL">Official</option>
                <option value="AUDITOR">Auditor</option>
                <option value="ADMIN">Administrator</option>
                <option value="CENTRE_OPERATOR">Centre Operator</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={user.is_active}
                  onChange={event => updateUser(user.id, { is_active: event.target.checked })}
                />
                Active
              </label>
              <span style={styles.miniText}>
                {isCentreOperator(user.role) ? user.centre_id || 'Centre unassigned' : ''}
                {isCentreOperator(user.role) ? ' · ' : ''}
                {new Date(user.created_at).toLocaleDateString()}
              </span>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                {isCentreOperator(user.role) && (
                  <select
                    value={user.centre_id || ''}
                    aria-label={`Assigned centre for ${user.username}`}
                    onChange={event => updateUser(user.id, { centre_id: event.target.value })}
                    style={styles.authInput}
                  >
                    {allCentres.map(([id, centre]) => (
                      <option key={id} value={id}>{centre?.name || id} · {id}</option>
                    ))}
                  </select>
                )}
                <input
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  aria-label={`New password for ${user.username}`}
                  placeholder="Set temporary password (12+ characters)"
                  value={replacementPasswords[user.id] || ''}
                  onChange={event => setReplacementPasswords(current => ({
                    ...current,
                    [user.id]: event.target.value
                  }))}
                  style={{ ...styles.authInput, marginTop: 0 }}
                />
                <button
                  type="button"
                  disabled={(replacementPasswords[user.id] || '').length < 12}
                  onClick={async () => {
                    await updateUser(user.id, {
                      password: replacementPasswords[user.id]
                    });
                    setReplacementPasswords(current => ({
                      ...current,
                      [user.id]: ''
                    }));
                  }}
                  style={styles.smallActionButton}
                >
                  Reset password
                </button>
              </div>
            </div>
          ))}
        </div>
      </form>
    </section>
  );
}

function AdminCourseManagement({ allCentres, onCentreCreated }) {
  const [courses, setCourses] = useState([]);
  const [centreId, setCentreId] = useState(allCentres[0]?.[0] || '');
  const [newCentreId, setNewCentreId] = useState('');
  const [newCentreName, setNewCentreName] = useState('');
  const [registeredTotal, setRegisteredTotal] = useState('0');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [batchName, setBatchName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [enrolledDate, setEnrolledDate] = useState('');
  const [faceStatus, setFaceStatus] = useState('PENDING');
  const [faceProfileId, setFaceProfileId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCourses = async () => {
    const { data } = await axios.get(`${API_BASE}/admin/courses`);
    setCourses(data.courses || []);
    setCourseId(current => current || String(data.courses?.[0]?.id || ''));
  };

  useEffect(() => {
    loadCourses().catch(error => {
      setErrorMessage(getApiErrorMessage(error, 'Could not load course batches.'));
    });
  }, []);

  const createCentre = async event => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { data } = await axios.post(`${API_BASE}/admin/centres`, {
        centre_id: newCentreId,
        name: newCentreName,
        registered_total: Number(registeredTotal)
      });
      await onCentreCreated();
      setCentreId(data.centre.centre_id);
      setNewCentreId('');
      setNewCentreName('');
      setRegisteredTotal('0');
      setNotice(`Centre ${data.centre.centre_id} registered. Add its course batches and student rosters below.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not register this training centre.'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!courseId) {
      setStudents([]);
      return undefined;
    }
    let active = true;
    axios.get(`${API_BASE}/admin/courses/${encodeURIComponent(courseId)}/students`)
      .then(({ data }) => {
        if (active) setStudents(data.students || []);
      })
      .catch(error => {
        if (active) setErrorMessage(getApiErrorMessage(error, 'Could not load the student roster.'));
      });
    return () => { active = false; };
  }, [courseId]);

  const createCourse = async event => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { data } = await axios.post(`${API_BASE}/admin/courses`, {
        centre_id: centreId,
        course_code: courseCode,
        name: courseName,
        batch_name: batchName
      });
      setCourseCode('');
      setCourseName('');
      setBatchName('');
      await loadCourses();
      setCourseId(String(data.course.id));
      setNotice('Course batch created.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not create this course batch.'));
    } finally {
      setSaving(false);
    }
  };

  const addStudent = async event => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await axios.post(`${API_BASE}/admin/courses/${encodeURIComponent(courseId)}/students`, {
        student_name: studentName,
        roll_number: rollNumber,
        enrolled_date: enrolledDate,
        face_profile_status: faceStatus,
        ...(faceStatus === 'REGISTERED' ? { face_profile_id: faceProfileId } : {})
      });
      setStudentName('');
      setRollNumber('');
      setFaceProfileId('');
      const { data } = await axios.get(`${API_BASE}/admin/courses/${encodeURIComponent(courseId)}/students`);
      setStudents(data.students || []);
      await loadCourses();
      setNotice('Student added to the course roster.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Could not add this student.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="table-card operator-portal-card">
      <SectionHeader
        title="Centre, Course Batch and Student Setup"
        subtitle="Register training centres, assign course batches, and configure enrolled learners. Face profile metadata is stored here; raw biometric templates or face images are not."
      />
      <div className="operator-admin-forms">
        <form className="operator-portal-body" onSubmit={createCentre}>
          <h3>Register a training centre</h3>
          <label className="operator-course-select">Centre ID<input required value={newCentreId} onChange={event => setNewCentreId(event.target.value)} maxLength={100} placeholder="e.g. JAIPUR_003" /></label>
          <label className="operator-course-select">Centre name<input required value={newCentreName} onChange={event => setNewCentreName(event.target.value)} maxLength={255} /></label>
          <label className="operator-course-select">Registered learners<input type="number" min="0" max="100000" required value={registeredTotal} onChange={event => setRegisteredTotal(event.target.value)} /></label>
          <button type="submit" disabled={saving} style={styles.primaryButton}>Register centre</button>
        </form>
        <form className="operator-portal-body" onSubmit={createCourse}>
          <h3>Create a course batch</h3>
          <label className="operator-course-select">
            Training centre
            <select required value={centreId} onChange={event => setCentreId(event.target.value)}>
              {allCentres.map(([id, centre]) => <option key={id} value={id}>{centre?.name || id} · {id}</option>)}
            </select>
          </label>
          <label className="operator-course-select">Course code<input required value={courseCode} onChange={event => setCourseCode(event.target.value)} maxLength={64} /></label>
          <label className="operator-course-select">Course name<input required value={courseName} onChange={event => setCourseName(event.target.value)} maxLength={255} /></label>
          <label className="operator-course-select">Batch name<input required value={batchName} onChange={event => setBatchName(event.target.value)} maxLength={120} /></label>
          <button type="submit" disabled={saving || !centreId} style={styles.primaryButton}>Create course</button>
        </form>
        <form className="operator-portal-body" onSubmit={addStudent}>
          <h3>Add an enrolled student</h3>
          <label className="operator-course-select">
            Course and batch
            <select required value={courseId} onChange={event => setCourseId(event.target.value)}>
              {courses.map(course => <option key={course.id} value={course.id}>{course.centre_id} · {course.name} · {course.batch_name}</option>)}
            </select>
          </label>
          <label className="operator-course-select">Student name<input required value={studentName} onChange={event => setStudentName(event.target.value)} maxLength={255} /></label>
          <label className="operator-course-select">Roll number<input required value={rollNumber} onChange={event => setRollNumber(event.target.value)} maxLength={80} /></label>
          <label className="operator-course-select">Enrolled date<input type="date" required value={enrolledDate} onChange={event => setEnrolledDate(event.target.value)} /></label>
          <label className="operator-course-select">
            Registered Face ID status
            <select value={faceStatus} onChange={event => setFaceStatus(event.target.value)}>
              <option value="PENDING">Not registered</option>
              <option value="PHOTO_ONBOARDED">Photo onboarded</option>
              <option value="REGISTERED">Face profile registered</option>
            </select>
          </label>
          {faceStatus === 'REGISTERED' && (
            <label className="operator-course-select">Opaque face profile ID<input required value={faceProfileId} onChange={event => setFaceProfileId(event.target.value)} maxLength={100} /></label>
          )}
          <button type="submit" disabled={saving || !courseId} style={styles.primaryButton}>Add student</button>
        </form>
      </div>
      {errorMessage && <p role="alert" className="operator-error operator-portal-body">{errorMessage}</p>}
      {notice && <p role="status" className="operator-success operator-portal-body">{notice}</p>}
      {courseId && (
        <div className="operator-portal-body">
          <h3>Configured student roster</h3>
          <div className="table-scroll">
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Student</th><th style={styles.th}>Roll No.</th><th style={styles.th}>Enrolled</th><th style={styles.th}>Face ID status</th></tr></thead>
              <tbody>
                {students.map(student => <tr key={student.roll_number} style={styles.tr}><td style={styles.td}>{student.student_name}</td><td style={styles.td}>{student.roll_number}</td><td style={styles.td}>{student.enrolled_date}</td><td style={styles.td}>{student.face_profile_status === 'REGISTERED' ? `Registered · ${student.face_profile_id}` : student.face_profile_status === 'PHOTO_ONBOARDED' ? 'Photo onboarded' : 'Not registered'}</td></tr>)}
                {!students.length && <tr><td colSpan="4" style={styles.td}>No enrolled students in this batch yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}


/* ========================================================= */
/* COMPONENTS                                                  */
/* ========================================================= */

function MetricCard({
  icon,
  label,
  value,
  sub,
  danger = false
}) {
  return (
    <div
      style={{
        ...styles.card,
        borderTop:
          `3px solid ${
            danger
              ? '#dc2626'
              : '#1d4ed8'
          }`
      }}
      className="interactive-card"
    >

      <div
        style={
          styles.metricIcon
        }
      >
        {icon}
      </div>

      <span
        style={styles.cardLabel}
      >
        {label}
      </span>

      <h3
        style={{
          ...styles.cardVal,
          color:
            danger
              ? '#b91c1c'
              : '#0f172a'
        }}
      >
        {value}
      </h3>

      <span
        style={styles.cardSub}
      >
        {sub}
      </span>

    </div>
  );
}


function SectionHeader({
  title,
  subtitle,
  action,
  onClick
}) {
  return (
    <div
      style={
        styles.sectionHeader
      }
    >

      <div>

        <h3
          style={
            styles.sectionTitle
          }
        >
          {title}
        </h3>

        {subtitle && (
          <p
            style={
              styles.sectionSubtitle
            }
          >
            {subtitle}
          </p>
        )}

      </div>

      {action && (
        <button
          style={
            styles.textButton
          }
          onClick={onClick}
        >
          {action}
          <ArrowUpRight size={13} />
        </button>
      )}

    </div>
  );
}


function PageIntro({
  title,
  description,
  badge
}) {
  return (
    <div
      style={styles.pageIntro}
    >

      <div>

        <h3
          style={styles.pageTitle}
        >
          {title}
        </h3>

        <p
          style={
            styles.pageDescription
          }
        >
          {description}
        </p>

      </div>

      {badge && (
        <div
          style={styles.pageBadge}
        >
          <Activity size={12} />
          {badge}
        </div>
      )}

    </div>
  );
}


function AlertCard({
  alert,
  handleNavClick,
  onAcknowledge,
  onResolve,
  canManageAlerts
}) {
  const critical =
    alert.severity === 'CRITICAL';

  const high =
    alert.severity === 'HIGH';

  return (
    <div
      style={{
        ...styles.alertCard,
        borderLeft:
          `4px solid ${
            critical
              ? '#991b1b'
              : high
              ? '#dc2626'
              : '#d97706'
          }`
      }}
      className="interactive-card"
    >

      <div
        style={
          styles.alertTop
        }
      >

        <span
          style={
            critical
              ? styles.tagCritical
              : high
              ? styles.tagAlert
              : styles.tagWarning
          }
        >
          {alert.severity}
        </span>

        <span
          style={styles.miniText}
        >
          {alert.time}
        </span>

      </div>

      <div
        style={
          styles.alertIconRow
        }
      >

        <div
          style={
            critical
              ? styles.alertIconCritical
              : styles.alertIcon
          }
        >
          <AlertTriangle
            size={18}
          />
        </div>

        <div>

          <h4
            style={
              styles.alertTitle
            }
          >
            {alert.type}
          </h4>

          <p
            style={
              styles.alertCentre
            }
          >
            {alert.centreName}
            {' '}
            •{' '}
            {alert.centreId}
          </p>

        </div>

      </div>

      <p
        style={
          styles.alertDescription
        }
      >
        {alert.description}
      </p>

      <div
        style={
          styles.alertEvidence
        }
      >
        <strong>
          Evidence:
        </strong>
        {' '}
        {alert.evidence}
      </div>

      <div style={styles.alertActions}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {canManageAlerts && alert.status === 'OPEN' && onAcknowledge && (
            <button
              style={{
                ...styles.smallActionButton,
                background: '#fef3c7',
                color: '#92400e',
                borderColor: '#fde68a'
              }}
              onClick={() => onAcknowledge(alert.id)}
            >
              <CheckCircle2 size={12} /> Acknowledge
            </button>
          )}

          {canManageAlerts && (alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && onResolve && (
            <button
              style={{
                ...styles.smallActionButton,
                background: '#dcfce7',
                color: '#166534',
                borderColor: '#bbf7d0'
              }}
              onClick={() => onResolve(alert.id)}
            >
              <ShieldCheck size={12} /> Resolve
            </button>
          )}

          {alert.status === 'RESOLVED' && (
            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>
              ✓ Resolved
            </span>
          )}

          <button
            style={styles.smallActionButton}
            onClick={() => handleNavClick('audits')}
          >
            <Eye size={12} /> Investigate
          </button>
        </div>

        <span
          style={styles.miniText}
        >
          {alert.score ? `Risk score: ${alert.score}` : `Status: ${alert.status || 'OPEN'}`}
        </span>

      </div>

    </div>
  );
}


function HealthRow({
  icon,
  label,
  status,
  warning = false
}) {
  return (
    <div
      style={
        styles.healthRow
      }
    >

      <div
        style={
          styles.healthLeft
        }
      >

        {icon}

        <strong>
          {label}
        </strong>

      </div>

      <span
        style={
          warning
            ? styles.tagWarning
            : styles.tagSafe
        }
      >
        {status}
      </span>

    </div>
  );
}


function EmptyState({
  icon,
  title,
  description
}) {
  return (
    <div
      style={
        styles.emptyState
      }
    >

      {icon && (
        <div
          style={
            styles.emptyIcon
          }
        >
          {icon}
        </div>
      )}

      <strong>
        {title}
      </strong>

      {description && (
        <p>
          {description}
        </p>
      )}

    </div>
  );
}


/* ========================================================= */
/* HELPERS                                                     */
/* ========================================================= */

function getPageTitle(tab) {
  const titles = {
    dashboard:
      'NATIONAL CONTROL TOWER',

    monitoring:
      'LIVE STREAM MONITORING',

    centres:
      'TRAINING CENTRES DIRECTORY',

    attendance:
      'ATTENDANCE INTELLIGENCE',

    infrastructure:
      'INFRASTRUCTURE AUDIT',

    alerts:
      'ANOMALY & INCIDENT ALERTS',

    audits:
      'INSPECTOR AUDIT WORKFLOW',

    reports:
      'COMPLIANCE REPORTS',

    'operator-registers':
      'CENTRE ATTENDANCE REGISTERS',

    courses:
      'COURSE & ROSTER MANAGEMENT',

    settings:
      'SYSTEM CONFIGURATIONS'
  };

  return (
    titles[tab] ||
    'SACH CONTROL TOWER'
  );
}


function getRiskLevel(score) {
  const risk =
    Number(score || 0);

  if (risk >= 75)
    return 'CRITICAL';

  if (risk >= 50)
    return 'HIGH';

  if (risk >= 25)
    return 'MEDIUM';

  return 'LOW';
}


/* ========================================================= */
/* STYLES                                                       */
/* ========================================================= */

const styles = {

  appContainer: {
    fontFamily:
      "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    backgroundColor:
      '#f8fafc',
    minHeight:
      '100vh',
    color:
      '#0f172a'
  },

  topGovBar: {
    backgroundColor:
      '#0f172a',
    color:
      '#cbd5e1',
    padding:
      '6px 24px',
    fontSize:
      '10px',
    fontWeight:
      '600',
    display:
      'flex',
    justifyContent:
      'space-between',
    borderBottom:
      '1px solid #1e293b',
    letterSpacing:
      '0.15px'
  },

  mainWrapper: {
    display:
      'flex',
    minHeight:
      'calc(100vh - 25px)',
    width:
      '100%',
    position:
      'relative'
  },

  brandBox: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '10px',
    paddingBottom:
      '14px',
    borderBottom:
      '1px solid #1e293b'
  },

  logoIcon: {
    backgroundColor:
      '#1d4ed8',
    padding:
      '7px',
    borderRadius:
      '6px',
    display:
      'flex'
  },

  brandTitle: {
    margin:
      0,
    fontSize:
      '19px',
    fontWeight:
      '800',
    color:
      '#ffffff',
    letterSpacing:
      '0.4px'
  },

  brandSubtitle: {
    margin:
      0,
    fontSize:
      '9px',
    color:
      '#94a3b8',
    maxWidth:
      '160px',
    lineHeight:
      '1.4'
  },

  navSection: {
    display:
      'flex',
    flexDirection:
      'column',
    gap:
      '2px'
  },

  navHeader: {
    fontSize:
      '9px',
    fontWeight:
      '700',
    color:
      '#64748b',
    letterSpacing:
      '0.7px',
    marginBottom:
      '4px',
    paddingLeft:
      '8px'
  },

  navItem: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '10px',
    border:
      'none',
    padding:
      '8px 10px',
    borderRadius:
      '6px',
    cursor:
      'pointer',
    fontSize:
      '11px',
    fontWeight:
      '600',
    textAlign:
      'left',
    width:
      '100%',
    transition:
      'background 0.15s ease'
  },

  userFooter: {
    marginTop:
      'auto',
    paddingTop:
      '12px',
    borderTop:
      '1px solid #1e293b'
  },

  sidebarLogout: {
    marginTop: '12px',
    width: '100%',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '7px 10px',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer'
  },

  authInput: {
    display: 'block',
    width: '100%',
    marginTop: '6px',
    padding: '10px 11px',
    border: '1px solid #cbd5e1',
    borderRadius: '7px',
    background: '#fff',
    color: '#0f172a',
    fontSize: '14px'
  },

  authFormLabel: {
    display: 'block',
    color: '#334155',
    fontSize: '12px',
    fontWeight: '600'
  },

  userIdentity: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '9px'
  },

  userAvatar: {
    width:
      '28px',
    height:
      '28px',
    borderRadius:
      '50%',
    background:
      '#1e3a8a',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    fontSize:
      '9px',
    fontWeight:
      '800'
  },

  userName: {
    margin:
      0,
    fontWeight:
      '700',
    color:
      '#f8fafc',
    fontSize:
      '10px'
  },

  userRole: {
    margin:
      '2px 0 0',
    fontSize:
      '9px',
    color:
      '#94a3b8'
  },

  contentArea: {
    flex:
      1,
    backgroundColor:
      '#f8fafc',
    display:
      'flex',
    flexDirection:
      'column',
    minWidth:
      0,
    overflowX:
      'hidden'
  },

  topHeader: {
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'center',
    padding:
      '13px 24px',
    backgroundColor:
      '#ffffff',
    borderBottom:
      '1px solid #e2e8f0',
    position:
      'sticky',
    top:
      0,
    zIndex:
      20
  },

  headerTitle: {
    margin:
      0,
    fontSize:
      '14px',
    fontWeight:
      '800',
    color:
      '#0f172a',
    letterSpacing:
      '0.2px'
  },

  headerSub: {
    margin:
      '3px 0 0',
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  exportBtn: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '6px',
    backgroundColor:
      '#1d4ed8',
    color:
      '#ffffff',
    border:
      'none',
    padding:
      '7px 12px',
    borderRadius:
      '6px',
    cursor:
      'pointer',
    fontSize:
      '10px',
    fontWeight:
      '700'
  },

  statusBadge: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '6px',
    backgroundColor:
      '#f0fdf4',
    color:
      '#166534',
    border:
      '1px solid #bbf7d0',
    padding:
      '6px 10px',
    borderRadius:
      '6px',
    fontSize:
      '10px',
    fontWeight:
      '700'
  },

  pageBody: {
    padding:
      '20px 24px 40px',
    flex:
      1,
    maxWidth:
      '1500px',
    width:
      '100%',
    boxSizing:
      'border-box'
  },

  pageIntro: {
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    gap:
      '16px',
    marginBottom:
      '18px'
  },

  pageTitle: {
    margin:
      0,
    fontSize:
      '17px',
    fontWeight:
      '800',
    color:
      '#0f172a'
  },

  pageDescription: {
    margin:
      '5px 0 0',
    fontSize:
      '11px',
    color:
      '#64748b',
    maxWidth:
      '760px',
    lineHeight:
      '1.5'
  },

  pageBadge: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '5px',
    padding:
      '5px 9px',
    border:
      '1px solid #bfdbfe',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    borderRadius:
      '5px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    whiteSpace:
      'nowrap'
  },

  liveIndicator: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '6px',
    padding:
      '6px 10px',
    background:
      '#f0fdf4',
    color:
      '#15803d',
    border:
      '1px solid #bbf7d0',
    borderRadius:
      '5px',
    fontSize:
      '9px',
    fontWeight:
      '800'
  },

  metricsGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(190px, 1fr))',
    gap:
      '14px'
  },

  card: {
    backgroundColor:
      '#ffffff',
    padding:
      '15px',
    borderRadius:
      '8px',
    border:
      '1px solid #e2e8f0',
    boxShadow:
      '0 1px 2px rgba(0,0,0,0.04)',
    minWidth:
      0
  },

  metricIcon: {
    width:
      '30px',
    height:
      '30px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    borderRadius:
      '6px',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    marginBottom:
      '9px'
  },

  cardLabel: {
    fontSize:
      '9px',
    fontWeight:
      '700',
    color:
      '#64748b',
    textTransform:
      'uppercase',
    letterSpacing:
      '0.4px'
  },

  cardVal: {
    margin:
      '5px 0 2px',
    fontSize:
      '25px',
    fontWeight:
      '800'
  },

  cardSub: {
    fontSize:
      '9px',
    color:
      '#94a3b8'
  },

  cardSubtle: {
    fontSize:
      '10px',
    color:
      '#64748b'
  },

  twoColumnGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'minmax(0, 1.5fr) minmax(300px, 0.8fr)',
    gap:
      '18px',
    marginTop:
      '18px'
  },

  tableCard: {
    backgroundColor:
      '#ffffff',
    borderRadius:
      '8px',
    border:
      '1px solid #e2e8f0',
    boxShadow:
      '0 1px 3px rgba(0,0,0,0.04)',
    width:
      '100%',
    overflow:
      'hidden'
  },

  sectionHeader: {
    padding:
      '14px 17px',
    borderBottom:
      '1px solid #e2e8f0',
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'center',
    gap:
      '12px'
  },

  sectionTitle: {
    fontSize:
      '13px',
    fontWeight:
      '800',
    color:
      '#0f172a',
    margin:
      0
  },

  sectionSubtitle: {
    margin:
      '3px 0 0',
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  textButton: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '4px',
    border:
      'none',
    background:
      'transparent',
    color:
      '#1d4ed8',
    fontSize:
      '10px',
    fontWeight:
      '700',
    cursor:
      'pointer'
  },

  tableScroll: {
    overflowX:
      'auto'
  },

  table: {
    width:
      '100%',
    borderCollapse:
      'collapse',
    textAlign:
      'left',
    fontSize:
      '11px',
    minWidth:
      '680px'
  },

  tr: {
    borderBottom:
      '1px solid #e2e8f0'
  },

  th: {
    padding:
      '9px 13px',
    backgroundColor:
      '#f8fafc',
    color:
      '#475569',
    fontWeight:
      '800',
    fontSize:
      '9px',
    textTransform:
      'uppercase',
    letterSpacing:
      '0.3px',
    whiteSpace:
      'nowrap'
  },

  td: {
    padding:
      '10px 13px',
    color:
      '#334155',
    verticalAlign:
      'middle'
  },

  miniText: {
    display:
      'block',
    marginTop:
      '2px',
    fontSize:
      '9px',
    color:
      '#94a3b8'
  },

  scoreSuffix: {
    fontSize:
      '9px',
    color:
      '#94a3b8',
    marginLeft:
      '2px'
  },

  centreGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(260px, 1fr))',
    gap:
      '14px'
  },

  centreCard: {
    backgroundColor:
      '#ffffff',
    padding:
      '15px',
    borderRadius:
      '8px',
    border:
      '1px solid #e2e8f0'
  },

  centreCardHeader: {
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    marginBottom:
      '12px',
    gap:
      '8px'
  },

  centreName: {
    margin:
      0,
    fontSize:
      '12px',
    fontWeight:
      '800',
    color:
      '#0f172a'
  },

  codeText: {
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  infoRow: {
    display:
      'flex',
    justifyContent:
      'space-between',
    gap:
      '10px',
    fontSize:
      '10px',
    marginBottom:
      '7px',
    color:
      '#475569'
  },

  progressBarBg: {
    height:
      '5px',
    backgroundColor:
      '#e2e8f0',
    borderRadius:
      '3px',
    overflow:
      'hidden',
    marginTop:
      '5px'
  },

  progressBarFill: {
    height:
      '100%',
    transition:
      'width 0.4s ease'
  },

  warningStrip: {
    marginTop:
      '12px',
    padding:
      '6px 8px',
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '5px',
    background:
      '#fff7ed',
    color:
      '#9a3412',
    border:
      '1px solid #fed7aa',
    borderRadius:
      '5px',
    fontSize:
      '9px',
    fontWeight:
      '700'
  },

  tagSafe: {
    backgroundColor:
      '#f0fdf4',
    color:
      '#166534',
    border:
      '1px solid #bbf7d0',
    padding:
      '3px 7px',
    borderRadius:
      '4px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    whiteSpace:
      'nowrap'
  },

  tagAlert: {
    backgroundColor:
      '#fef2f2',
    color:
      '#991b1b',
    border:
      '1px solid #fecaca',
    padding:
      '3px 7px',
    borderRadius:
      '4px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    whiteSpace:
      'nowrap'
  },

  tagCritical: {
    backgroundColor:
      '#7f1d1d',
    color:
      '#ffffff',
    border:
      '1px solid #991b1b',
    padding:
      '3px 7px',
    borderRadius:
      '4px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    whiteSpace:
      'nowrap'
  },

  tagWarning: {
    backgroundColor:
      '#fffbeb',
    color:
      '#92400e',
    border:
      '1px solid #fde68a',
    padding:
      '3px 7px',
    borderRadius:
      '4px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    whiteSpace:
      'nowrap'
  },

  tagLog: {
    backgroundColor:
      '#eff6ff',
    color:
      '#1e40af',
    border:
      '1px solid #dbeafe',
    padding:
      '3px 7px',
    borderRadius:
      '4px',
    fontSize:
      '9px',
    fontWeight:
      '700',
    whiteSpace:
      'nowrap'
  },

  signalPanel: {
    padding:
      '22px',
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '16px'
  },

  signalIcon: {
    width:
      '48px',
    height:
      '48px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    borderRadius:
      '8px'
  },

  bigSignalNumber: {
    fontSize:
      '32px',
    fontWeight:
      '800',
    margin:
      '2px 0'
  },

  attendanceBreakdown: {
    display:
      'grid',
    gridTemplateColumns:
      'repeat(3, 1fr)',
    borderTop:
      '1px solid #e2e8f0',
    borderBottom:
      '1px solid #e2e8f0'
  },

  attendanceBreakdownItem: {
    minWidth: 0,
    minHeight: '64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '2px'
  },

  secondaryButton: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    gap:
      '6px',
    background:
      '#ffffff',
    color:
      '#1d4ed8',
    border:
      '1px solid #bfdbfe',
    padding:
      '8px 11px',
    borderRadius:
      '5px',
    cursor:
      'pointer',
    fontSize:
      '10px',
    fontWeight:
      '700',
    margin:
      '14px 16px 16px'
  },

  filterBar: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap:
      '10px',
    marginBottom:
      '15px',
    flexWrap:
      'wrap'
  },

  searchBox: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '7px',
    background:
      '#ffffff',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '6px',
    padding:
      '0 10px',
    height:
      '36px',
    boxSizing:
      'border-box',
    flex:
      '1',
    minWidth:
      '220px',
    maxWidth:
      '400px',
    color:
      '#64748b'
  },

  searchInput: {
    border:
      'none',
    outline:
      'none',
    width:
      '100%',
    height:
      '100%',
    minWidth:
      '0',
    boxSizing:
      'border-box',
    fontSize:
      '10px',
    color:
      '#0f172a',
    background:
      '#ffffff'
  },

  selectWrapper: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '7px',
    background:
      '#ffffff',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '6px',
    padding:
      '0 9px',
    height:
      '34px',
    color:
      '#64748b'
  },

  select: {
    border:
      'none',
    outline:
      'none',
    background:
      'transparent',
    fontSize:
      '10px',
    color:
      '#334155',
    minWidth:
      '130px'
  },

  primaryButton: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    gap:
      '6px',
    background:
      '#1d4ed8',
    color:
      '#ffffff',
    border:
      'none',
    padding:
      '8px 12px',
    borderRadius:
      '6px',
    cursor:
      'pointer',
    fontSize:
      '10px',
    fontWeight:
      '700'
  },

  smallActionButton: {
    display:
      'inline-flex',
    alignItems:
      'center',
    gap:
      '5px',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    border:
      '1px solid #bfdbfe',
    padding:
      '5px 8px',
    borderRadius:
      '5px',
    cursor:
      'pointer',
    fontSize:
      '9px',
    fontWeight:
      '700'
  },

  monitorTopGrid: {
    display:
      'grid',
    gridTemplateColumns:
      '1fr',
    gap:
      '18px'
  },

  monitorCentreGrid: {
    padding:
      '16px',
    display:
      'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(260px, 1fr))',
    gap:
      '12px'
  },

  monitorCentreCard: {
    border:
      '1px solid #e2e8f0',
    borderRadius:
      '7px',
    padding:
      '13px',
    background:
      '#f8fafc'
  },

  cameraHeader: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '9px'
  },

  cameraIcon: {
    width:
      '34px',
    height:
      '34px',
    borderRadius:
      '6px',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center'
  },

  connectedBadge: {
    marginLeft:
      'auto',
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '4px',
    color:
      '#15803d',
    fontSize:
      '8px',
    fontWeight:
      '800'
  },

  cameraStats: {
    display:
      'grid',
    gridTemplateColumns:
      '1fr 1fr',
    gap:
      '8px',
    marginTop:
      '15px'
  },

  cameraStatsItem: {},

  cameraFooter: {
    marginTop:
      '12px',
    paddingTop:
      '8px',
    borderTop:
      '1px solid #e2e8f0',
    display:
      'flex',
    justifyContent:
      'space-between',
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  scanPlaceholder: {
    minHeight:
      '300px',
    padding:
      '30px',
    display:
      'flex',
    flexDirection:
      'column',
    alignItems:
      'center',
    justifyContent:
      'center',
    textAlign:
      'center'
  },

  scanPlaceholderIcon: {
    width:
      '64px',
    height:
      '64px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#eff6ff',
    color:
      '#1d4ed8',
    borderRadius:
      '10px',
    marginBottom:
      '12px'
  },

  scanPipeline: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '8px',
    flexWrap:
      'wrap',
    justifyContent:
      'center',
    marginTop:
      '18px',
    color:
      '#475569',
    fontSize:
      '9px',
    fontWeight:
      '700'
  },

  complianceCircleWrapper: {
    display:
      'flex',
    justifyContent:
      'center',
    padding:
      '25px'
  },

  complianceLegend: {
    padding:
      '0 20px 20px',
    display:
      'flex',
    flexDirection:
      'column',
    gap:
      '8px',
    fontSize:
      '9px',
    color:
      '#475569'
  },

  legendDot: {
    display:
      'inline-block',
    width:
      '7px',
    height:
      '7px',
    borderRadius:
      '50%',
    marginRight:
      '6px'
  },

  tableProgress: {
    width:
      '80px',
    height:
      '5px',
    background:
      '#e2e8f0',
    borderRadius:
      '3px',
    overflow:
      'hidden',
    marginBottom:
      '3px'
  },

  alertGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(310px, 1fr))',
    gap:
      '14px'
  },

  alertCard: {
    background:
      '#ffffff',
    border:
      '1px solid #e2e8f0',
    borderRadius:
      '7px',
    padding:
      '15px'
  },

  alertTop: {
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'center'
  },

  alertIconRow: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '10px',
    marginTop:
      '13px'
  },

  alertIcon: {
    width:
      '34px',
    height:
      '34px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#fff7ed',
    color:
      '#c2410c',
    borderRadius:
      '6px'
  },

  alertIconCritical: {
    width:
      '34px',
    height:
      '34px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#fef2f2',
    color:
      '#b91c1c',
    borderRadius:
      '6px'
  },

  alertTitle: {
    margin:
      0,
    fontSize:
      '12px',
    fontWeight:
      '800'
  },

  alertCentre: {
    margin:
      '2px 0 0',
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  alertDescription: {
    margin:
      '13px 0 10px',
    fontSize:
      '10px',
    lineHeight:
      '1.5',
    color:
      '#475569'
  },

  alertEvidence: {
    padding:
      '8px',
    background:
      '#f8fafc',
    border:
      '1px solid #e2e8f0',
    borderRadius:
      '5px',
    fontSize:
      '9px',
    color:
      '#475569'
  },

  alertActions: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap:
      '8px',
    marginTop:
      '12px'
  },

  alertSummary: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '6px',
    fontSize:
      '10px',
    color:
      '#991b1b',
    background:
      '#fef2f2',
    border:
      '1px solid #fecaca',
    borderRadius:
      '5px',
    padding:
      '7px 10px'
  },

  infoNotice: {
    display:
      'flex',
    alignItems:
      'flex-start',
    gap:
      '10px',
    padding:
      '12px',
    background:
      '#eff6ff',
    color:
      '#1e40af',
    border:
      '1px solid #bfdbfe',
    borderRadius:
      '6px',
    fontSize:
      '10px'
  },

  infoNoticeP: {
    margin:
      '4px 0 0'
  },

  backButton: {
    border:
      'none',
    background:
      'transparent',
    color:
      '#1d4ed8',
    cursor:
      'pointer',
    fontSize:
      '10px',
    fontWeight:
      '700',
    padding:
      '0',
    marginBottom:
      '15px'
  },

  detailHeader: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap:
      '20px',
    alignItems:
      'flex-start',
    background:
      '#ffffff',
    border:
      '1px solid #e2e8f0',
    borderRadius:
      '8px',
    padding:
      '18px',
    marginBottom:
      '15px'
  },

  detailEyebrow: {
    fontSize:
      '8px',
    color:
      '#64748b',
    fontWeight:
      '800',
    letterSpacing:
      '0.7px'
  },

  detailTitle: {
    margin:
      '4px 0 0',
    fontSize:
      '19px',
    fontWeight:
      '800'
  },

  detailSubtitle: {
    margin:
      '3px 0 0',
    fontSize:
      '9px',
    color:
      '#64748b'
  },

  evidenceList: {
    padding:
      '15px'
  },

  evidenceGallery: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },

  evidenceItem: {
    display:
      'flex',
    gap:
      '10px',
    padding:
      '11px 0',
    borderBottom:
      '1px solid #e2e8f0'
  },

  evidenceIcon: {
    width:
      '30px',
    height:
      '30px',
    flexShrink:
      0,
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#fef2f2',
    color:
      '#b91c1c',
    borderRadius:
      '5px'
  },

  submittedState: {
    minHeight:
      '270px',
    display:
      'flex',
    flexDirection:
      'column',
    alignItems:
      'center',
    justifyContent:
      'center',
    textAlign:
      'center',
    padding:
      '20px'
  },

  formLabel: {
    display:
      'block',
    margin:
      '15px 16px 6px',
    fontSize:
      '9px',
    fontWeight:
      '800',
    color:
      '#475569',
    textTransform:
      'uppercase'
  },

  textarea: {
    display:
      'block',
    width:
      'calc(100% - 32px)',
    margin:
      '0 16px',
    minHeight:
      '120px',
    resize:
      'vertical',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '6px',
    padding:
      '9px',
    outline:
      'none',
    fontSize:
      '10px',
    color:
      '#0f172a'
  },

  fullSelect: {
    display:
      'block',
    width:
      'calc(100% - 32px)',
    margin:
      '0 16px',
    height:
      '34px',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '6px',
    padding:
      '0 8px',
    outline:
      'none',
    fontSize:
      '10px'
  },

  reportGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'minmax(240px, 0.65fr) minmax(0, 1.35fr)',
    gap:
      '20px'
  },

  reportTypeList: {
    display:
      'flex',
    flexDirection:
      'column',
    gap:
      '8px'
  },

  reportType: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '10px',
    padding:
      '13px',
    border:
      '1px solid',
    borderRadius:
      '7px',
    cursor:
      'pointer',
    textAlign:
      'left'
  },

  reportIcon: {
    width:
      '32px',
    height:
      '32px',
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background:
      '#f8fafc',
    color:
      '#1d4ed8',
    borderRadius:
      '6px',
    flexShrink:
      0
  },

  reportTypeStrong: {},

  reportPreview: {
    margin:
      '18px',
    border:
      '1px solid #cbd5e1',
    minHeight:
      '270px',
    padding:
      '18px',
    background:
      '#ffffff'
  },

  reportHeader: {
    display:
      'flex',
    justifyContent:
      'space-between',
    alignItems:
      'center'
  },

  reportDivider: {
    height:
      '1px',
    background:
      '#e2e8f0',
    margin:
      '15px 0'
  },

  reportStats: {
    display:
      'grid',
    gridTemplateColumns:
      'repeat(3, minmax(0, 1fr))',
    gap:
      '10px'
  },

  reportDisclaimer: {
    marginTop:
      '18px',
    fontSize:
      '9px',
    lineHeight:
      '1.5',
    color:
      '#64748b'
  },

  reportActions: {
    display:
      'flex',
    gap:
      '8px',
    padding:
      '0 18px 18px'
  },

  settingsGrid: {
    display:
      'grid',
    gridTemplateColumns:
      'minmax(0, 1.2fr) minmax(300px, 0.8fr)',
    gap:
      '18px'
  },

  settingsBody: {
    padding:
      '4px 16px 18px'
  },

  settingRow: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap:
      '15px',
    padding:
      '14px 0',
    borderBottom:
      '1px solid #e2e8f0'
  },

  settingRowSpan: {
    display:
      'block',
    fontSize:
      '9px',
    color:
      '#64748b',
    marginTop:
      '3px'
  },

  numberInput: {
    width:
      '70px',
    height:
      '32px',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '5px',
    padding:
      '0 8px',
    textAlign:
      'center',
    outline:
      'none',
    fontSize:
      '10px'
  },

  smallSelect: {
    height:
      '32px',
    border:
      '1px solid #cbd5e1',
    borderRadius:
      '5px',
    padding:
      '0 7px',
    outline:
      'none',
    fontSize:
      '10px'
  },

  toggle: {
    width:
      '42px',
    height:
      '22px',
    border:
      'none',
    borderRadius:
      '20px',
    padding:
      '1px',
    cursor:
      'pointer',
    transition:
      'background 0.2s ease'
  },

  toggleKnob: {
    display:
      'block',
    width:
      '20px',
    height:
      '20px',
    background:
      '#ffffff',
    borderRadius:
      '50%',
    transition:
      'transform 0.2s ease'
  },

  successNotice: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '6px',
    marginTop:
      '10px',
    padding:
      '8px',
    background:
      '#f0fdf4',
    color:
      '#15803d',
    border:
      '1px solid #bbf7d0',
    borderRadius:
      '5px',
    fontSize:
      '9px',
    fontWeight:
      '700'
  },

  errorNotice: {
    marginTop: '10px',
    padding: '9px 11px',
    background: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '5px',
    fontSize: '11px',
  },

  configInput: {
    display: 'block',
    width: '100%',
    minHeight: '32px',
    marginTop: '5px',
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '5px',
    background: '#ffffff',
    color: '#0f172a',
    fontSize: '12px',
  },

  healthList: {
    padding:
      '6px 16px 16px'
  },

  healthRow: {
    display:
      'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    padding:
      '11px 0',
    borderBottom:
      '1px solid #e2e8f0'
  },

  healthLeft: {
    display:
      'flex',
    alignItems:
      'center',
    gap:
      '8px',
    color:
      '#334155',
    fontSize:
      '10px'
  },

  emptyState: {
    minHeight:
      '220px',
    display:
      'flex',
    flexDirection:
      'column',
    alignItems:
      'center',
    justifyContent:
      'center',
    textAlign:
      'center',
    color:
      '#475569',
    padding:
      '25px'
  },

  emptyIcon: {
    marginBottom:
      '10px',
    color:
      '#15803d'
  },

  loadingScreen: {
    display:
      'flex',
    flexDirection:
      'column',
    alignItems:
      'center',
    justifyContent:
      'center',
    height:
      '100vh',
    backgroundColor:
      '#f8fafc'
  },

  loadingText: {
    margin:
      '5px 0',
    fontSize:
      '11px',
    color:
      '#64748b'
  },

  /* Scan Modal Styles */
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    animation: 'fadeIn 0.2s ease',
  },

  modalContainer: {
    background: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '720px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    animation: 'slideUp 0.3s ease',
  },

  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f8fafc',
  },

  modalTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a',
  },

  modalClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    color: '#64748b',
    transition: 'background 0.15s',
  },

  modalBody: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },

  modalFooter: {
    padding: '16px 20px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    background: '#f8fafc',
  },

  scanStep: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },

  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },

  stepNumber: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: '#1d4ed8',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '12px',
  },

  stepTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a',
  },

  stepSubtitle: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  },

  cameraWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#0f172a',
  },

  cameraVideo: {
    width: '100%',
    display: 'block',
    transform: 'rotateY(0deg)',
  },

  cameraCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  captureButton: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: '4px solid #fff',
    background: '#1d4ed8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s, background 0.15s',
  },

  captureButtonActive: {
    transform: 'translateX(-50%) scale(0.92)',
    background: '#1e40af',
  },

  evidencePreview: {
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#f1f5f9',
  },

  evidenceImg: {
    width: '100%',
    display: 'block',
    borderRadius: '8px',
  },

  equipmentConfigGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },

  equipmentConfigItem: {
    padding: '12px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    textAlign: 'center',
  },

  equipmentConfigLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '6px',
  },

  equipmentConfigValue: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#0f172a',
  },

  detectionResultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '10px',
    marginTop: '12px',
  },

  detectionResultItem: {
    padding: '12px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    textAlign: 'center',
  },

  detectionResultLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '4px',
  },

  detectionResultValue: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#15803d',
  },

  detectionResultStatus: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '4px',
    display: 'inline-block',
    marginTop: '6px',
  },

  statusPass: {
    background: '#dcfce7',
    color: '#166534',
  },

  statusFail: {
    background: '#fee2e2',
    color: '#991b1b',
  },

  complianceCircle: {
    width: '140px',
    height: '140px',
    borderRadius: '50%',
    border: '8px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '8px',
    boxSizing: 'border-box',
    margin: '0 auto 16px',
  },

  complianceText: {
    fontSize: '24px',
    fontWeight: '800',
    lineHeight: 1,
  },

  complianceLabel: {
    fontSize: '8px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#64748b',
    marginTop: '4px',
    whiteSpace: 'nowrap',
  },

  progressSteps: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '24px',
    position: 'relative',
  },

  progressStepsBefore: {
    content: '""',
    position: 'absolute',
    top: '14px',
    left: '14px',
    right: '14px',
    height: '3px',
    background: '#e2e8f0',
    zIndex: 0,
  },

  progressStep: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
  },

  progressStepCircle: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: '#e2e8f0',
    border: '3px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '11px',
    color: '#94a3b8',
    transition: 'all 0.3s ease',
  },

  progressStepActive: {
    background: '#1d4ed8',
    borderColor: '#1d4ed8',
    color: '#fff',
  },

  progressStepDone: {
    background: '#15803d',
    borderColor: '#15803d',
    color: '#fff',
  },

  progressStepLabel: {
    fontSize: '9px',
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    maxWidth: '80px',
  },

  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background: '#fff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: '700',
  },

  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: '700',
  },

  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  scanProgress: {
    height: '6px',
    background: '#e2e8f0',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '16px',
  },

  scanProgressFill: {
    height: '100%',
    background: '#1d4ed8',
    borderRadius: '3px',
    transition: 'width 0.5s ease',
  },

  infoCard: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  },

  infoCardTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#1d4ed8',
    marginBottom: '4px',
  },

  infoCardText: {
    fontSize: '10px',
    color: '#1e40af',
    lineHeight: 1.5,
  },

  equipmentClassesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '10px',
    marginTop: '12px',
  },

  equipmentClassCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },

  equipmentClassName: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },

  equipmentClassDetected: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#0f172a',
  },

  equipmentClassRequired: {
    fontSize: '10px',
    color: '#94a3b8',
  },
};