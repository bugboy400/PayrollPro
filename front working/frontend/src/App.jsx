import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import SetupPage from './pages/auth/SetupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/shared/DashboardPage';
import EmployeesPage from './pages/shared/EmployeesPage';
import EmployeeDetailPage from './pages/shared/EmployeeDetailPage';
import AttendancePage from './pages/shared/AttendancePage';
import LeavePage from './pages/shared/LeavePage';
import SalaryPage from './pages/shared/SalaryPage';
import PayrollPage from './pages/shared/PayrollPage';
import PayslipsPage from './pages/shared/PayslipsPage';
import UsersPage from './pages/admin/UsersPage';
import CompanyPage from './pages/admin/CompanyPage';
import AccountLimitsPage from './pages/admin/AccountLimitsPage';
import AuditPage from './pages/admin/AuditPage';
import PermissionsPage from './pages/admin/PermissionsPage';
import ReportsPage from './pages/shared/ReportsPage';
import ReportsAnalyticsPage from './pages/shared/ReportsAnalyticsPage';
import SettingsPage from './pages/shared/SettingsPage';
import NotificationsPage from './pages/shared/NotificationsPage';
import ProfilePage from './pages/shared/ProfilePage';
import TaxBracketsPage from './pages/admin/TaxBracketsPage';
import OrgPage from './pages/admin/OrgPage';
import HolidaysPage from './pages/shared/HolidaysPage';
import PerformancePage from './pages/shared/PerformancePage';
import LoadingScreen from './components/LoadingScreen';

function Protected({ children, roles }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="salary" element={<SalaryPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="payslips" element={<PayslipsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports-analytics" element={<ReportsAnalyticsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="holidays" element={<HolidaysPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="audit" element={<AuditPage />} />

        <Route path="admin/account-limits" element={<Protected roles={['ADMIN']}><AccountLimitsPage /></Protected>} />
        <Route path="admin/company" element={<Protected roles={['ADMIN']}><CompanyPage /></Protected>} />
        <Route path="admin/organization" element={<Protected roles={['ADMIN', 'HR']}><OrgPage /></Protected>} />
        <Route path="admin/users" element={<Protected roles={['ADMIN']}><UsersPage /></Protected>} />
        <Route path="admin/permissions" element={<Protected roles={['ADMIN']}><PermissionsPage /></Protected>} />
        <Route path="admin/records" element={<Protected roles={['ADMIN']}><AuditPage /></Protected>} />
        <Route path="admin/tax-brackets" element={<Protected roles={['ADMIN']}><TaxBracketsPage /></Protected>} />

        <Route path="users" element={<Navigate to="/admin/users" replace />} />
        <Route path="company" element={<Navigate to="/admin/company" replace />} />
        <Route path="account-limits" element={<Navigate to="/admin/account-limits" replace />} />
        <Route path="org" element={<Navigate to="/admin/organization" replace />} />
        <Route path="tax-brackets" element={<Navigate to="/admin/tax-brackets" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
