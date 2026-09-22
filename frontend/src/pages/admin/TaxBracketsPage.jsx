import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function TaxBracketsPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: '',
    lowerBound: '',
    upperBound: '',
    rate: '',
    fixedTax: 0,
    effectiveFrom: '',
    isActive: true,
  });

  const load = () => {
    setLoading(true);
    api
      .get('/tax-brackets')
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
      await api.post('/tax-brackets', {
        ...form,
        lowerBound: Number(form.lowerBound),
        upperBound: form.upperBound === '' ? null : Number(form.upperBound),
        rate: Number(form.rate),
        fixedTax: Number(form.fixedTax || 0),
      });
      toast.success('Tax bracket created');
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tax Brackets</h1>
          <p className="text-sm text-slate-500">Configurable progressive tax rules</p>
        </div>
        {hasRole('ADMIN') && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add bracket'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <div><label className="label">Label</label><input className="input" required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div><label className="label">Effective from</label><input type="date" className="input" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div><label className="label">Lower bound</label><input type="number" className="input" required value={form.lowerBound} onChange={(e) => setForm({ ...form, lowerBound: e.target.value })} /></div>
          <div><label className="label">Upper bound (empty = open)</label><input type="number" className="input" value={form.upperBound} onChange={(e) => setForm({ ...form, upperBound: e.target.value })} /></div>
          <div><label className="label">Rate (e.g. 0.1 for 10%)</label><input type="number" step="0.0001" className="input" required value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          <div><label className="label">Fixed tax</label><input type="number" className="input" value={form.fixedTax} onChange={(e) => setForm({ ...form, fixedTax: e.target.value })} /></div>
          <div className="sm:col-span-2"><button type="submit" className="btn-primary">Create</button></div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Lower</th>
              <th className="px-4 py-3">Upper</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Fixed</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No tax brackets</td></tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-medium">{b.label}</td>
                  <td className="px-4 py-3">{Number(b.lowerBound).toLocaleString()}</td>
                  <td className="px-4 py-3">{b.upperBound != null ? Number(b.upperBound).toLocaleString() : '∞'}</td>
                  <td className="px-4 py-3">{(Number(b.rate) * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3">{Number(b.fixedTax || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">{b.effectiveFrom ? new Date(b.effectiveFrom).toLocaleDateString() : ''}</td>
                  <td className="px-4 py-3">{b.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
