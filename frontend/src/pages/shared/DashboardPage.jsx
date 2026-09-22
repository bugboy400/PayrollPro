import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api, { getError } from '../../api/client';
import { Users, Wallet, CalendarDays, FileText, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="card flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">{value ?? '—'}</p>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/dashboard')
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  const name = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user?.email?.split('@')[0] || 'User';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome, {name}</h1>
        <p className="text-sm text-slate-500">
          {user?.role?.replace('_', ' ')} · {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {hasRole('ADMIN', 'HR', 'PAYROLL_MANAGER') && (
          <>
            <StatCard title="Total Employees" value={data?.totalEmployees ?? data?.employees} icon={Users} />
            <StatCard title="Active Employees" value={data?.activeEmployees} icon={Users} subtitle="Currently active" />
          </>
        )}
        {hasRole('ADMIN', 'HR', 'PAYROLL_MANAGER') && (
          <StatCard title="Pending Payroll" value={data?.pendingPayroll ?? data?.payrollPending} icon={Wallet} />
        )}
        {hasRole('ADMIN', 'HR') && (
          <StatCard title="Pending Leave" value={data?.pendingLeaves ?? data?.leavePending} icon={CalendarDays} />
        )}
        {hasRole('EMPLOYEE') && (
          <>
            <StatCard title="Leave Balance" value={data?.leaveBalance ?? '—'} icon={CalendarDays} />
            <StatCard title="Latest Payslip" value={data?.latestPayslipPeriod || '—'} icon={FileText} />
          </>
        )}
        <StatCard title="Open Reports" value={data?.openReports ?? data?.reportsOpen} icon={AlertCircle} />
      </div>

      {data?.recentActivity?.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {data.recentActivity.slice(0, 8).map((item, i) => (
              <li key={i} className="flex items-center justify-between py-3 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{item.action || item.message}</span>
                <span className="text-xs text-slate-400">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!data && (
        <div className="card text-center text-slate-500">
          Dashboard data will appear once the API returns metrics for your role.
        </div>
      )}
    </div>
  );
}
