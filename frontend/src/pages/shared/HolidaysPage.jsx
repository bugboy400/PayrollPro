import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function HolidaysPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', holidayDate: '', isPaid: true, type: 'PUBLIC', description: '' });

  const load = () => {
    setLoading(true);
    api
      .get('/holidays')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/holidays', form);
      toast.success('Holiday added');
      setShowForm(false);
      setForm({ name: '', holidayDate: '', isPaid: true, type: 'PUBLIC', description: '' });
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      await api.delete(`/holidays/${id}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Holiday Calendar</h1>
          <p className="text-sm text-slate-500">Public and company holidays</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add holiday'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Date</label><input type="date" className="input" required value={form.holidayDate} onChange={(e) => setForm({ ...form, holidayDate: e.target.value })} /></div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="PUBLIC">PUBLIC</option>
              <option value="COMPANY">COMPANY</option>
              <option value="OPTIONAL">OPTIONAL</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mt-6">
            <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} />
            Paid holiday
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Paid</th>
              {canManage && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No holidays configured</td></tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3">{h.holidayDate ? new Date(h.holidayDate).toLocaleDateString() : ''}</td>
                  <td className="px-4 py-3 font-medium">{h.name}</td>
                  <td className="px-4 py-3">{h.type}</td>
                  <td className="px-4 py-3">{h.isPaid ? 'Yes' : 'No'}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="text-sm text-red-600" onClick={() => remove(h.id)}>Delete</button>
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
