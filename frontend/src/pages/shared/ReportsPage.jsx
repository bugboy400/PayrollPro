import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'HR');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [form, setForm] = useState({
    category: 'Payroll Issue',
    subject: '',
    description: '',
    priority: 'NORMAL',
    isConfidential: false,
  });

  const load = () => {
    setLoading(true);
    api
      .get('/reports/concerns')
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
      await api.post('/reports/concerns', form);
      toast.success('Report submitted');
      setShowForm(false);
      setForm({ category: 'Payroll Issue', subject: '', description: '', priority: 'NORMAL', isConfidential: false });
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/reports/concerns/${id}`);
      setDetail(data);
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const updateStatus = async (status) => {
    if (!detail) return;
    try {
      const { data } = await api.patch(`/reports/concerns/${detail.id}`, { status, message: comment || undefined });
      setDetail(data);
      toast.success('Updated');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const addComment = async () => {
    if (!detail || !comment.trim()) return;
    try {
      await api.post(`/reports/concerns/${detail.id}/comments`, { message: comment });
      toast.success('Comment added');
      setComment('');
      openDetail(detail.id);
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Concerns</h1>
          <p className="text-sm text-slate-500">Employee reports, complaints and resolution</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Submit report'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['Payroll Issue', 'Salary Discrepancy', 'Attendance', 'Leave', 'SSF/PF', 'Workplace', 'Harassment', 'Policy', 'Technical', 'Suggestion', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="NORMAL">Normal</option>
                <option value="IMPORTANT">Important</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Subject</label>
              <input className="input" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input min-h-[100px]" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isConfidential} onChange={(e) => setForm({ ...form, isConfidential: e.target.checked })} />
              Confidential
            </label>
          </div>
          <button type="submit" className="btn-primary">Submit report</button>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-400">No reports</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(r.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{r.reportCode}</td>
                    <td className="px-4 py-3 font-medium">{r.subject}</td>
                    <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-700">{r.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm min-h-[280px]">
          {!detail ? (
            <p className="text-slate-400">Select a report to view details</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-xs text-brand-600">{detail.reportCode}</p>
                <h2 className="text-lg font-semibold">{detail.subject}</h2>
                <p className="text-sm text-slate-500">{detail.category} · {detail.priority} · {detail.status}</p>
              </div>
              <p className="text-sm whitespace-pre-wrap">{detail.description}</p>
              {detail.updates?.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <h3 className="text-sm font-semibold">Updates</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.updates.map((u) => (
                      <li key={u.id} className="text-sm rounded-lg bg-slate-50 px-3 py-2">
                        <p>{u.message}</p>
                        <p className="text-xs text-slate-400">{u.user?.email} · {u.createdAt ? new Date(u.createdAt).toLocaleString() : ''}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <textarea className="input min-h-[70px]" placeholder="Comment or note" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={addComment}>Add comment</button>
                  {canManage && (
                    <>
                      <button type="button" className="btn-secondary text-xs" onClick={() => updateStatus('ACKNOWLEDGED')}>Acknowledge</button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => updateStatus('UNDER_REVIEW')}>Under review</button>
                      <button type="button" className="btn-primary text-xs" onClick={() => updateStatus('RESOLVED')}>Resolve</button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => updateStatus('CLOSED')}>Close</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
