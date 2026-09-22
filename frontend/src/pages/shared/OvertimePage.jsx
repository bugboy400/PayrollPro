import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function OvertimePage() {
  const { hasRole } = useAuth();
  const canApprove = hasRole('ADMIN', 'HR');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ overtimeDate: '', durationHours: '', reason: '' });

  const load = () => {
    setLoading(true);
    api
      .get('/overtime')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/overtime', {
        overtimeDate: form.overtimeDate,
        durationHours: Number(form.durationHours),
        reason: form.reason,
      });
      toast.success('Overtime requested');
      setShowForm(false);
      setForm({ overtimeDate: '', durationHours: '', reason: '' });
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const act = async (id, action) => {
    try {
      if (action === 'approve') await api.post(`/overtime/${id}/approve`);
      else {
        const rejectedReason = window.prompt('Rejection reason') || '';
        await api.post(`/overtime/${id}/reject`, { rejectedReason });
      }
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Overtime</h1>
          <p className="text-sm text-slate-500">Requests and approvals</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Request overtime'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" required value={form.overtimeDate} onChange={(e) => setForm({ ...form, overtimeDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Hours</label>
            <input type="number" step="0.25" className="input" required value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <input className="input" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Submit</button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              {canApprove && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No overtime requests</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.employee?.employeeCode} {r.employee?.firstName} {r.employee?.lastName}</td>
                  <td className="px-4 py-3">{r.overtimeDate ? new Date(r.overtimeDate).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">{Number(r.durationHours)}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.reason}</td>
                  <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-700">{r.status}</span></td>
                  {canApprove && (
                    <td className="px-4 py-3">
                      {r.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary text-xs" onClick={() => act(r.id, 'approve')}>Approve</button>
                          <button type="button" className="btn-secondary text-xs" onClick={() => act(r.id, 'reject')}>Reject</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
