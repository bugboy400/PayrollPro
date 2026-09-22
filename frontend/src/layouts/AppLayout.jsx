import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarDays,
  Wallet,
  FileText,
  Bell,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ClipboardList,
  BarChart3,
  TreePine,
  Download,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const primaryNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER'] },
  { to: '/attendance', label: 'Attendance', icon: Calendar, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/overtime', label: 'Overtime', icon: CalendarDays, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/leave', label: 'Leave', icon: CalendarDays, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/salary', label: 'Salary', icon: Wallet, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER'] },
  { to: '/payroll', label: 'Payroll', icon: FileText, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER'] },
  { to: '/payslips', label: 'Payslips', icon: FileText, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/performance', label: 'Performance', icon: BarChart3, roles: ['ADMIN', 'HR', 'EMPLOYEE'] },
  { to: '/holidays', label: 'Holidays', icon: TreePine, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
  { to: '/audit', label: 'Audit', icon: Shield, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER'] },
  { to: '/reports-analytics', label: 'Reports & Analytics', icon: Download, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER'] },
  { to: '/reports', label: 'Reports & Concerns', icon: ClipboardList, roles: ['ADMIN', 'HR', 'PAYROLL_MANAGER', 'EMPLOYEE'] },
];

const adminTabs = [
  { to: '/admin/account-limits', label: 'Account Limits' },
  { to: '/admin/company', label: 'Company Profile' },
  { to: '/admin/organization', label: 'Organization' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/permissions', label: 'Permissions' },
  { to: '/admin/records', label: 'Admin Records' },
];

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const isAdminSection = location.pathname.startsWith('/admin');

  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    toast.success('Signed out');
    navigate('/login');
  };

  const visible = primaryNav.filter((item) => hasRole(...item.roles));

  const displayName = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user?.email?.split('@')[0] || 'User';

  const roleLabel = user?.role?.replace('_', ' ') || '';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ========== SIDEBAR — fixed height, Settings/Logout always at bottom ========== */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[260px] flex-col bg-slate-900 text-slate-200 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: logo (fixed) */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
            P
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white leading-tight">PayrollPro</div>
            <div className="text-[11px] text-slate-400 leading-tight">Enterprise HR Suite</div>
          </div>
          <button className="ml-auto lg:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User card (fixed) */}
        <div className="shrink-0 mx-3 mb-3 rounded-xl bg-slate-800/80 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-slate-200">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">{roleLabel}</p>
            </div>
          </div>
        </div>

        {/* Middle: scrollable nav only */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
              {item.label}
            </NavLink>
          ))}

          {hasRole('ADMIN') && (
            <NavLink
              to="/admin/organization"
              className={() =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition ${
                  isAdminSection
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <Shield className="h-[18px] w-[18px] shrink-0 opacity-80" />
              Administration
            </NavLink>
          )}
        </nav>

        {/* Bottom: Settings + Sign out — ALWAYS pinned, never moves with page content */}
        <div className="shrink-0 border-t border-slate-800 px-3 py-3 space-y-0.5 bg-slate-900">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <Settings className="h-[18px] w-[18px] shrink-0 opacity-80" />
            Settings
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-slate-300 transition hover:bg-slate-800/70 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0 opacity-80" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ========== MAIN COLUMN ========== */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button type="button" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-slate-600" />
          </button>

          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            {isAdminSection ? (
              <>
                <span className="font-medium text-slate-800">Administration</span>
                <span className="text-slate-300">/</span>
                <span>PayrollPro workspace</span>
              </>
            ) : (
              <span className="font-medium text-slate-800 capitalize">
                {location.pathname === '/'
                  ? 'Dashboard'
                  : location.pathname.replace(/^\//, '').replace(/-/g, ' ')}
              </span>
            )}
          </div>

          <div className="flex-1" />

          <NavLink
            to="/notifications"
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Bell className="h-5 w-5" />
          </NavLink>

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-slate-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-slate-800 leading-tight">{displayName}</p>
                <p className="text-[11px] text-slate-500 leading-tight">{roleLabel}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{roleLabel}</p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/profile');
                    }}
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    Personal details
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                  >
                    <Settings className="h-4 w-4 text-slate-400" />
                    Settings
                  </button>
                </div>
                <div className="border-t border-slate-100 py-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Admin tabs */}
        {isAdminSection && hasRole('ADMIN') && (
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 lg:px-6">
            <div className="flex gap-1 overflow-x-auto py-2">
              {adminTabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Page content — only this area scrolls; sidebar bottom stays fixed */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
