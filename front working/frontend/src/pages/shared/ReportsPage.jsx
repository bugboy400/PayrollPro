import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Concerns</h1>
          <p className="text-sm text-slate-500">Employee reports, complaints and resolution workflow</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Submit report'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {[
                  'Payroll Issue',
                  'Salary Discrepancy',
                  'Attendance',
                  'Leave',
                  'SSF/PF',
                  'Workplace',
                  'Harassment',
                  'Policy',
                  'Technical',
                  'Suggestion',
                  'Other',
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="NORMAL">Normal</option>
                <option value="IMPORTANT">Important</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Subject</label>
              <input
                className="input"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea
                className="input min-h-[100px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isConfidential}
                onChange={(e) => setForm({ ...form, isConfidential: e.target.checked })}
              />
              Mark as confidential
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Submit report
          </button>
        </form>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
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
                  No reports
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs text-brand-600">{r.reportCode}</td>
                  <td className="px-4 py-3 font-medium">{r.subject}</td>
                  <td className="px-4 py-3">{r.category}</td>
                  <td className="px-4 py-3">{r.priority}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800">{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
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
