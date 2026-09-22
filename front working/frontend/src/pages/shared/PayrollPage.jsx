import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function PayrollPage() {
  const { hasRole } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const load = () => {
    setLoading(true);
    api
      .get('/payroll')
      .then(({ data }) => setPeriods(Array.isArray(data) ? data : data.data || []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const processPayroll = async () => {
    setProcessing(true);
    try {
      await api.post('/payroll/process', { year, month });
      toast.success('Payroll processed');
      load();
    } catch (err) {
      toast.error(getError(err));
    } finally {
      setProcessing(false);
    }
  };

  const action = async (id, endpoint, label) => {
    try {
      await api.post(`/payroll/${id}/${endpoint}`);
      toast.success(label);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const statusColor = (s) => {
    const map = {
      DRAFT: 'bg-slate-100 text-slate-600',
      PROCESSED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
      HR_APPROVED: 'bg-indigo-100 text-indigo-800',
      ADMIN_APPROVED: 'bg-purple-100 text-purple-800',
      PAID: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      LOCKED: 'bg-slate-800 text-white',
    };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-sm text-slate-500">Process → HR → Admin → Pay → Lock</p>
        </div>
        {hasRole('PAYROLL_MANAGER', 'ADMIN') && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Year</label>
              <input
                type="number"
                className="input w-24"
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
                className="input w-20"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </div>
            <button className="btn-primary" disabled={processing} onClick={processPayroll}>
              {processing ? 'Processing…' : 'Process payroll'}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Records</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : periods.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                  No payroll periods yet
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">
                    {p.year}-{String(p.month).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusColor(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">{p._count?.records ?? p.records?.length ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {p.status === 'PROCESSED' && hasRole('HR', 'ADMIN') && (
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => action(p.id, 'hr-approve', 'HR approved')}
                        >
                          HR Approve
                        </button>
                      )}
                      {p.status === 'HR_APPROVED' && hasRole('ADMIN') && (
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => action(p.id, 'admin-approve', 'Admin approved')}
                        >
                          Admin Approve
                        </button>
                      )}
                      {p.status === 'ADMIN_APPROVED' && hasRole('PAYROLL_MANAGER', 'ADMIN') && (
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => action(p.id, 'pay', 'Marked paid')}
                        >
                          Mark Paid
                        </button>
                      )}
                      {p.status === 'PAID' && hasRole('PAYROLL_MANAGER', 'ADMIN') && (
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => action(p.id, 'lock', 'Locked')}
                        >
                          Lock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
