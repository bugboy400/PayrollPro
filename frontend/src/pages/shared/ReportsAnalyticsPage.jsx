import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Download } from 'lucide-react';

export default function ReportsAnalyticsPage() {
  const { hasRole } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/dashboard')
      .then(({ data }) => setDashboard(data))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  const exportPayrollCsv = async () => {
    try {
      const res = await api.get('/reports/payroll.csv', {
        params: { year, month },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${year}-${String(month).padStart(2, '0')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Payroll CSV downloaded');
    } catch (err) {
      toast.error(getError(err) || 'Could not export payroll CSV');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <p className="text-sm text-slate-500">
          Operational reports and exports (separate from employee concerns)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Employees', dashboard?.totalEmployees ?? dashboard?.employees ?? '—'],
          ['Active', dashboard?.activeEmployees ?? '—'],
          ['Pending leave', dashboard?.pendingLeaves ?? dashboard?.leavePending ?? '—'],
          ['Open concerns', dashboard?.openReports ?? dashboard?.reportsOpen ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{loading ? '…' : value}</p>
          </div>
        ))}
      </div>

      {hasRole('ADMIN', 'HR', 'PAYROLL_MANAGER') && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Payroll export</h2>
          <p className="mt-1 text-sm text-slate-500">
            Download payroll CSV for a period via <code className="text-xs">GET /api/reports/payroll.csv</code>
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Year</label>
              <input
                type="number"
                className="input w-28"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Month</label>
              <input
                type="number"
                min={1}
                max={12}
                className="input w-24"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </div>
            <button type="button" className="btn-primary" onClick={exportPayrollCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Available analytics areas</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Workforce / employee counts (dashboard)</li>
          <li>Payroll period export (CSV)</li>
          <li>Audit trail (Administration → Admin Records / Audit)</li>
          <li>Leave & attendance summaries (via those modules)</li>
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          Employee complaints and concerns are under <strong>Reports & Concerns</strong>, not this page.
        </p>
      </section>
    </div>
  );
}
