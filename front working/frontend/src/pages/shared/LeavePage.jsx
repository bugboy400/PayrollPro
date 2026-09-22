import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function LeavePage() {
  const { hasRole, user } = useAuth();
  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '', payment: 'PAID' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get('/leaves', { params: { limit: 100 } })
      .then(({ data }) => setRows(Array.isArray(data) ? data : data.data || []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/leave-types').then(({ data }) => setTypes(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const submitLeave = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leaves', {
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        payment: form.payment,
      });
      toast.success('Leave request submitted');
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const statusColor = (s) => {
    const map = {
      PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      APPROVED: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      CANCELLED: 'bg-slate-100 text-slate-600',
      PROPOSED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave</h1>
          <p className="text-sm text-slate-500">Requests, balances and approvals</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Submit leave'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitLeave} className="card grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Leave type</label>
            <select className="input" required value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Payment</label>
            <select className="input" value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })}>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>
          <div>
            <label className="label">Start</label>
            <input type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="date" className="input" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Submit request</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No leave requests
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {r.employee?.employeeCode} {r.employee?.firstName} {r.employee?.lastName}
                    </td>
                    <td className="px-4 py-3">{r.leaveType?.name || r.leaveTypeId}</td>
                    <td className="px-4 py-3">
                      {r.startDate ? new Date(r.startDate).toLocaleDateString() : ''} –{' '}
                      {r.endDate ? new Date(r.endDate).toLocaleDateString() : ''}
                    </td>
                    <td className="px-4 py-3">{Number(r.days)}</td>
                    <td className="px-4 py-3">{r.payment}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${statusColor(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
