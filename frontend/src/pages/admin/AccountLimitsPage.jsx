import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getError } from '../../api/client';

export default function AccountLimitsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({});

  useEffect(() => {
    api
      .get('/admin/account-limits')
      .then(({ data }) => {
        setData(data);
        setForm({
          maxAdmins: data.limits?.maxAdmins,
          maxHr: data.limits?.maxHr,
          maxPayrollManagers: data.limits?.maxPayrollManagers,
        });
      })
      .catch((err) => toast.error(getError(err)))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data: updated } = await api.patch('/admin/account-limits', form);
      setData((d) => ({ ...d, limits: updated }));
      toast.success('Limits updated');
    } catch (err) {
      toast.error(getError(err));
    }
  };

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Limits</h1>
        <p className="text-sm text-slate-500">Only active accounts count toward limits</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['ADMIN', 'Admin', data.active?.ADMIN, data.limits?.maxAdmins],
          ['HR', 'HR', data.active?.HR, data.limits?.maxHr],
          ['PAYROLL_MANAGER', 'Payroll Manager', data.active?.PAYROLL_MANAGER, data.limits?.maxPayrollManagers],
        ].map(([key, label, current, max]) => (
          <div key={key} className="card text-center">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">
              {current} <span className="text-base font-normal text-slate-400">/ {max}</span>
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="card space-y-4">
        <div>
          <label className="label">Max Admins</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.maxAdmins ?? ''}
            onChange={(e) => setForm({ ...form, maxAdmins: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Max HR</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.maxHr ?? ''}
            onChange={(e) => setForm({ ...form, maxHr: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Max Payroll Managers</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.maxPayrollManagers ?? ''}
            onChange={(e) => setForm({ ...form, maxPayrollManagers: Number(e.target.value) })}
          />
        </div>
        <button type="submit" className="btn-primary">
          Save limits
        </button>
      </form>
    </div>
  );
}
